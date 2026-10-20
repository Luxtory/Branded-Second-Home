-- migrate:up
-- W4.2 (ADR-0019 §6; `01` v10.2 BR-030, BR-032, BR-062; `02` v4.3 REQ-022; `03` v3.15 §3.1; spec ownership §13): toda
-- manifestação de interesse parte de uma Home Edition. `home_edition_id` passa a obrigatório com FK simples; sai
-- `concept_id` (o Home Concept vem da Home Edition); `region` passa a `desired_location` (localização pretendida). A F2a
-- já saiu na migration catalog_home_edition. ALTER preserva os registros que já tenham Home Edition.

-- Precondição fail-closed: um interesse sem Home Edition não tem como receber o NOT NULL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.interest WHERE edition_id IS NULL) THEN
    RAISE EXCEPTION 'W4.2 precondition: interest rows without a Home Edition cannot be kept'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

DROP INDEX app.interest_grouping_idx;
ALTER TABLE app.interest DROP CONSTRAINT interest_edition_fkey;
ALTER TABLE app.interest DROP CONSTRAINT interest_concept_id_fkey;
ALTER TABLE app.interest DROP COLUMN concept_id;
ALTER TABLE app.interest RENAME COLUMN edition_id TO home_edition_id;
ALTER TABLE app.interest ALTER COLUMN home_edition_id SET NOT NULL;
ALTER TABLE app.interest
  ADD CONSTRAINT interest_home_edition_id_fkey FOREIGN KEY (home_edition_id) REFERENCES app.home_edition (id);
ALTER TABLE app.interest RENAME COLUMN region TO desired_location;
ALTER TABLE app.interest RENAME CONSTRAINT interest_region_check TO interest_desired_location_check;
-- Agrupamento do Admin (BR-062): Home Edition → localização pretendida → modalidade.
CREATE INDEX interest_grouping_idx ON app.interest (home_edition_id, desired_location, modality);

-- migrate:down
-- Fail-closed: o `concept_id` obrigatório não pode ser preenchido (o interesse é só inserção).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.interest) THEN
    RAISE EXCEPTION 'W4.2 rollback precondition: interest has rows; concept_id cannot be restored in an insert-only table'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

DROP INDEX app.interest_grouping_idx;
ALTER TABLE app.interest RENAME CONSTRAINT interest_desired_location_check TO interest_region_check;
ALTER TABLE app.interest RENAME COLUMN desired_location TO region;
ALTER TABLE app.interest DROP CONSTRAINT interest_home_edition_id_fkey;
ALTER TABLE app.interest ALTER COLUMN home_edition_id DROP NOT NULL;
ALTER TABLE app.interest RENAME COLUMN home_edition_id TO edition_id;
ALTER TABLE app.interest ADD COLUMN concept_id uuid NOT NULL;
ALTER TABLE app.interest
  ADD CONSTRAINT interest_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES app.home_concept (id);
ALTER TABLE app.interest
  ADD CONSTRAINT interest_edition_fkey FOREIGN KEY (edition_id, concept_id)
  REFERENCES app.home_edition (id, home_concept_id);
CREATE INDEX interest_grouping_idx ON app.interest (concept_id, region, modality);
