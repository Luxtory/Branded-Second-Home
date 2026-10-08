-- migrate:up
-- Curadoria da Coleção (Wave 4.1; spec catalog §13.12): `rank` (ordem "Curadoria Luxtory"; nulo = depois dos
-- posicionados, na ordem de registro) separado de `featured` (destaque editorial explícito). Mutável e auditada (cada
-- mudança grava `operation` e `audit_log` com antes/depois); nunca apagada.
CREATE TABLE app.concept_curation (
  concept_id uuid PRIMARY KEY REFERENCES app.concept (id),
  rank smallint CHECK (rank BETWEEN 1 AND 999),
  featured boolean NOT NULL,
  operation_id uuid NOT NULL REFERENCES app.operation (id),
  updated_at timestamptz NOT NULL
);

-- No máximo um Concept em destaque.
CREATE UNIQUE INDEX concept_curation_featured_idx ON app.concept_curation (featured) WHERE featured;

-- Destaque só com capa aprovada (a retirada da capa tira o destaque no mesmo command).
CREATE FUNCTION app.concept_curation_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.featured AND NOT EXISTS (
       SELECT 1 FROM app.concept_media AS media WHERE media.concept_id = NEW.concept_id AND media.state = 'approved'
     )
  THEN
    RAISE EXCEPTION 'app.concept_curation: a featured Concept needs an approved cover'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.concept_id IS DISTINCT FROM OLD.concept_id THEN
    RAISE EXCEPTION 'app.concept_curation: the Concept cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER concept_curation_guard BEFORE INSERT OR UPDATE ON app.concept_curation
  FOR EACH ROW EXECUTE FUNCTION app.concept_curation_guard();
CREATE TRIGGER concept_curation_no_delete BEFORE DELETE ON app.concept_curation
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_curation_no_truncate BEFORE TRUNCATE ON app.concept_curation
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.concept_curation ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_curation_app_read ON app.concept_curation FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_curation_app_insert ON app.concept_curation FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY concept_curation_app_update ON app.concept_curation FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept_curation TO luxtory_app;
GRANT UPDATE (rank, featured, operation_id, updated_at) ON app.concept_curation TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.concept_curation FROM luxtory_app;
DROP TABLE app.concept_curation;
DROP FUNCTION app.concept_curation_guard();
