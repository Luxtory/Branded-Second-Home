-- migrate:up
-- Autorização registrada de Brand Partner, Investor e parceiros (REQ-014, TECH-050/051, `03` §3.1): comandos
-- explícitos, escopo, vigência [valid_from, valid_until), concedente e base. Nasce revogável; nunca é apagada.
CREATE TABLE app.authorization_grant (
  id uuid PRIMARY KEY,
  -- Dívida transitória deliberada (D-W2-1, ADR-0008): sem FK até a W7, que cria `app.party`, adiciona e valida a FK
  -- e remove o gatilho `authorization_grant_require_party` abaixo. Não é o modelo definitivo.
  grantee_party_id uuid NOT NULL,
  commands text[] NOT NULL,
  scope_type text NOT NULL CHECK (scope_type ~ '^[a-z][a-z0-9_]*$' AND length(scope_type) <= 64),
  scope_id text NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 255),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  basis text NOT NULL CHECK (length(basis) BETWEEN 1 AND 255),
  granted_by_user_id uuid NOT NULL,
  granted_role app.actor_role NOT NULL CHECK (granted_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_basis text CHECK (length(revocation_basis) BETWEEN 1 AND 255),
  CONSTRAINT authorization_grant_commands_check CHECK (
    cardinality(commands) BETWEEN 1 AND 64
    AND array_to_string(commands, ',', '') ~ '^[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*$'
  ),
  CONSTRAINT authorization_grant_validity_check CHECK (valid_until > valid_from),
  CONSTRAINT authorization_grant_revocation_check CHECK ((revoked_at IS NULL) = (revocation_basis IS NULL))
);

CREATE INDEX authorization_grant_party_idx ON app.authorization_grant (grantee_party_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER authorization_grant_single_revocation BEFORE UPDATE ON app.authorization_grant
  FOR EACH ROW EXECUTE FUNCTION app.allow_single_revocation();
CREATE TRIGGER authorization_grant_no_delete BEFORE DELETE ON app.authorization_grant
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER authorization_grant_no_truncate BEFORE TRUNCATE ON app.authorization_grant
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Fechado para falhas enquanto a FK não existe (D-W2-1): um grant só entra se a party existir em `app.party`, e nunca
-- entra enquanto `app.party` não existir. Mesmo erro que a FK dará na W7. SECURITY DEFINER para ler `app.party` com os
-- privilégios do dono, qualquer que seja o papel que insere.
CREATE FUNCTION app.authorization_grant_require_party() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_exists boolean := false;
BEGIN
  IF to_regclass('app.party') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM app.party WHERE id = $1)' INTO v_exists USING NEW.grantee_party_id;
  END IF;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'app.authorization_grant: grantee party % does not exist', NEW.grantee_party_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'authorization_grant_grantee_party_fk';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.authorization_grant_require_party() FROM PUBLIC;

CREATE TRIGGER authorization_grant_require_party BEFORE INSERT ON app.authorization_grant
  FOR EACH ROW EXECUTE FUNCTION app.authorization_grant_require_party();

-- Runbook: `SELECT app.revoke_authorization_grant('<id do grant>', '<base registrada>');`
CREATE FUNCTION app.revoke_authorization_grant(p_grant_id uuid, p_basis text) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_before app.authorization_grant;
  v_after app.authorization_grant;
BEGIN
  SELECT * INTO v_before FROM app.authorization_grant WHERE id = p_grant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.revoke_authorization_grant: grant % does not exist', p_grant_id
      USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE app.authorization_grant SET revoked_at = now(), revocation_basis = p_basis
  WHERE id = p_grant_id
  RETURNING * INTO v_after;
  PERFORM app.record_operator_change('revoke_authorization_grant', 'authorization_grant', p_grant_id::text,
                                     p_basis, to_jsonb(v_before), to_jsonb(v_after));
  RETURN p_grant_id;
END
$$;

REVOKE ALL ON FUNCTION app.revoke_authorization_grant(uuid, text) FROM PUBLIC;

-- O command `grant_authorization` insere pelo papel de aplicação; revogação só pela função acima.
ALTER TABLE app.authorization_grant ENABLE ROW LEVEL SECURITY;
CREATE POLICY authorization_grant_app_read ON app.authorization_grant FOR SELECT TO luxtory_app USING (true);
CREATE POLICY authorization_grant_app_insert ON app.authorization_grant FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.authorization_grant TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.authorization_grant FROM luxtory_app;
DROP FUNCTION app.revoke_authorization_grant(uuid, text);
DROP TABLE app.authorization_grant;
DROP FUNCTION app.authorization_grant_require_party();
