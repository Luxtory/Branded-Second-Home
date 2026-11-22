-- migrate:up
-- W16 (REQ-013, REQ-052; TECH-030, TECH-031, TECH-033, TECH-051, TECH-052, TECH-053; BR-180–182; ADR-0032 §1–§5;
-- spec pricing §5): PRL por Second Home e data. `app.prl_publication` é o ato autorizado (tipo, início de vigência,
-- autoridade, base, autor, instante e operação); `app.prl` é uma versão do PRL de uma noite, em unidade mínima + BRL.
-- Publicado = registrado (não há rascunho no `01/02`). A regra é decidida por noite no banco: a publicação `initial`
-- (`publish_initial_prl`, Admin ou Super Admin) só aceita noites sem PRL; a `change` (`change_published_prl`, só Super
-- Admin, BR-181) só aceita noites publicadas. Mistura é recusada.
--
-- Vigência (BR-182, ADR-0030 §3 reaproveitada): início carimbado pelo banco depois da trava, nunca retroativo e
-- estritamente posterior ao último início da noite (inclusive versão futura agendada). O `effective_to` da TECH-030 é
-- derivado em `app.prl_version` (início da versão seguinte da mesma noite): gravá-lo seria UPDATE em versão (TECH-052),
-- e o canônico não prevê retirada de PRL. Nada é alterado ou apagado; nenhum valor é gravado aqui (TECH-001).

-- Autoridade revalidada na transação: a atribuição de staff ativa do papel exercido, sob a trava compartilhada da
-- atribuição (a revogação toma a exclusiva). `initial`: `admin` ou `super_admin`; `change`: só `super_admin`.
CREATE FUNCTION app.lock_prl_authority(p_operation app.operation) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_role uuid; v_accepted text[];
BEGIN
  v_accepted := CASE p_operation.command
    WHEN 'publish_initial_prl' THEN ARRAY['admin', 'super_admin']
    WHEN 'change_published_prl' THEN ARRAY['super_admin']
  END;
  IF v_accepted IS NULL OR NOT (p_operation.role::text = ANY (v_accepted)) OR p_operation.actor_user_id IS NULL
     OR p_operation.authorization_ref !~* '^staff_role:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'the operation is not authorized by a staff assignment accepted for this PRL command'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_staff_role';
  END IF;
  v_role := lower(substr(p_operation.authorization_ref, 12))::uuid;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('app.staff_role:' || v_role::text, 0));
  IF NOT EXISTS (SELECT 1 FROM app.staff_role
                  WHERE id = v_role AND user_id = p_operation.actor_user_id AND role = p_operation.role
                    AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'the staff assignment of the operation is not active for its role'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_staff_role';
  END IF;
END $$;

CREATE TABLE app.prl_publication (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  kind text NOT NULL,
  -- Sem início informado, o banco carimba o instante da gravação (depois da trava).
  effective_from timestamptz NOT NULL,
  -- Autoridade e autor vêm da operação (guard do servidor), nunca da entrada; base registrada obrigatória (TECH-051).
  authority text NOT NULL,
  authorization_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT prl_publication_kind_check CHECK (kind IN ('initial', 'change')),
  CONSTRAINT prl_publication_authority_check CHECK (authority IN ('admin', 'super_admin')),
  CONSTRAINT prl_publication_change_authority CHECK (kind <> 'change' OR authority = 'super_admin'),
  CONSTRAINT prl_publication_authorization_ref_check CHECK (length(btrim(authorization_ref)) BETWEEN 1 AND 255),
  -- Alvo da FK composta das versões: a noite herda a Second Home e a vigência da publicação.
  CONSTRAINT prl_publication_scope_key UNIQUE (id, second_home_id, effective_from)
);

CREATE TABLE app.prl (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL,
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  -- Unidade mínima da moeda (TECH-033); limite técnico de 15 dígitos (exato também como número em JS).
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  effective_from timestamptz NOT NULL,
  CONSTRAINT prl_publication_fk FOREIGN KEY (publication_id, second_home_id, effective_from)
    REFERENCES app.prl_publication (id, second_home_id, effective_from),
  -- Só noite selada da Second Home (Data da Second Home, W10).
  CONSTRAINT prl_second_home_date_fk FOREIGN KEY (second_home_id, stay_date)
    REFERENCES app.second_home_date (second_home_id, stay_date),
  CONSTRAINT prl_amount_check CHECK (amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT prl_currency_check CHECK (currency = 'BRL'),
  CONSTRAINT prl_publication_night_key UNIQUE (publication_id, stay_date),
  CONSTRAINT conflict_prl_scope_start UNIQUE (second_home_id, stay_date, effective_from)
);

-- Procedência, autoridade e vigência no instante da gravação, sob a trava exclusiva da Second Home: publicações da
-- mesma Second Home se serializam e a segunda enxerga a primeira (READ COMMITTED); leituras em vigor tomam a mesma
-- trava em modo compartilhado.
CREATE FUNCTION app.prl_publication_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; v_at timestamptz;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF NOT ((op.command = 'publish_initial_prl' AND NEW.kind = 'initial')
          OR (op.command = 'change_published_prl' AND NEW.kind = 'change'))
     OR op.second_home_id IS DISTINCT FROM NEW.second_home_id
     OR NEW.authority IS DISTINCT FROM op.role::text OR NEW.created_by IS DISTINCT FROM op.actor_user_id THEN
    RAISE EXCEPTION 'a PRL publication is recorded by its own command operation, with its authority and author'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'prl_publication_provenance';
  END IF;
  PERFORM app.lock_prl_authority(op);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.prl:' || NEW.second_home_id::text, 0));
  v_at := clock_timestamp();
  NEW.created_at := v_at;
  IF NEW.effective_from IS NULL THEN
    NEW.effective_from := v_at;
  ELSIF NEW.effective_from < v_at THEN
    RAISE EXCEPTION 'a PRL publication never starts in the past'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_prl_retroactive';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prl_publication_insert BEFORE INSERT ON app.prl_publication
  FOR EACH ROW EXECUTE FUNCTION app.prl_publication_insert();

-- Uma versão por noite, só enquanto a operação da publicação está em curso (mesma transação). A noite herda a
-- vigência da publicação; `initial` só em noite sem PRL, `change` só em noite publicada, sempre depois do último início.
CREATE FUNCTION app.prl_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE pub app.prl_publication; latest app.prl;
BEGIN
  SELECT * INTO pub FROM app.prl_publication WHERE id = NEW.publication_id;
  IF NOT FOUND OR NEW.second_home_id IS DISTINCT FROM pub.second_home_id THEN
    RAISE EXCEPTION 'a PRL version belongs to a publication of the same Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'prl_publication_provenance';
  END IF;
  PERFORM app.assert_operation_in_transaction(pub.operation_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.prl:' || pub.second_home_id::text, 0));
  NEW.effective_from := pub.effective_from;
  SELECT * INTO latest FROM app.prl
   WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date
   ORDER BY effective_from DESC LIMIT 1;
  IF pub.kind = 'initial' AND FOUND THEN
    RAISE EXCEPTION 'the initial PRL is published only for nights without PRL; changing it is a Super Admin change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_prl_already_published';
  ELSIF pub.kind = 'change' AND NOT FOUND THEN
    RAISE EXCEPTION 'a PRL change applies only to nights with a published PRL'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_prl_not_published';
  ELSIF FOUND AND NEW.effective_from <= latest.effective_from THEN
    RAISE EXCEPTION 'a PRL version starts after every start of its night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_prl_overlap';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prl_insert BEFORE INSERT ON app.prl
  FOR EACH ROW EXECUTE FUNCTION app.prl_insert();

-- Publicação e noites atômicas: no commit, cada publicação tem de 1 a 366 noites (nenhum cabeçalho sem noites).
CREATE FUNCTION app.prl_publication_complete() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_nights bigint;
BEGIN
  SELECT count(*) INTO v_nights FROM app.prl WHERE publication_id = NEW.id;
  IF v_nights NOT BETWEEN 1 AND 366 THEN
    RAISE EXCEPTION 'a PRL publication records between 1 and 366 nights in its own transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'prl_publication_nights';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER prl_publication_complete AFTER INSERT ON app.prl_publication
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.prl_publication_complete();

CREATE TRIGGER prl_publication_no_update BEFORE UPDATE ON app.prl_publication
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER prl_publication_no_delete BEFORE DELETE ON app.prl_publication
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER prl_publication_no_truncate BEFORE TRUNCATE ON app.prl_publication
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER prl_no_update BEFORE UPDATE ON app.prl
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER prl_no_delete BEFORE DELETE ON app.prl
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER prl_no_truncate BEFORE TRUNCATE ON app.prl
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Histórico: cada versão com os metadados da publicação e o `effective_to` derivado (TECH-030): o início da versão
-- seguinte da mesma noite; nulo = sem sucessora. Intervalos `[effective_from, effective_to)` disjuntos por construção.
CREATE VIEW app.prl_version WITH (security_invoker = true) AS
SELECT l.id, l.publication_id, l.second_home_id, l.stay_date, l.amount_minor, l.currency, l.effective_from,
       lead(l.effective_from) OVER (PARTITION BY l.second_home_id, l.stay_date ORDER BY l.effective_from)
         AS effective_to,
       p.kind, p.authority, p.authorization_ref, p.created_at, p.created_by, p.operation_id
  FROM app.prl l
  JOIN app.prl_publication p ON p.id = l.publication_id;

-- Versão de uma noite vigente num instante (histórica, sem trava): a de maior início ≤ instante. Nenhuma linha = sem
-- PRL aplicável (ERR_PRL_MISSING); zero ou padrão nunca são presumidos.
CREATE FUNCTION app.prl_at(p_second_home_id uuid, p_stay_date date, p_at timestamptz)
  RETURNS SETOF app.prl
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT l.* FROM app.prl l
   WHERE l.second_home_id = p_second_home_id AND l.stay_date = p_stay_date AND l.effective_from <= p_at
   ORDER BY l.effective_from DESC LIMIT 1
$$;

-- PRL em vigor de cada noite de `[checkin, checkout)` (REQ-052; contrato `EconomicTerms`, ADR-0032 §8): trava
-- compartilhada da Second Home e instante de resolução lido do banco depois dela. Toda noite volta, e `prl_id` nulo
-- marca a noite sem PRL aplicável — a decisão de recusa (ERR_PRL_MISSING) é do command. Até 366 noites.
CREATE FUNCTION app.prl_period_in_force(p_second_home_id uuid, p_checkin date, p_checkout date)
  RETURNS TABLE (stay_date date, prl_id uuid, amount_minor bigint, currency text, resolved_at timestamptz)
  LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_at timestamptz;
BEGIN
  IF p_second_home_id IS NULL OR p_checkin IS NULL OR p_checkout IS NULL OR p_checkout <= p_checkin
     OR p_checkout - p_checkin > 366 THEN
    RAISE EXCEPTION 'a PRL period has from 1 to 366 nights of one Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'prl_period_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('app.prl:' || p_second_home_id::text, 0));
  v_at := clock_timestamp();
  RETURN QUERY
    SELECT n.night::date, v.id, v.amount_minor, v.currency, v_at
      FROM generate_series(p_checkin::timestamp, (p_checkout - 1)::timestamp, interval '1 day') AS n(night)
      LEFT JOIN LATERAL (
        SELECT l.id, l.amount_minor, l.currency FROM app.prl l
         WHERE l.second_home_id = p_second_home_id AND l.stay_date = n.night::date AND l.effective_from <= v_at
         ORDER BY l.effective_from DESC LIMIT 1
      ) v ON true
     ORDER BY n.night;
END $$;

REVOKE ALL ON FUNCTION app.lock_prl_authority(app.operation), app.prl_publication_insert(), app.prl_insert(),
  app.prl_publication_complete(), app.prl_at(uuid, date, timestamptz), app.prl_period_in_force(uuid, date, date)
  FROM PUBLIC;
-- O gatilho roda com o papel de quem insere: o `luxtory_app` precisa executar a revalidação de autoridade.
GRANT EXECUTE ON FUNCTION app.lock_prl_authority(app.operation), app.prl_at(uuid, date, timestamptz),
  app.prl_period_in_force(uuid, date, date) TO luxtory_app;

-- Só o servidor lê e grava (REQ-100: nenhum preço por noite ao Titular); nada para `authenticated` ou `anon`.
ALTER TABLE app.prl_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prl ENABLE ROW LEVEL SECURITY;
CREATE POLICY prl_publication_app_read ON app.prl_publication FOR SELECT TO luxtory_app USING (true);
CREATE POLICY prl_publication_app_insert ON app.prl_publication FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY prl_app_read ON app.prl FOR SELECT TO luxtory_app USING (true);
CREATE POLICY prl_app_insert ON app.prl FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.prl_publication, app.prl TO luxtory_app;
GRANT SELECT ON app.prl_version TO luxtory_app;


-- migrate:down
-- Histórico de PRL nunca é descartado por rollback (TECH-052): com qualquer publicação gravada, a reversão é recusada.
-- A trava exclusiva espera publicações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.prl_publication, app.prl IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.prl_publication) OR EXISTS (SELECT 1 FROM app.prl) THEN
    RAISE EXCEPTION 'W16 rollback would discard the PRL history';
  END IF;
END $$;
DROP FUNCTION app.prl_period_in_force(uuid, date, date);
DROP FUNCTION app.prl_at(uuid, date, timestamptz);
DROP VIEW app.prl_version;
DROP TABLE app.prl;
DROP TABLE app.prl_publication;
DROP FUNCTION app.prl_publication_complete();
DROP FUNCTION app.prl_insert();
DROP FUNCTION app.prl_publication_insert();
DROP FUNCTION app.lock_prl_authority(app.operation);
