-- migrate:up
-- Coleção (Wave 4.1; spec catalog §13.12, D-B2C-21): vocabulários controlados, classificações e atributos da versão do
-- Concept. Sem tagging livre: só termos registrados classificam uma versão. O termo nunca é apagado; só o rótulo e o
-- estado ativo mudam (o `slug`, usado nas URLs públicas, é imutável).
CREATE TABLE app.catalog_term (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('lifestyle', 'architectural_style')),
  slug text NOT NULL CHECK (length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  active boolean NOT NULL,
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT catalog_term_slug_key UNIQUE (kind, slug),
  -- Alvo da FK composta da classificação: o termo é do vocabulário da posição.
  CONSTRAINT catalog_term_kind_key UNIQUE (id, kind)
);

CREATE UNIQUE INDEX catalog_term_label_idx ON app.catalog_term (kind, lower(label));

CREATE FUNCTION app.catalog_term_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'label' - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'label' - 'active') THEN
    RAISE EXCEPTION 'app.catalog_term: only the label and the active flag can change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER catalog_term_transition BEFORE UPDATE ON app.catalog_term
  FOR EACH ROW EXECUTE FUNCTION app.catalog_term_transition();
CREATE TRIGGER catalog_term_no_delete BEFORE DELETE ON app.catalog_term
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER catalog_term_no_truncate BEFORE TRUNCATE ON app.catalog_term
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Atributos da versão (opcionais; versões antigas ficam sem eles). Imutáveis como o resto do conteúdo: o gatilho
-- `concept_version_transition` compara a linha inteira.
ALTER TABLE app.concept_version
  ADD COLUMN summary text CHECK (length(summary) BETWEEN 1 AND 160),
  ADD COLUMN guests_max smallint CHECK (guests_max BETWEEN 1 AND 100),
  ADD COLUMN suites smallint CHECK (suites BETWEEN 1 AND 50),
  ADD COLUMN built_area_m2 integer CHECK (built_area_m2 BETWEEN 1 AND 100000);

-- Classificações ordenadas da versão (a posição 1 é a principal): lifestyle 1–3, estilo 1–2. Só inserção, junto com a
-- versão ainda não aprovada.
CREATE TABLE app.concept_version_term (
  concept_version_id uuid NOT NULL REFERENCES app.concept_version (id),
  term_id uuid NOT NULL,
  kind text NOT NULL,
  position smallint NOT NULL,
  PRIMARY KEY (concept_version_id, kind, position),
  CONSTRAINT concept_version_term_unique_key UNIQUE (concept_version_id, term_id),
  CONSTRAINT concept_version_term_term_fkey FOREIGN KEY (term_id, kind) REFERENCES app.catalog_term (id, kind),
  CONSTRAINT concept_version_term_position_check CHECK (
    (kind = 'lifestyle' AND position BETWEEN 1 AND 3)
    OR (kind = 'architectural_style' AND position BETWEEN 1 AND 2)
  )
);

CREATE INDEX concept_version_term_term_idx ON app.concept_version_term (term_id);

-- Versão aprovada é imutável (BR-013) e termo desativado não classifica versão nova.
CREATE FUNCTION app.concept_version_term_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM app.concept_version AS version
       WHERE version.id = NEW.concept_version_id AND version.state = 'not_approved'
     )
     OR NOT EXISTS (SELECT 1 FROM app.catalog_term AS term WHERE term.id = NEW.term_id AND term.active)
  THEN
    RAISE EXCEPTION 'app.concept_version_term: only an active term can classify a not approved version'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER concept_version_term_guard BEFORE INSERT ON app.concept_version_term
  FOR EACH ROW EXECUTE FUNCTION app.concept_version_term_guard();
CREATE TRIGGER concept_version_term_no_update BEFORE UPDATE ON app.concept_version_term
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_version_term_no_delete BEFORE DELETE ON app.concept_version_term
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_version_term_no_truncate BEFORE TRUNCATE ON app.concept_version_term
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- O UPDATE de coluna também habilita a trava da linha (`FOR SHARE`/`FOR NO KEY UPDATE`, ADR-0010 §8).
ALTER TABLE app.catalog_term ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_term_app_read ON app.catalog_term FOR SELECT TO luxtory_app USING (true);
CREATE POLICY catalog_term_app_insert ON app.catalog_term FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY catalog_term_app_update ON app.catalog_term FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.catalog_term TO luxtory_app;
GRANT UPDATE (label, active) ON app.catalog_term TO luxtory_app;

ALTER TABLE app.concept_version_term ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_version_term_app_read ON app.concept_version_term FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_version_term_app_insert ON app.concept_version_term FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept_version_term TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.concept_version_term FROM luxtory_app;
REVOKE ALL ON app.catalog_term FROM luxtory_app;
DROP TABLE app.concept_version_term;
DROP FUNCTION app.concept_version_term_guard();
ALTER TABLE app.concept_version
  DROP COLUMN built_area_m2,
  DROP COLUMN suites,
  DROP COLUMN guests_max,
  DROP COLUMN summary;
DROP TABLE app.catalog_term;
DROP FUNCTION app.catalog_term_transition();
