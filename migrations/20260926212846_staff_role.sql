-- migrate:up
-- Papéis de staff da Luxtory (TECH-050, ADR-0008): Admin e Super Admin, sem hierarquia presumida — um usuário pode ter
-- os dois, cada um numa linha. Atribuição e revogação só pelas funções de operação abaixo, executadas pelo dono das
-- tabelas (runbook), sempre com `operation` e `audit_log` (REQ-015). O papel de aplicação só lê.
CREATE TABLE app.staff_role (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role app.actor_role NOT NULL CHECK (role IN ('admin', 'super_admin')),
  basis text NOT NULL CHECK (length(basis) BETWEEN 1 AND 255),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_basis text CHECK (length(revocation_basis) BETWEEN 1 AND 255),
  CONSTRAINT staff_role_revocation_check CHECK ((revoked_at IS NULL) = (revocation_basis IS NULL)),
  CONSTRAINT staff_role_revocation_order_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX staff_role_active_idx ON app.staff_role (user_id, role) WHERE revoked_at IS NULL;

-- Linhas que só mudam por uma revogação (staff_role, authorization_grant): `revoked_at` e `revocation_basis` passam de
-- nulos a preenchidos uma única vez; o resto é imutável.
CREATE FUNCTION app.allow_single_revocation() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at' - 'revocation_basis')
        IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revocation_basis') THEN
    RAISE EXCEPTION 'app.%: only a single revocation can change a row', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER staff_role_single_revocation BEFORE UPDATE ON app.staff_role
  FOR EACH ROW EXECUTE FUNCTION app.allow_single_revocation();
CREATE TRIGGER staff_role_no_delete BEFORE DELETE ON app.staff_role
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER staff_role_no_truncate BEFORE TRUNCATE ON app.staff_role
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Mudança feita pelo operador do runbook, fora do executor de commands: grava a `operation` (papel `system`, chave e
-- correlação `runbook:<id>`, base informada) e o `audit_log` com antes/depois (TECH-092).
CREATE FUNCTION app.record_operator_change(
  p_command text,
  p_object_type text,
  p_object_id text,
  p_basis text,
  p_before jsonb,
  p_after jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_at timestamptz := now();
BEGIN
  INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, residence_id, idempotency_key,
                             correlation_id, authorization_ref, state, created_at, updated_at)
  VALUES (v_operation_id, p_command, NULL, NULL, 'system', NULL, 'runbook:' || v_operation_id,
          'runbook:' || v_operation_id, p_basis, 'committed', v_at, v_at);
  INSERT INTO app.audit_log (event_type, operation_id, occurred_at, actor_user_id, acting_party_id, role,
                             object_type, object_id, authorization_ref, before, after)
  VALUES ('command', v_operation_id, v_at, NULL, NULL, 'system', p_object_type, p_object_id, p_basis, p_before,
          p_after);
  RETURN v_operation_id;
END
$$;

-- Runbook: `SELECT app.assign_staff_role('<id do usuário no Supabase Auth>', 'super_admin', '<base registrada>');`
CREATE FUNCTION app.assign_staff_role(p_user_id uuid, p_role text, p_basis text) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_row app.staff_role;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'app.assign_staff_role: user % does not exist in auth.users', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  INSERT INTO app.staff_role (id, user_id, role, basis, granted_at)
  VALUES (gen_random_uuid(), p_user_id, p_role, p_basis, now())
  RETURNING * INTO v_row;
  PERFORM app.record_operator_change('assign_staff_role', 'staff_role', v_row.id::text, p_basis, NULL,
                                     to_jsonb(v_row));
  RETURN v_row.id;
END
$$;

-- Runbook: `SELECT app.revoke_staff_role('<id da linha em app.staff_role>', '<base registrada>');`
CREATE FUNCTION app.revoke_staff_role(p_staff_role_id uuid, p_basis text) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_before app.staff_role;
  v_after app.staff_role;
BEGIN
  SELECT * INTO v_before FROM app.staff_role WHERE id = p_staff_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.revoke_staff_role: staff role % does not exist', p_staff_role_id
      USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE app.staff_role SET revoked_at = now(), revocation_basis = p_basis
  WHERE id = p_staff_role_id
  RETURNING * INTO v_after;
  PERFORM app.record_operator_change('revoke_staff_role', 'staff_role', p_staff_role_id::text, p_basis,
                                     to_jsonb(v_before), to_jsonb(v_after));
  RETURN p_staff_role_id;
END
$$;

-- Funções de operação: só o dono das tabelas executa (nunca `luxtory_app`, `anon` ou `authenticated`).
REVOKE ALL ON FUNCTION app.record_operator_change(text, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assign_staff_role(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revoke_staff_role(uuid, text) FROM PUBLIC;

-- RLS como defesa em profundidade: só o papel de aplicação tem política (e só de leitura).
ALTER TABLE app.staff_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_role_app_read ON app.staff_role FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.staff_role TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.staff_role FROM luxtory_app;
DROP FUNCTION app.revoke_staff_role(uuid, text);
DROP FUNCTION app.assign_staff_role(uuid, text, text);
DROP FUNCTION app.record_operator_change(text, text, text, text, jsonb, jsonb);
DROP TABLE app.staff_role;
DROP FUNCTION app.allow_single_revocation();
