-- migrate:up
-- Residence (`03` §3.1, BR-003, BR-025, BR-310…314, REQ-020, REQ-027; ADR-0010 §2–3). O registro é o evento de
-- aprovação comercial: grava o instante e fixa a versão vigente do Concept, que nunca muda. FKs compostas amarram
-- Edition, versão fixada e autorização de Investor ao mesmo Concept. Configuração, administração, conformidade e início
-- da operação chegam nas waves donas (W8, W29).
CREATE TABLE app.residence (
  id uuid PRIMARY KEY,
  edition_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  concept_version_id uuid NOT NULL,
  commercially_approved_at timestamptz NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  timezone text NOT NULL CHECK (length(timezone) <= 64 AND timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'),
  investor_authorization_id uuid,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  CONSTRAINT residence_edition_fk FOREIGN KEY (edition_id, concept_id) REFERENCES app.edition (id, concept_id),
  CONSTRAINT residence_concept_version_fk FOREIGN KEY (concept_version_id, concept_id)
    REFERENCES app.concept_version (id, concept_id),
  CONSTRAINT residence_investor_authorization_fk FOREIGN KEY (investor_authorization_id, concept_id)
    REFERENCES app.investor_authorization (id, concept_id)
);

CREATE INDEX residence_edition_idx ON app.residence (edition_id);
CREATE INDEX residence_investor_authorization_idx ON app.residence (investor_authorization_id)
  WHERE investor_authorization_id IS NOT NULL;

-- Defesa no banco (o command já revalida sob trava): a versão fixada é a aprovada vigente do Concept no registro
-- (REQ-020, BR-025) e a autorização de Investor, se houver, não está revogada e cobre o instante da aprovação
-- comercial (REQ-027).
CREATE FUNCTION app.residence_require_basis() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_current uuid;
BEGIN
  SELECT id INTO v_current FROM app.concept_version
  WHERE concept_id = NEW.concept_id AND state = 'approved'
  ORDER BY version DESC
  LIMIT 1;
  IF v_current IS NULL OR v_current <> NEW.concept_version_id THEN
    RAISE EXCEPTION 'app.residence: concept version % is not the current approved version', NEW.concept_version_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'residence_concept_version_current';
  END IF;
  IF NEW.investor_authorization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.investor_authorization
    WHERE id = NEW.investor_authorization_id
      AND revoked_at IS NULL
      AND valid_from <= NEW.commercially_approved_at
      AND (valid_until IS NULL OR valid_until > NEW.commercially_approved_at)
  ) THEN
    RAISE EXCEPTION 'app.residence: investor authorization % is not valid', NEW.investor_authorization_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'residence_investor_authorization_valid';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER residence_require_basis BEFORE INSERT ON app.residence
  FOR EACH ROW EXECUTE FUNCTION app.residence_require_basis();
CREATE TRIGGER residence_no_update BEFORE UPDATE ON app.residence
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER residence_no_delete BEFORE DELETE ON app.residence
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER residence_no_truncate BEFORE TRUNCATE ON app.residence
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.residence ENABLE ROW LEVEL SECURITY;
CREATE POLICY residence_app_read ON app.residence FOR SELECT TO luxtory_app USING (true);
CREATE POLICY residence_app_insert ON app.residence FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.residence TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.residence FROM luxtory_app;
DROP TABLE app.residence;
DROP FUNCTION app.residence_require_basis();
