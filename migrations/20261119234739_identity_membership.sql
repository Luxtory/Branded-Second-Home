-- migrate:up
-- W15 (REQ-011, REQ-050, PD-001; TECH-050, TECH-052, TECH-053, TECH-055; ADR-0031; spec identity §15): Membership.
-- Um Membership por party — e a party é única por CPF/CNPJ (W7) —, estados `active`, `suspended` e `ended` com as
-- transições da TECH-055. Sem plano, preço, benefício, prioridade, prazo, renovação ou cobrança (D1, D3): nada disso
-- existe aqui. Membership é condição da party, nunca papel: nenhuma FK ou gatilho liga esta tabela a holding, Ação,
-- Direito de Uso, rotação, reserva ou custódia, e nenhuma delas lê o Membership.
--
-- Toda escrita vem de uma operação Admin da transação corrente (TECH-002), do command que corresponde à transição, com
-- a atribuição Admin revalidada no banco; autor, autoridade e instante vêm da operação e do relógio do banco, nunca da
-- entrada. O histórico é escrito pelo próprio banco, a partir da linha validada: o papel da aplicação não o escreve.
CREATE TABLE app.membership (
  id uuid PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES app.party(id),
  state text NOT NULL,
  -- Base registrada da última mudança (TECH-051), sem dado pessoal (orientação na tela, como a base da W7).
  basis text NOT NULL,
  -- Última mudança: operação, instante, autor e autoridade (derivados pelo gatilho).
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  changed_at timestamptz NOT NULL,
  changed_by uuid NOT NULL,
  authority text NOT NULL,
  created_at timestamptz NOT NULL,
  created_operation_id uuid NOT NULL REFERENCES app.operation(id),
  CONSTRAINT conflict_membership_party UNIQUE (party_id),
  CONSTRAINT membership_state_check CHECK (state IN ('active', 'suspended', 'ended')),
  CONSTRAINT membership_basis_check CHECK (length(btrim(basis)) BETWEEN 1 AND 255),
  CONSTRAINT membership_authority_check CHECK (authority IN ('admin'))
);

-- Histórico append-only: uma linha por mudança, chave = operação (uma operação, uma transição).
CREATE TABLE app.membership_transition (
  operation_id uuid PRIMARY KEY REFERENCES app.operation(id),
  membership_id uuid NOT NULL REFERENCES app.membership(id),
  party_id uuid NOT NULL REFERENCES app.party(id),
  from_state text,
  to_state text NOT NULL,
  basis text NOT NULL,
  recorded_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  authority text NOT NULL,
  -- TECH-055: ∅ → active na criação; active ↔ suspended; active|suspended → ended; ended → active. `from_state` nulo
  -- só na raiz (a comparação de linha com NULL seria nula e passaria no CHECK, por isso o teste explícito).
  CONSTRAINT conflict_membership_transition_pair CHECK (
    (from_state IS NULL AND to_state = 'active')
    OR (from_state IS NOT NULL AND (from_state, to_state) IN (
      ('active', 'suspended'), ('suspended', 'active'), ('active', 'ended'), ('suspended', 'ended'), ('ended', 'active')
    ))
  )
);
CREATE INDEX membership_transition_membership_idx ON app.membership_transition (membership_id, recorded_at);

-- Procedência, transição, autoridade e titularidade no instante da gravação. Na atualização a linha já está travada
-- pelo próprio UPDATE (READ COMMITTED reavalia sobre a versão confirmada): mudanças concorrentes se serializam e a
-- segunda valida contra o estado deixado pela primeira. A criação concorrente esbarra na unicidade da party.
CREATE FUNCTION app.membership_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; v_command text; v_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.party_id IS DISTINCT FROM OLD.party_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id) THEN
    RAISE EXCEPTION 'a Membership keeps its party and origin'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_membership_immutable';
  END IF;
  -- Command de cada transição da TECH-055; qualquer outro par é recusado.
  v_command := CASE
    WHEN TG_OP = 'INSERT' AND NEW.state = 'active' THEN 'activate_membership'
    WHEN TG_OP = 'UPDATE' AND OLD.state = 'active' AND NEW.state = 'suspended' THEN 'suspend_membership'
    WHEN TG_OP = 'UPDATE' AND OLD.state IN ('suspended', 'ended') AND NEW.state = 'active' THEN 'reactivate_membership'
    WHEN TG_OP = 'UPDATE' AND OLD.state IN ('active', 'suspended') AND NEW.state = 'ended' THEN 'end_membership'
  END;
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'the Membership state change is not a TECH-055 transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_membership_transition';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.operation_id IS NOT DISTINCT FROM OLD.operation_id THEN
    RAISE EXCEPTION 'every Membership change has its own operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_operation_provenance';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> v_command OR op.second_home_id IS NOT NULL OR op.acting_party_id IS NOT NULL THEN
    RAISE EXCEPTION 'a Membership change is recorded by the operation of its own command'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_operation_provenance';
  END IF;
  -- Atribuição Admin ativa do autor da operação, com trava compartilhada contra a revogação (W13, reusada na W14).
  PERFORM app.lock_own_use_admin_authority(op);
  v_at := clock_timestamp();
  NEW.changed_at := v_at;
  NEW.changed_by := op.actor_user_id;
  NEW.authority := op.role;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := v_at;
    NEW.created_operation_id := NEW.operation_id;
  END IF;
  -- D2 (decisão de elegibilidade da W15, não texto literal dos canônicos): só party Titular — com holding vigente no
  -- instante — passa a `active`. A perda posterior da holding não altera o estado (efeitos prospectivos, BR-320); só a
  -- validade da holding é lida, como nas políticas de leitura do Titular (W8).
  IF NEW.state = 'active' AND NOT EXISTS (
    SELECT 1 FROM app.holding h
     WHERE h.party_id = NEW.party_id AND h.valid_from <= v_at AND (h.valid_until IS NULL OR v_at < h.valid_until)
  ) THEN
    RAISE EXCEPTION 'only a party with a current holding enters an active Membership'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_membership_requires_titular';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.membership_write() FROM PUBLIC;
CREATE TRIGGER membership_write BEFORE INSERT OR UPDATE ON app.membership
  FOR EACH ROW EXECUTE FUNCTION app.membership_write();

-- O histórico copia a linha já validada; executa como dono porque o papel da aplicação não tem INSERT no histórico.
CREATE FUNCTION app.membership_record_transition() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO app.membership_transition
    (operation_id, membership_id, party_id, from_state, to_state, basis, recorded_at, recorded_by, authority)
  VALUES (NEW.operation_id, NEW.id, NEW.party_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END, NEW.state,
          NEW.basis, NEW.changed_at, NEW.changed_by, NEW.authority);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.membership_record_transition() FROM PUBLIC;
CREATE TRIGGER membership_record_transition AFTER INSERT OR UPDATE ON app.membership
  FOR EACH ROW EXECUTE FUNCTION app.membership_record_transition();

CREATE TRIGGER membership_no_delete BEFORE DELETE ON app.membership
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER membership_no_truncate BEFORE TRUNCATE ON app.membership
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER membership_transition_no_update BEFORE UPDATE ON app.membership_transition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER membership_transition_no_delete BEFORE DELETE ON app.membership_transition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER membership_transition_no_truncate BEFORE TRUNCATE ON app.membership_transition
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Papel da aplicação: grava só estado, base e operação; o resto é derivado. O UPDATE de coluna também permite as
-- travas de linha da TECH-053 (`FOR SHARE` na verificação de elegibilidade, `FOR NO KEY UPDATE` nas mudanças).
ALTER TABLE app.membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_app_read ON app.membership FOR SELECT TO luxtory_app USING (true);
CREATE POLICY membership_app_insert ON app.membership FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY membership_app_update ON app.membership FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT ON app.membership TO luxtory_app;
GRANT INSERT (id, party_id, state, basis, operation_id) ON app.membership TO luxtory_app;
GRANT UPDATE (state, basis, operation_id) ON app.membership TO luxtory_app;
ALTER TABLE app.membership_transition ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_transition_app_read ON app.membership_transition FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.membership_transition TO luxtory_app;

-- Titular (TECH-052): o estado atual das parties que representa por delegação vigente (padrão da W7); sem base, autor,
-- autoridade nem operação. O histórico não é legível pelo Titular.
GRANT SELECT (id, party_id, state, changed_at) ON app.membership TO authenticated;
CREATE POLICY membership_represented_read ON app.membership FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.party_delegation d
           WHERE d.party_id = membership.party_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);


-- migrate:down
-- Membership e histórico nunca são descartados por rollback (TECH-052): com qualquer linha, a reversão é recusada. A
-- trava exclusiva espera mudanças em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.membership, app.membership_transition IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.membership) OR EXISTS (SELECT 1 FROM app.membership_transition) THEN
    RAISE EXCEPTION 'W15 rollback would discard the Membership history';
  END IF;
END $$;
DROP TABLE app.membership_transition;
DROP TABLE app.membership;
DROP FUNCTION app.membership_record_transition();
DROP FUNCTION app.membership_write();
