-- migrate:up
-- Delegação usuário → party (`03` §3.1: escopo e vigência; W7, spec identity §13, ADR-0020): **quem pode representar
-- quem** no software. Não é titularidade, propriedade, Ação, Membership nem autorização irrestrita — o que a party pode
-- fazer vem da relação aplicável (holding, `authorization_grant`, …). Decisões do fundador (2026-10-21): escopo único
-- `party` (representação da party), fim opcional, vigências sem sobreposição por par usuário × party, e **pendente até
-- a ativação** pelo próprio usuário autenticado. Só a delegação `active` dentro da vigência representa; a expiração é
-- derivada de `valid_until`, nunca gravada, e não exige revogação.
CREATE EXTENSION btree_gist WITH SCHEMA extensions;

CREATE TABLE app.party_delegation (
  id uuid PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES app.party (id),
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope = 'party'),
  state text NOT NULL CHECK (state IN ('pending', 'active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  basis text NOT NULL CHECK (length(basis) BETWEEN 1 AND 255),
  invited_by_user_id uuid NOT NULL,
  invited_role app.actor_role NOT NULL CHECK (invited_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  activated_at timestamptz,
  activation_operation_id uuid UNIQUE REFERENCES app.operation (id),
  revoked_at timestamptz,
  revocation_basis text CHECK (length(revocation_basis) BETWEEN 1 AND 255),
  revoked_by_user_id uuid,
  revoked_role app.actor_role CHECK (revoked_role IN ('admin', 'super_admin')),
  revocation_operation_id uuid UNIQUE REFERENCES app.operation (id),
  CONSTRAINT party_delegation_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT party_delegation_activation_check CHECK (
    (activated_at IS NULL) = (activation_operation_id IS NULL) AND (activated_at IS NULL OR activated_at >= created_at)
  ),
  CONSTRAINT party_delegation_revocation_check CHECK (
    (revoked_at IS NULL) = (revocation_basis IS NULL)
    AND (revoked_at IS NULL) = (revoked_by_user_id IS NULL)
    AND (revoked_at IS NULL) = (revoked_role IS NULL)
    AND (revoked_at IS NULL) = (revocation_operation_id IS NULL)
    AND (revoked_at IS NULL OR revoked_at >= created_at)
  ),
  CONSTRAINT party_delegation_lifecycle_check CHECK (
    (state = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
    OR (state = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
    OR (state = 'revoked' AND revoked_at IS NOT NULL)
  )
);

-- No máximo uma delegação pendente ou ativa por par usuário × party **em cada instante** (spec identity §13.3): as
-- vigências [valid_from, valid_until) não se sobrepõem. A expiração encerra a vigência — depois dela uma nova delegação
-- pode começar sem revogar a anterior, que fica no histórico; revogada não conta. O banco garante, inclusive entre
-- transações concorrentes (o prefixo `conflict_` vira `ERR_STATE_TRANSITION`).
ALTER TABLE app.party_delegation ADD CONSTRAINT conflict_party_delegation_overlap
  EXCLUDE USING gist (user_id WITH =, party_id WITH =, tstzrange(valid_from, valid_until, '[)') WITH &&)
  WHERE (state <> 'revoked');
CREATE INDEX party_delegation_party_idx ON app.party_delegation (party_id, created_at);

-- Transições fechadas: pending → active (só os campos de ativação) e pending|active → revoked (só os de revogação).
CREATE FUNCTION app.party_delegation_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.party_id, NEW.user_id, NEW.scope, NEW.valid_from, NEW.valid_until, NEW.basis,
      NEW.invited_by_user_id, NEW.invited_role, NEW.operation_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.party_id, OLD.user_id, OLD.scope, OLD.valid_from, OLD.valid_until, OLD.basis,
      OLD.invited_by_user_id, OLD.invited_role, OLD.operation_id, OLD.created_at) THEN
    RAISE EXCEPTION 'app.party_delegation: only state, activation and revocation can change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'pending' AND NEW.state = 'active' THEN
    RETURN NEW;
  END IF;
  IF OLD.state IN ('pending', 'active') AND NEW.state = 'revoked'
     AND (NEW.activated_at, NEW.activation_operation_id)
         IS NOT DISTINCT FROM (OLD.activated_at, OLD.activation_operation_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'app.party_delegation: invalid state transition % -> %', OLD.state, NEW.state
    USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER party_delegation_transition BEFORE UPDATE ON app.party_delegation
  FOR EACH ROW EXECUTE FUNCTION app.party_delegation_transition();
CREATE TRIGGER party_delegation_no_delete BEFORE DELETE ON app.party_delegation
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER party_delegation_no_truncate BEFORE TRUNCATE ON app.party_delegation
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.party_delegation ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_delegation_app_read ON app.party_delegation FOR SELECT TO luxtory_app USING (true);
CREATE POLICY party_delegation_app_insert ON app.party_delegation FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY party_delegation_app_update ON app.party_delegation FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.party_delegation TO luxtory_app;
GRANT UPDATE (state, activated_at, activation_operation_id, revoked_at, revocation_basis, revoked_by_user_id,
              revoked_role, revocation_operation_id)
  ON app.party_delegation TO luxtory_app;

-- Leitura na Área do Titular sob RLS, por quem representa a pessoa ou empresa (TECH-052, ADR-0006 §6): `authenticated` só nas colunas necessárias — sem HMAC, sem bases
-- e sem ids de staff — e só nas próprias linhas. A party só aparece com delegação vigente do `auth.uid()`.
-- Auditoria de Production (2026-10-21): `authenticated` não tinha `SELECT` em `app` nem privilégio padrão no schema.
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT SELECT (id, party_id, user_id, scope, state, valid_from, valid_until, created_at, activated_at, revoked_at)
  ON app.party_delegation TO authenticated;
CREATE POLICY party_delegation_own_read ON app.party_delegation FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT (id, document_type, document_ciphertext, document_key_id, created_at) ON app.party TO authenticated;
CREATE POLICY party_represented_read ON app.party FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app.party_delegation d
    WHERE d.party_id = party.id
      AND d.user_id = auth.uid()
      AND d.state = 'active'
      AND d.valid_from <= now()
      AND (d.valid_until IS NULL OR now() < d.valid_until)
  ));

-- migrate:down
DROP POLICY party_represented_read ON app.party;
REVOKE SELECT ON app.party FROM authenticated;
REVOKE ALL ON app.party_delegation FROM authenticated;
REVOKE USAGE ON SCHEMA app FROM authenticated;
REVOKE ALL ON app.party_delegation FROM luxtory_app;
DROP TABLE app.party_delegation;
DROP FUNCTION app.party_delegation_transition();
DROP EXTENSION btree_gist;
