-- migrate:up
-- W4.2 (ADR-0019; `01` v10.2 BR-031, BR-032, BR-036; `03` v3.15 §3.1; spec catalog §17.2–§17.3): a Edition passa a Home
-- Edition — configuração específica e replicável de Second Home, sem localização, modalidade nem condições comerciais.
-- RENAME preserva as FKs que chegam nela (Second Home, interesse, valor de referência); saem `region`, `modality` e
-- `commercial_conditions`; entram a definição material, os campos editoriais, o estado material (preparação →
-- finalizada; correção do fundador de 2026-10-19, `02` v4.3 REQ-022) e a visibilidade pública, separada dele.
-- A F2a do interesse (modalidade contra a Edition) sai aqui, porque lia a modalidade que deixa de existir.

-- Precondição fail-closed: as colunas novas são obrigatórias e a modalidade não tem destino.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.edition) THEN
    RAISE EXCEPTION 'W4.2 precondition: edition has rows; region, modality and commercial conditions would be lost'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

DROP TRIGGER interest_modality_offered ON app.interest;
DROP FUNCTION app.interest_modality_offered();

ALTER TABLE app.edition RENAME TO home_edition;
ALTER TABLE app.home_edition RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.home_edition
  DROP COLUMN region,
  DROP COLUMN modality,
  DROP COLUMN commercial_conditions;

ALTER TABLE app.home_edition RENAME CONSTRAINT edition_pkey TO home_edition_pkey;
ALTER TABLE app.home_edition RENAME CONSTRAINT edition_concept_id_fkey TO home_edition_home_concept_id_fkey;
ALTER TABLE app.home_edition RENAME CONSTRAINT edition_concept_key TO home_edition_home_concept_key;
ALTER TABLE app.home_edition RENAME CONSTRAINT edition_operation_id_fkey TO home_edition_operation_id_fkey;
ALTER TABLE app.home_edition RENAME CONSTRAINT edition_operation_id_key TO home_edition_operation_id_key;
ALTER INDEX app.edition_concept_idx RENAME TO home_edition_home_concept_idx;

-- Definição material, campos editoriais, estado material e visibilidade pública. Limites técnicos (TECH-100), não
-- regras de negócio.
ALTER TABLE app.home_edition
  ADD COLUMN name text NOT NULL CONSTRAINT home_edition_name_check CHECK (length(name) BETWEEN 1 AND 200),
  ADD COLUMN description text NOT NULL
    CONSTRAINT home_edition_description_check CHECK (length(description) BETWEEN 1 AND 20000),
  ADD COLUMN typology text NOT NULL CONSTRAINT home_edition_typology_check CHECK (length(typology) BETWEEN 1 AND 200),
  ADD COLUMN spatial_configuration text NOT NULL
    CONSTRAINT home_edition_spatial_configuration_check CHECK (length(spatial_configuration) BETWEEN 1 AND 4000),
  ADD COLUMN projected_area_m2 integer NOT NULL
    CONSTRAINT home_edition_projected_area_m2_check CHECK (projected_area_m2 BETWEEN 1 AND 100000),
  ADD COLUMN suites smallint NOT NULL CONSTRAINT home_edition_suites_check CHECK (suites BETWEEN 1 AND 50),
  ADD COLUMN guests_max smallint NOT NULL CONSTRAINT home_edition_guests_max_check CHECK (guests_max BETWEEN 1 AND 100),
  ADD COLUMN rooms text[] CONSTRAINT home_edition_rooms_check CHECK (rooms IS NULL OR app.is_text_list(rooms, 50, 200)),
  ADD COLUMN amenities text[]
    CONSTRAINT home_edition_amenities_check CHECK (amenities IS NULL OR app.is_text_list(amenities, 50, 200)),
  ADD COLUMN characteristics text[] CONSTRAINT home_edition_characteristics_check
    CHECK (characteristics IS NULL OR app.is_text_list(characteristics, 50, 200)),
  ADD COLUMN material_state text NOT NULL
    CONSTRAINT home_edition_material_state_check CHECK (material_state IN ('draft', 'finalized')),
  ADD COLUMN finalized_at timestamptz,
  ADD COLUMN finalized_by_user_id uuid,
  ADD COLUMN finalized_role app.actor_role
    CONSTRAINT home_edition_finalized_role_check CHECK (finalized_role IN ('admin', 'super_admin')),
  ADD COLUMN finalization_operation_id uuid
    CONSTRAINT home_edition_finalization_operation_id_key UNIQUE
    CONSTRAINT home_edition_finalization_operation_id_fkey REFERENCES app.operation (id),
  ADD COLUMN visibility text NOT NULL
    CONSTRAINT home_edition_visibility_value_check CHECK (visibility IN ('hidden', 'public')),
  ADD COLUMN withdrawal_basis text
    CONSTRAINT home_edition_withdrawal_basis_check CHECK (length(withdrawal_basis) BETWEEN 1 AND 255),
  ADD CONSTRAINT home_edition_finalization_check CHECK (
    (material_state = 'finalized') = (finalized_at IS NOT NULL)
    AND (finalized_at IS NULL) = (finalized_by_user_id IS NULL)
    AND (finalized_by_user_id IS NULL) = (finalized_role IS NULL)
    AND (finalized_role IS NULL) = (finalization_operation_id IS NULL)
  ),
  -- Só Home Edition finalizada é pública (BR-036: depois de publicada, a definição material é imutável); a base da
  -- última retirada do público só existe fora do público.
  ADD CONSTRAINT home_edition_visibility_check CHECK (
    visibility = 'hidden' OR (material_state = 'finalized' AND withdrawal_basis IS NULL)
  );

-- BR-036 (`02` v4.3 REQ-022): o Home Concept, a identidade e a criação nunca mudam. Em preparação (`draft`), a definição
-- material e os textos mudam; a finalização acontece uma vez e não volta; depois dela a definição material, o estado e os
-- dados da finalização ficam imutáveis em qualquer caminho de escrita — só mudam os textos editoriais e a visibilidade
-- pública, que nunca reabre a definição material.
CREATE FUNCTION app.home_edition_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.home_concept_id, NEW.operation_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.home_concept_id, OLD.operation_id, OLD.created_at)
  THEN
    RAISE EXCEPTION 'app.home_edition: the Home Concept and the identity of a Home Edition never change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'home_edition_identity';
  END IF;
  IF OLD.material_state = 'finalized'
     AND (to_jsonb(NEW) - 'name' - 'description' - 'visibility' - 'withdrawal_basis')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'name' - 'description' - 'visibility' - 'withdrawal_basis')
  THEN
    RAISE EXCEPTION 'app.home_edition: the material definition of a finalized Home Edition never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'home_edition_material_immutable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER edition_no_update ON app.home_edition;
CREATE TRIGGER home_edition_transition BEFORE UPDATE ON app.home_edition
  FOR EACH ROW EXECUTE FUNCTION app.home_edition_transition();
ALTER TRIGGER edition_no_delete ON app.home_edition RENAME TO home_edition_no_delete;
ALTER TRIGGER edition_no_truncate ON app.home_edition RENAME TO home_edition_no_truncate;

ALTER POLICY edition_app_read ON app.home_edition RENAME TO home_edition_app_read;
ALTER POLICY edition_app_insert ON app.home_edition RENAME TO home_edition_app_insert;
CREATE POLICY home_edition_app_update ON app.home_edition FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
-- O UPDATE de coluna também habilita a trava da linha (`FOR NO KEY UPDATE`, ADR-0010 §8). O gatilho decide o que pode
-- mudar em cada estado.
GRANT UPDATE (name, description, typology, spatial_configuration, projected_area_m2, suites, guests_max, rooms,
              amenities, characteristics, material_state, finalized_at, finalized_by_user_id, finalized_role,
              finalization_operation_id, visibility, withdrawal_basis) ON app.home_edition TO luxtory_app;

-- Leitura pública (spec catalog §17.7): só pública (logo, finalizada), de Home Concept público; colunas publicáveis.
ALTER POLICY edition_public_read ON app.home_edition RENAME TO home_edition_public_read;
ALTER POLICY home_edition_public_read ON app.home_edition
  USING (visibility = 'public' AND app.home_concept_is_public(home_concept_id));
GRANT SELECT (name, description, typology, spatial_configuration, projected_area_m2, suites, guests_max, rooms,
              amenities, characteristics) ON app.home_edition TO anon;

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.home_edition) THEN
    RAISE EXCEPTION 'W4.2 rollback precondition: home_edition has rows; region, modality and commercial conditions would be invented'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

REVOKE SELECT (name, description, typology, spatial_configuration, projected_area_m2, suites, guests_max, rooms,
               amenities, characteristics) ON app.home_edition FROM anon;
ALTER POLICY home_edition_public_read ON app.home_edition USING (app.home_concept_is_public(home_concept_id));
ALTER POLICY home_edition_public_read ON app.home_edition RENAME TO edition_public_read;
REVOKE UPDATE (name, description, typology, spatial_configuration, projected_area_m2, suites, guests_max, rooms,
               amenities, characteristics, material_state, finalized_at, finalized_by_user_id, finalized_role,
               finalization_operation_id, visibility, withdrawal_basis) ON app.home_edition FROM luxtory_app;
DROP POLICY home_edition_app_update ON app.home_edition;
ALTER POLICY home_edition_app_insert ON app.home_edition RENAME TO edition_app_insert;
ALTER POLICY home_edition_app_read ON app.home_edition RENAME TO edition_app_read;

ALTER TRIGGER home_edition_no_truncate ON app.home_edition RENAME TO edition_no_truncate;
ALTER TRIGGER home_edition_no_delete ON app.home_edition RENAME TO edition_no_delete;
DROP TRIGGER home_edition_transition ON app.home_edition;
DROP FUNCTION app.home_edition_transition();
CREATE TRIGGER edition_no_update BEFORE UPDATE ON app.home_edition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.home_edition
  DROP COLUMN name,
  DROP COLUMN description,
  DROP COLUMN typology,
  DROP COLUMN spatial_configuration,
  DROP COLUMN projected_area_m2,
  DROP COLUMN suites,
  DROP COLUMN guests_max,
  DROP COLUMN rooms,
  DROP COLUMN amenities,
  DROP COLUMN characteristics,
  DROP COLUMN material_state,
  DROP COLUMN finalized_at,
  DROP COLUMN finalized_by_user_id,
  DROP COLUMN finalized_role,
  DROP COLUMN finalization_operation_id,
  DROP COLUMN visibility,
  DROP COLUMN withdrawal_basis;

ALTER INDEX app.home_edition_home_concept_idx RENAME TO edition_concept_idx;
ALTER TABLE app.home_edition RENAME CONSTRAINT home_edition_operation_id_key TO edition_operation_id_key;
ALTER TABLE app.home_edition RENAME CONSTRAINT home_edition_operation_id_fkey TO edition_operation_id_fkey;
ALTER TABLE app.home_edition RENAME CONSTRAINT home_edition_home_concept_key TO edition_concept_key;
ALTER TABLE app.home_edition RENAME CONSTRAINT home_edition_home_concept_id_fkey TO edition_concept_id_fkey;
ALTER TABLE app.home_edition RENAME CONSTRAINT home_edition_pkey TO edition_pkey;

ALTER TABLE app.home_edition
  ADD COLUMN region text NOT NULL CONSTRAINT edition_region_check CHECK (length(region) BETWEEN 1 AND 200),
  ADD COLUMN modality text NOT NULL
    CONSTRAINT edition_modality_check CHECK (modality IN ('owner', 'co_owner', 'owner_and_co_owner')),
  ADD COLUMN commercial_conditions text NOT NULL
    CONSTRAINT edition_commercial_conditions_check CHECK (length(commercial_conditions) BETWEEN 1 AND 20000);
GRANT SELECT (region, modality, commercial_conditions) ON app.home_edition TO anon;

ALTER TABLE app.home_edition RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.home_edition RENAME TO edition;

CREATE FUNCTION app.interest_modality_offered() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_offered text;
BEGIN
  IF NEW.edition_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT edition.modality INTO v_offered FROM app.edition AS edition WHERE edition.id = NEW.edition_id;
  IF v_offered IS NOT NULL AND v_offered <> 'owner_and_co_owner' AND v_offered <> NEW.modality THEN
    RAISE EXCEPTION 'app.interest: modality % is not offered by the edition', NEW.modality
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interest_modality_offered';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER interest_modality_offered BEFORE INSERT ON app.interest
  FOR EACH ROW EXECUTE FUNCTION app.interest_modality_offered();
