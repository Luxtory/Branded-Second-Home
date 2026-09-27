-- migrate:up
-- Residence Edition (`03` §3.1, BR-004, BR-031, BR-032, REQ-020): lançamento comercial de um Concept, com região,
-- modalidade e condições comerciais registradas pela Luxtory — nenhum valor calculado pelo software (ADR-001 do `03`).
-- Imutável na W3; a W8 acrescenta a trava da estrutura e a alteração de modalidade enquanto aberta (REQ-022).
CREATE TABLE app.edition (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES app.concept (id),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 200),
  modality text NOT NULL CHECK (modality IN ('owner', 'co_owner', 'owner_and_co_owner')),
  commercial_conditions text NOT NULL CHECK (length(commercial_conditions) BETWEEN 1 AND 20000),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  -- Alvo da FK composta da Residence.
  CONSTRAINT edition_concept_key UNIQUE (id, concept_id)
);

CREATE INDEX edition_concept_idx ON app.edition (concept_id);

CREATE TRIGGER edition_no_update BEFORE UPDATE ON app.edition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER edition_no_delete BEFORE DELETE ON app.edition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER edition_no_truncate BEFORE TRUNCATE ON app.edition
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.edition ENABLE ROW LEVEL SECURITY;
CREATE POLICY edition_app_read ON app.edition FOR SELECT TO luxtory_app USING (true);
CREATE POLICY edition_app_insert ON app.edition FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.edition TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.edition FROM luxtory_app;
DROP TABLE app.edition;
