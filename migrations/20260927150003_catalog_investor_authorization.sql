-- migrate:up
-- Autorização da Luxtory a um Investor para um Concept (BR-310…314, REQ-027; D-W3-1, ADR-0010 §3). Sem dado pessoal:
-- Concept, referência estável do instrumento e vigência [valid_from, valid_until) — `valid_until` só se o instrumento
-- tiver termo final. Revogação única, com base; nunca é apagada. A W7 acrescenta o vínculo com a `party` do Investor
-- (coluna nova com FK), sem reescrever as linhas existentes.
CREATE TABLE app.investor_authorization (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES app.concept (id),
  instrument_ref text NOT NULL CHECK (length(instrument_ref) BETWEEN 1 AND 255),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  registered_by_user_id uuid NOT NULL,
  registered_role app.actor_role NOT NULL CHECK (registered_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_basis text CHECK (length(revocation_basis) BETWEEN 1 AND 255),
  -- Alvo da FK composta da Residence: a autorização é do mesmo Concept da Edition.
  CONSTRAINT investor_authorization_concept_key UNIQUE (id, concept_id),
  CONSTRAINT investor_authorization_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT investor_authorization_revocation_check CHECK ((revoked_at IS NULL) = (revocation_basis IS NULL))
);

CREATE INDEX investor_authorization_concept_idx ON app.investor_authorization (concept_id);

CREATE TRIGGER investor_authorization_single_revocation BEFORE UPDATE ON app.investor_authorization
  FOR EACH ROW EXECUTE FUNCTION app.allow_single_revocation();
CREATE TRIGGER investor_authorization_no_delete BEFORE DELETE ON app.investor_authorization
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER investor_authorization_no_truncate BEFORE TRUNCATE ON app.investor_authorization
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.investor_authorization ENABLE ROW LEVEL SECURITY;
CREATE POLICY investor_authorization_app_read ON app.investor_authorization FOR SELECT TO luxtory_app USING (true);
CREATE POLICY investor_authorization_app_insert ON app.investor_authorization FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY investor_authorization_app_update ON app.investor_authorization FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.investor_authorization TO luxtory_app;
GRANT UPDATE (revoked_at, revocation_basis) ON app.investor_authorization TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.investor_authorization FROM luxtory_app;
DROP TABLE app.investor_authorization;
