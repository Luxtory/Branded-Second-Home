-- migrate:up
-- W14 (TECH-030, TECH-051, TECH-052; REQ-095, REQ-092; ADR-0030 §3; spec admin §5): versões de parâmetro só por
-- inserção. Na W14 a lista fechada de chaves tem só `guest_rules` (texto por Second Home; conteúdo em P-5); W15/W16
-- ampliam a lista por migration própria. Nenhum valor é presumido (TECH-001): sem versão vigente, a função que depende
-- do parâmetro recusa com ERR_PARAMETER_MISSING.
--
-- Vigência (ADR-0030 §3): cada versão grava `effective_from` e, opcionalmente, um `effective_to` explícito. Uma nova
-- versão do mesmo escopo (chave + Second Home) só é aceita se começar depois de todos os inícios existentes, não antes
-- do instante da gravação e não antes do `effective_to` explícito da versão mais recente: uma publicação nunca antecipa
-- um término expressamente estabelecido. Sem `effective_to`, a versão vale até o início da seguinte (fim derivado,
-- `app.parameter_version.effective_until`). Por indução os intervalos `[effective_from, effective_until)` são
-- disjuntos, inclusive os futuros, e nenhuma linha é alterada depois de gravada.
CREATE TABLE app.parameter (
  id uuid PRIMARY KEY,
  key text NOT NULL,
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  value text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  -- Autoridade e autor vêm da operação (guard do servidor), nunca da entrada; base registrada obrigatória (TECH-051).
  authority text NOT NULL,
  authorization_ref text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  CONSTRAINT parameter_key_check CHECK (key IN ('guest_rules')),
  CONSTRAINT parameter_guest_rules_text CHECK (key <> 'guest_rules' OR length(btrim(value)) BETWEEN 1 AND 20000),
  CONSTRAINT parameter_authority_check CHECK (authority IN ('admin')),
  CONSTRAINT parameter_authorization_ref_check CHECK (length(btrim(authorization_ref)) BETWEEN 1 AND 255),
  CONSTRAINT conflict_parameter_period CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT conflict_parameter_scope_start UNIQUE (key, second_home_id, effective_from),
  -- Alvo da FK composta da declaração de convidados (mesma chave e mesma Second Home).
  CONSTRAINT parameter_id_scope_key UNIQUE (id, key, second_home_id)
);

-- Procedência, autoridade e vigência no instante da gravação, sob trava exclusiva do escopo: duas publicações do mesmo
-- escopo se serializam e a segunda enxerga a primeira (READ COMMITTED: cada consulta depois da trava vê o que já foi
-- confirmado); a unicidade do início é o reforço. A declaração de convidados toma a mesma trava em modo compartilhado.
CREATE FUNCTION app.parameter_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; latest app.parameter; v_at timestamptz;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'set_parameter' OR op.second_home_id IS DISTINCT FROM NEW.second_home_id
     OR NEW.authority IS DISTINCT FROM op.role OR NEW.created_by IS DISTINCT FROM op.actor_user_id THEN
    RAISE EXCEPTION 'a parameter version is recorded by its set_parameter operation, with its authority and author'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'parameter_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.parameter:' || NEW.key || ':' || NEW.second_home_id::text, 0));
  v_at := clock_timestamp();
  NEW.created_at := v_at;
  IF NEW.effective_from IS NULL THEN
    NEW.effective_from := v_at;
  ELSIF NEW.effective_from < v_at THEN
    RAISE EXCEPTION 'a parameter version never starts in the past'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_retroactive';
  END IF;
  SELECT * INTO latest FROM app.parameter
   WHERE key = NEW.key AND second_home_id = NEW.second_home_id
   ORDER BY effective_from DESC LIMIT 1;
  IF FOUND AND (NEW.effective_from <= latest.effective_from
                OR (latest.effective_to IS NOT NULL AND NEW.effective_from < latest.effective_to)) THEN
    RAISE EXCEPTION 'a parameter version starts after every start of its scope and never before an explicit end'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_overlap';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.parameter_insert() FROM PUBLIC;
CREATE TRIGGER parameter_insert BEFORE INSERT ON app.parameter
  FOR EACH ROW EXECUTE FUNCTION app.parameter_insert();
CREATE TRIGGER parameter_no_update BEFORE UPDATE ON app.parameter
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER parameter_no_delete BEFORE DELETE ON app.parameter
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER parameter_no_truncate BEFORE TRUNCATE ON app.parameter
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Histórico com o fim efetivo derivado: o `effective_to` explícito, ou o início da versão seguinte.
CREATE VIEW app.parameter_version WITH (security_invoker = true) AS
SELECT p.*,
       coalesce(p.effective_to,
                lead(p.effective_from) OVER (PARTITION BY p.key, p.second_home_id ORDER BY p.effective_from))
         AS effective_until
  FROM app.parameter p;

-- Versão vigente no instante: a de maior início ≤ instante, se o instante for anterior ao seu `effective_to`
-- explícito. Nenhuma linha = parâmetro ausente (ERR_PARAMETER_MISSING); zero ou padrão nunca são presumidos.
CREATE FUNCTION app.parameter_at(p_key text, p_second_home_id uuid, p_at timestamptz)
  RETURNS SETOF app.parameter
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.* FROM (
    SELECT p.* FROM app.parameter p
     WHERE p.key = p_key AND p.second_home_id = p_second_home_id AND p.effective_from <= p_at
     ORDER BY p.effective_from DESC LIMIT 1
  ) v
  WHERE v.effective_to IS NULL OR p_at < v.effective_to
$$;
REVOKE ALL ON FUNCTION app.parameter_at(text, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parameter_at(text, uuid, timestamptz) TO luxtory_app;

ALTER TABLE app.parameter ENABLE ROW LEVEL SECURITY;
CREATE POLICY parameter_app_read ON app.parameter FOR SELECT TO luxtory_app USING (true);
CREATE POLICY parameter_app_insert ON app.parameter FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.parameter TO luxtory_app;
GRANT SELECT ON app.parameter_version TO luxtory_app;
-- Titular (ADR-0026 §5): as versões da Second Home da holding vigente que representa (RLS de `holding`, W8); sem base,
-- autoridade, autor nem operação.
GRANT SELECT (id, key, second_home_id, value, effective_from, effective_to) ON app.parameter TO authenticated;
CREATE POLICY parameter_holder_read ON app.parameter FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id = parameter.second_home_id)
);


-- migrate:down
-- Histórico de parâmetros nunca é descartado por rollback (TECH-052): com qualquer versão gravada, a reversão é recusada.
-- A trava exclusiva espera publicações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.parameter IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.parameter) THEN
    RAISE EXCEPTION 'W14 rollback would discard the parameter history';
  END IF;
END $$;
DROP FUNCTION app.parameter_at(text, uuid, timestamptz);
DROP VIEW app.parameter_version;
DROP TABLE app.parameter;
DROP FUNCTION app.parameter_insert();
