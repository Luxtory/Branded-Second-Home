-- migrate:up
-- W4.2 (ADR-0019; `03` v3.15 §3.1; dependency map em docs/plan/w4-2-ontologia.md): o Concept passa a Home Concept em
-- todo o schema. RENAME preserva OIDs, dados, FKs, grants e as referências das policies; funções cujo corpo cita um
-- nome renomeado recebem o corpo novo nesta mesma migration. Os atributos físicos saem da versão (passam à Home
-- Edition, migration catalog_home_edition) e a chave do Storage da capa passa a `home-concept-media/`.

-- Precondições fail-closed: nada que estas mudanças descartariam pode existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.concept_version
             WHERE guests_max IS NOT NULL OR suites IS NOT NULL OR built_area_m2 IS NOT NULL) THEN
    RAISE EXCEPTION 'W4.2 precondition: concept_version has physical attributes; they would be dropped'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM app.concept_media_file) THEN
    RAISE EXCEPTION 'W4.2 precondition: concept_media_file has rows; their Storage keys would change'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;


-- Tabelas e colunas.
ALTER TABLE app.concept_version_term RENAME TO home_concept_version_term;
ALTER TABLE app.concept_version RENAME TO home_concept_version;
ALTER TABLE app.concept_media_file RENAME TO home_concept_media_file;
ALTER TABLE app.concept_media RENAME TO home_concept_media;
ALTER TABLE app.concept_curation RENAME TO home_concept_curation;
ALTER TABLE app.concept RENAME TO home_concept;
ALTER TABLE app.home_concept_version RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.home_concept_version_term RENAME COLUMN concept_version_id TO home_concept_version_id;
ALTER TABLE app.home_concept_media RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.home_concept_curation RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.investor_authorization RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.home_concept_version
  DROP COLUMN guests_max,
  DROP COLUMN suites,
  DROP COLUMN built_area_m2;

-- Constraints (PRIMARY KEY/UNIQUE renomeiam o índice junto) e a chave do Storage.
ALTER TABLE app.home_concept RENAME CONSTRAINT concept_brand_partner_id_fkey TO home_concept_brand_partner_id_fkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT concept_operation_id_fkey TO home_concept_operation_id_fkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT concept_operation_id_key TO home_concept_operation_id_key;
ALTER TABLE app.home_concept RENAME CONSTRAINT concept_pkey TO home_concept_pkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT concept_title_check TO home_concept_title_check;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT concept_curation_concept_id_fkey TO home_concept_curation_home_concept_id_fkey;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT concept_curation_operation_id_fkey TO home_concept_curation_operation_id_fkey;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT concept_curation_pkey TO home_concept_curation_pkey;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT concept_curation_rank_check TO home_concept_curation_rank_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_alt_check TO home_concept_media_alt_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_approval_check TO home_concept_media_approval_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_approval_operation_id_fkey TO home_concept_media_approval_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_approval_operation_id_key TO home_concept_media_approval_operation_id_key;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_approved_role_check TO home_concept_media_approved_role_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_concept_id_fkey TO home_concept_media_home_concept_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_credit_check TO home_concept_media_credit_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_crop_x_check TO home_concept_media_crop_x_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_crop_y_check TO home_concept_media_crop_y_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_lifecycle_check TO home_concept_media_lifecycle_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_operation_id_fkey TO home_concept_media_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_operation_id_key TO home_concept_media_operation_id_key;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_pkey TO home_concept_media_pkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_source_sha256_check TO home_concept_media_source_sha256_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_state_check TO home_concept_media_state_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_withdrawal_basis_check TO home_concept_media_withdrawal_basis_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_withdrawal_check TO home_concept_media_withdrawal_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_withdrawal_operation_id_fkey TO home_concept_media_withdrawal_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT concept_media_withdrawal_operation_id_key TO home_concept_media_withdrawal_operation_id_key;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_byte_size_check TO home_concept_media_file_byte_size_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_content_type_check TO home_concept_media_file_content_type_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_media_id_fkey TO home_concept_media_file_media_id_fkey;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_pkey TO home_concept_media_file_pkey;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_role_check TO home_concept_media_file_role_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_sha256_check TO home_concept_media_file_sha256_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT concept_media_file_size_check TO home_concept_media_file_size_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_approval_check TO home_concept_version_approval_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_approval_operation_id_fkey TO home_concept_version_approval_operation_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_approval_operation_id_key TO home_concept_version_approval_operation_id_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_approval_refs_check TO home_concept_version_approval_refs_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_approved_role_check TO home_concept_version_approved_role_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_concept_id_fkey TO home_concept_version_home_concept_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_concept_key TO home_concept_version_home_concept_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_essential_elements_check TO home_concept_version_essential_elements_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_number_key TO home_concept_version_number_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_operation_id_fkey TO home_concept_version_operation_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_operation_id_key TO home_concept_version_operation_id_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_pkey TO home_concept_version_pkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_preservation_premises_check TO home_concept_version_preservation_premises_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_specification_check TO home_concept_version_specification_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_state_check TO home_concept_version_state_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_summary_check TO home_concept_version_summary_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT concept_version_version_check TO home_concept_version_version_check;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT concept_version_term_concept_version_id_fkey TO home_concept_version_term_home_concept_version_id_fkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT concept_version_term_pkey TO home_concept_version_term_pkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT concept_version_term_position_check TO home_concept_version_term_position_check;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT concept_version_term_term_fkey TO home_concept_version_term_term_fkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT concept_version_term_unique_key TO home_concept_version_term_unique_key;
ALTER TABLE app.investor_authorization RENAME CONSTRAINT investor_authorization_concept_id_fkey TO investor_authorization_home_concept_id_fkey;
ALTER TABLE app.investor_authorization RENAME CONSTRAINT investor_authorization_concept_key TO investor_authorization_home_concept_key;
ALTER TABLE app.home_concept_media_file DROP CONSTRAINT concept_media_file_check;
ALTER TABLE app.home_concept_media_file ADD CONSTRAINT home_concept_media_file_storage_key_check
  CHECK (storage_key = 'home-concept-media/' || sha256 || '.webp');

-- Índices avulsos, gatilhos e policies.
ALTER INDEX app.concept_brand_partner_idx RENAME TO home_concept_brand_partner_idx;
ALTER INDEX app.concept_curation_featured_idx RENAME TO home_concept_curation_featured_idx;
ALTER INDEX app.concept_media_concept_idx RENAME TO home_concept_media_home_home_concept_idx;
ALTER INDEX app.concept_media_current_cover_idx RENAME TO home_concept_media_current_cover_idx;
ALTER INDEX app.concept_media_file_master_idx RENAME TO home_concept_media_file_master_idx;
ALTER INDEX app.concept_version_approved_idx RENAME TO home_concept_version_approved_idx;
ALTER INDEX app.concept_version_term_term_idx RENAME TO home_concept_version_term_term_idx;
ALTER INDEX app.investor_authorization_concept_idx RENAME TO investor_authorization_home_home_concept_idx;
ALTER TRIGGER concept_no_delete ON app.home_concept RENAME TO home_concept_no_delete;
ALTER TRIGGER concept_no_truncate ON app.home_concept RENAME TO home_concept_no_truncate;
ALTER TRIGGER concept_no_update ON app.home_concept RENAME TO home_concept_no_update;
ALTER TRIGGER concept_curation_guard ON app.home_concept_curation RENAME TO home_concept_curation_guard;
ALTER TRIGGER concept_curation_no_delete ON app.home_concept_curation RENAME TO home_concept_curation_no_delete;
ALTER TRIGGER concept_curation_no_truncate ON app.home_concept_curation RENAME TO home_concept_curation_no_truncate;
ALTER TRIGGER concept_media_no_delete ON app.home_concept_media RENAME TO home_concept_media_no_delete;
ALTER TRIGGER concept_media_no_truncate ON app.home_concept_media RENAME TO home_concept_media_no_truncate;
ALTER TRIGGER concept_media_transition ON app.home_concept_media RENAME TO home_concept_media_transition;
ALTER TRIGGER concept_media_file_guard ON app.home_concept_media_file RENAME TO home_concept_media_file_guard;
ALTER TRIGGER concept_media_file_no_delete ON app.home_concept_media_file RENAME TO home_concept_media_file_no_delete;
ALTER TRIGGER concept_media_file_no_truncate ON app.home_concept_media_file RENAME TO home_concept_media_file_no_truncate;
ALTER TRIGGER concept_media_file_no_update ON app.home_concept_media_file RENAME TO home_concept_media_file_no_update;
ALTER TRIGGER concept_version_no_delete ON app.home_concept_version RENAME TO home_concept_version_no_delete;
ALTER TRIGGER concept_version_no_truncate ON app.home_concept_version RENAME TO home_concept_version_no_truncate;
ALTER TRIGGER concept_version_transition ON app.home_concept_version RENAME TO home_concept_version_transition;
ALTER TRIGGER concept_version_term_guard ON app.home_concept_version_term RENAME TO home_concept_version_term_guard;
ALTER TRIGGER concept_version_term_no_delete ON app.home_concept_version_term RENAME TO home_concept_version_term_no_delete;
ALTER TRIGGER concept_version_term_no_truncate ON app.home_concept_version_term RENAME TO home_concept_version_term_no_truncate;
ALTER TRIGGER concept_version_term_no_update ON app.home_concept_version_term RENAME TO home_concept_version_term_no_update;
ALTER POLICY concept_app_insert ON app.home_concept RENAME TO home_concept_app_insert;
ALTER POLICY concept_app_read ON app.home_concept RENAME TO home_concept_app_read;
ALTER POLICY concept_public_read ON app.home_concept RENAME TO home_concept_public_read;
ALTER POLICY concept_curation_app_insert ON app.home_concept_curation RENAME TO home_concept_curation_app_insert;
ALTER POLICY concept_curation_app_read ON app.home_concept_curation RENAME TO home_concept_curation_app_read;
ALTER POLICY concept_curation_app_update ON app.home_concept_curation RENAME TO home_concept_curation_app_update;
ALTER POLICY concept_curation_public_read ON app.home_concept_curation RENAME TO home_concept_curation_public_read;
ALTER POLICY concept_media_app_insert ON app.home_concept_media RENAME TO home_concept_media_app_insert;
ALTER POLICY concept_media_app_read ON app.home_concept_media RENAME TO home_concept_media_app_read;
ALTER POLICY concept_media_app_update ON app.home_concept_media RENAME TO home_concept_media_app_update;
ALTER POLICY concept_media_public_read ON app.home_concept_media RENAME TO home_concept_media_public_read;
ALTER POLICY concept_media_file_app_insert ON app.home_concept_media_file RENAME TO home_concept_media_file_app_insert;
ALTER POLICY concept_media_file_app_read ON app.home_concept_media_file RENAME TO home_concept_media_file_app_read;
ALTER POLICY concept_media_file_public_read ON app.home_concept_media_file RENAME TO home_concept_media_file_public_read;
ALTER POLICY concept_version_app_insert ON app.home_concept_version RENAME TO home_concept_version_app_insert;
ALTER POLICY concept_version_app_read ON app.home_concept_version RENAME TO home_concept_version_app_read;
ALTER POLICY concept_version_app_update ON app.home_concept_version RENAME TO home_concept_version_app_update;
ALTER POLICY concept_version_public_read ON app.home_concept_version RENAME TO home_concept_version_public_read;
ALTER POLICY concept_version_term_app_insert ON app.home_concept_version_term RENAME TO home_concept_version_term_app_insert;
ALTER POLICY concept_version_term_app_read ON app.home_concept_version_term RENAME TO home_concept_version_term_app_read;
ALTER POLICY concept_version_term_public_read ON app.home_concept_version_term RENAME TO home_concept_version_term_public_read;

-- Funções de gatilho: nome e corpo novos (os gatilhos seguem pelo OID).
ALTER FUNCTION app.concept_version_transition() RENAME TO home_concept_version_transition;
ALTER FUNCTION app.concept_version_term_guard() RENAME TO home_concept_version_term_guard;
ALTER FUNCTION app.concept_media_transition() RENAME TO home_concept_media_transition;
ALTER FUNCTION app.concept_media_file_guard() RENAME TO home_concept_media_file_guard;
ALTER FUNCTION app.concept_curation_guard() RENAME TO home_concept_curation_guard;
CREATE OR REPLACE FUNCTION app.home_concept_version_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'not_approved'
     OR NEW.state <> 'approved'
     OR (to_jsonb(NEW) - 'state' - 'approval_refs' - 'approved_at' - 'approved_by_user_id' - 'approved_role'
                       - 'approval_operation_id')
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'state' - 'approval_refs' - 'approved_at' - 'approved_by_user_id' - 'approved_role'
                       - 'approval_operation_id')
  THEN
    RAISE EXCEPTION 'app.home_concept_version: only the approval of a not approved version can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.home_concept_version_term_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM app.home_concept_version AS version
       WHERE version.id = NEW.home_concept_version_id AND version.state = 'not_approved'
     )
     OR NOT EXISTS (SELECT 1 FROM app.catalog_term AS term WHERE term.id = NEW.term_id AND term.active)
  THEN
    RAISE EXCEPTION 'app.home_concept_version_term: only an active term can classify a not approved version'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.home_concept_media_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'state' - 'approved_at' - 'approved_by_user_id' - 'approved_role' - 'approval_operation_id'
                    - 'withdrawn_at' - 'withdrawal_basis' - 'withdrawal_operation_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'state' - 'approved_at' - 'approved_by_user_id' - 'approved_role' - 'approval_operation_id'
                    - 'withdrawn_at' - 'withdrawal_basis' - 'withdrawal_operation_id')
     OR NOT ((OLD.state = 'pending' AND NEW.state = 'approved')
             OR (OLD.state = 'pending' AND NEW.state = 'withdrawn' AND NEW.approved_at IS NULL)
             OR (OLD.state = 'approved' AND NEW.state = 'withdrawn'
                 AND (NEW.approved_at, NEW.approved_by_user_id, NEW.approved_role, NEW.approval_operation_id)
                     IS NOT DISTINCT FROM
                     (OLD.approved_at, OLD.approved_by_user_id, OLD.approved_role, OLD.approval_operation_id)))
  THEN
    RAISE EXCEPTION 'app.home_concept_media: only a single approval and a single withdrawal can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.home_concept_media_file_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM app.home_concept_media AS media WHERE media.id = NEW.media_id AND media.state = 'pending'
     )
  THEN
    RAISE EXCEPTION 'app.home_concept_media_file: files are added only to a pending media'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.home_concept_curation_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.featured AND NOT EXISTS (
       SELECT 1 FROM app.home_concept_media AS media
       WHERE media.home_concept_id = NEW.home_concept_id AND media.state = 'approved'
     )
  THEN
    RAISE EXCEPTION 'app.home_concept_curation: a featured Home Concept needs an approved cover'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.home_concept_id IS DISTINCT FROM OLD.home_concept_id THEN
    RAISE EXCEPTION 'app.home_concept_curation: the Home Concept cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- Predicado de visibilidade: função nova (o nome do parâmetro não muda por REPLACE); as policies passam a ela e a
-- antiga sai sem CASCADE.
CREATE FUNCTION app.home_concept_is_public(p_home_concept_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.home_concept AS home_concept
    WHERE home_concept.id = p_home_concept_id
      AND app.brand_partner_is_public(home_concept.brand_partner_id)
      AND EXISTS (
        SELECT 1
        FROM app.home_concept_version AS version
        WHERE version.home_concept_id = home_concept.id AND version.state = 'approved'
      )
  )
$$;

REVOKE ALL ON FUNCTION app.home_concept_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.home_concept_is_public(uuid) TO anon;

ALTER POLICY home_concept_public_read ON app.home_concept USING (app.home_concept_is_public(id));
ALTER POLICY home_concept_version_public_read ON app.home_concept_version USING (state = 'approved' AND app.home_concept_is_public(home_concept_id));
ALTER POLICY home_concept_media_public_read ON app.home_concept_media USING (state = 'approved' AND app.home_concept_is_public(home_concept_id));
ALTER POLICY home_concept_curation_public_read ON app.home_concept_curation USING (app.home_concept_is_public(home_concept_id));
ALTER POLICY edition_public_read ON app.edition USING (app.home_concept_is_public(concept_id));

CREATE OR REPLACE FUNCTION app.catalog_term_is_public(p_term_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.catalog_term AS term
    JOIN app.home_concept_version_term AS classification ON classification.term_id = term.id
    JOIN app.home_concept_version AS version ON version.id = classification.home_concept_version_id
    WHERE term.id = p_term_id
      AND term.active
      AND version.state = 'approved'
      AND app.home_concept_is_public(version.home_concept_id)
  )
$$;

DROP FUNCTION app.concept_is_public(uuid);

-- Base do registro de Second Home: corpo intermediário com os nomes desta migration (a tabela da Second Home é
-- renomeada na migration catalog_second_home).
CREATE OR REPLACE FUNCTION app.residence_require_basis() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_current uuid;
BEGIN
  SELECT id INTO v_current FROM app.home_concept_version
  WHERE home_concept_id = NEW.concept_id AND state = 'approved'
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

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.home_concept_media_file) THEN
    RAISE EXCEPTION 'W4.2 rollback precondition: home_concept_media_file has rows; their Storage keys would change'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE FUNCTION app.concept_is_public(p_concept_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.home_concept AS concept
    WHERE concept.id = p_concept_id
      AND app.brand_partner_is_public(concept.brand_partner_id)
      AND EXISTS (
        SELECT 1
        FROM app.home_concept_version AS version
        WHERE version.home_concept_id = concept.id AND version.state = 'approved'
      )
  )
$$;

REVOKE ALL ON FUNCTION app.concept_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.concept_is_public(uuid) TO anon;

ALTER POLICY home_concept_public_read ON app.home_concept USING (app.concept_is_public(id));
ALTER POLICY home_concept_version_public_read ON app.home_concept_version USING (state = 'approved' AND app.concept_is_public(home_concept_id));
ALTER POLICY home_concept_media_public_read ON app.home_concept_media USING (state = 'approved' AND app.concept_is_public(home_concept_id));
ALTER POLICY home_concept_curation_public_read ON app.home_concept_curation USING (app.concept_is_public(home_concept_id));
ALTER POLICY edition_public_read ON app.edition USING (app.concept_is_public(concept_id));
DROP FUNCTION app.home_concept_is_public(uuid);

ALTER FUNCTION app.home_concept_version_transition() RENAME TO concept_version_transition;
ALTER FUNCTION app.home_concept_version_term_guard() RENAME TO concept_version_term_guard;
ALTER FUNCTION app.home_concept_media_transition() RENAME TO concept_media_transition;
ALTER FUNCTION app.home_concept_media_file_guard() RENAME TO concept_media_file_guard;
ALTER FUNCTION app.home_concept_curation_guard() RENAME TO concept_curation_guard;
ALTER POLICY home_concept_version_term_public_read ON app.home_concept_version_term RENAME TO concept_version_term_public_read;
ALTER POLICY home_concept_version_term_app_read ON app.home_concept_version_term RENAME TO concept_version_term_app_read;
ALTER POLICY home_concept_version_term_app_insert ON app.home_concept_version_term RENAME TO concept_version_term_app_insert;
ALTER POLICY home_concept_version_public_read ON app.home_concept_version RENAME TO concept_version_public_read;
ALTER POLICY home_concept_version_app_update ON app.home_concept_version RENAME TO concept_version_app_update;
ALTER POLICY home_concept_version_app_read ON app.home_concept_version RENAME TO concept_version_app_read;
ALTER POLICY home_concept_version_app_insert ON app.home_concept_version RENAME TO concept_version_app_insert;
ALTER POLICY home_concept_media_file_public_read ON app.home_concept_media_file RENAME TO concept_media_file_public_read;
ALTER POLICY home_concept_media_file_app_read ON app.home_concept_media_file RENAME TO concept_media_file_app_read;
ALTER POLICY home_concept_media_file_app_insert ON app.home_concept_media_file RENAME TO concept_media_file_app_insert;
ALTER POLICY home_concept_media_public_read ON app.home_concept_media RENAME TO concept_media_public_read;
ALTER POLICY home_concept_media_app_update ON app.home_concept_media RENAME TO concept_media_app_update;
ALTER POLICY home_concept_media_app_read ON app.home_concept_media RENAME TO concept_media_app_read;
ALTER POLICY home_concept_media_app_insert ON app.home_concept_media RENAME TO concept_media_app_insert;
ALTER POLICY home_concept_curation_public_read ON app.home_concept_curation RENAME TO concept_curation_public_read;
ALTER POLICY home_concept_curation_app_update ON app.home_concept_curation RENAME TO concept_curation_app_update;
ALTER POLICY home_concept_curation_app_read ON app.home_concept_curation RENAME TO concept_curation_app_read;
ALTER POLICY home_concept_curation_app_insert ON app.home_concept_curation RENAME TO concept_curation_app_insert;
ALTER POLICY home_concept_public_read ON app.home_concept RENAME TO concept_public_read;
ALTER POLICY home_concept_app_read ON app.home_concept RENAME TO concept_app_read;
ALTER POLICY home_concept_app_insert ON app.home_concept RENAME TO concept_app_insert;
ALTER TRIGGER home_concept_version_term_no_update ON app.home_concept_version_term RENAME TO concept_version_term_no_update;
ALTER TRIGGER home_concept_version_term_no_truncate ON app.home_concept_version_term RENAME TO concept_version_term_no_truncate;
ALTER TRIGGER home_concept_version_term_no_delete ON app.home_concept_version_term RENAME TO concept_version_term_no_delete;
ALTER TRIGGER home_concept_version_term_guard ON app.home_concept_version_term RENAME TO concept_version_term_guard;
ALTER TRIGGER home_concept_version_transition ON app.home_concept_version RENAME TO concept_version_transition;
ALTER TRIGGER home_concept_version_no_truncate ON app.home_concept_version RENAME TO concept_version_no_truncate;
ALTER TRIGGER home_concept_version_no_delete ON app.home_concept_version RENAME TO concept_version_no_delete;
ALTER TRIGGER home_concept_media_file_no_update ON app.home_concept_media_file RENAME TO concept_media_file_no_update;
ALTER TRIGGER home_concept_media_file_no_truncate ON app.home_concept_media_file RENAME TO concept_media_file_no_truncate;
ALTER TRIGGER home_concept_media_file_no_delete ON app.home_concept_media_file RENAME TO concept_media_file_no_delete;
ALTER TRIGGER home_concept_media_file_guard ON app.home_concept_media_file RENAME TO concept_media_file_guard;
ALTER TRIGGER home_concept_media_transition ON app.home_concept_media RENAME TO concept_media_transition;
ALTER TRIGGER home_concept_media_no_truncate ON app.home_concept_media RENAME TO concept_media_no_truncate;
ALTER TRIGGER home_concept_media_no_delete ON app.home_concept_media RENAME TO concept_media_no_delete;
ALTER TRIGGER home_concept_curation_no_truncate ON app.home_concept_curation RENAME TO concept_curation_no_truncate;
ALTER TRIGGER home_concept_curation_no_delete ON app.home_concept_curation RENAME TO concept_curation_no_delete;
ALTER TRIGGER home_concept_curation_guard ON app.home_concept_curation RENAME TO concept_curation_guard;
ALTER TRIGGER home_concept_no_update ON app.home_concept RENAME TO concept_no_update;
ALTER TRIGGER home_concept_no_truncate ON app.home_concept RENAME TO concept_no_truncate;
ALTER TRIGGER home_concept_no_delete ON app.home_concept RENAME TO concept_no_delete;
ALTER INDEX app.investor_authorization_home_home_concept_idx RENAME TO investor_authorization_concept_idx;
ALTER INDEX app.home_concept_version_term_term_idx RENAME TO concept_version_term_term_idx;
ALTER INDEX app.home_concept_version_approved_idx RENAME TO concept_version_approved_idx;
ALTER INDEX app.home_concept_media_file_master_idx RENAME TO concept_media_file_master_idx;
ALTER INDEX app.home_concept_media_current_cover_idx RENAME TO concept_media_current_cover_idx;
ALTER INDEX app.home_concept_media_home_home_concept_idx RENAME TO concept_media_concept_idx;
ALTER INDEX app.home_concept_curation_featured_idx RENAME TO concept_curation_featured_idx;
ALTER INDEX app.home_concept_brand_partner_idx RENAME TO concept_brand_partner_idx;
ALTER TABLE app.home_concept_media_file DROP CONSTRAINT home_concept_media_file_storage_key_check;
ALTER TABLE app.home_concept_media_file ADD CONSTRAINT concept_media_file_check
  CHECK (storage_key = 'concept-media/' || sha256 || '.webp');
ALTER TABLE app.investor_authorization RENAME CONSTRAINT investor_authorization_home_concept_key TO investor_authorization_concept_key;
ALTER TABLE app.investor_authorization RENAME CONSTRAINT investor_authorization_home_concept_id_fkey TO investor_authorization_concept_id_fkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT home_concept_version_term_unique_key TO concept_version_term_unique_key;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT home_concept_version_term_term_fkey TO concept_version_term_term_fkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT home_concept_version_term_position_check TO concept_version_term_position_check;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT home_concept_version_term_pkey TO concept_version_term_pkey;
ALTER TABLE app.home_concept_version_term RENAME CONSTRAINT home_concept_version_term_home_concept_version_id_fkey TO concept_version_term_concept_version_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_version_check TO concept_version_version_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_summary_check TO concept_version_summary_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_state_check TO concept_version_state_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_specification_check TO concept_version_specification_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_preservation_premises_check TO concept_version_preservation_premises_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_pkey TO concept_version_pkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_operation_id_key TO concept_version_operation_id_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_operation_id_fkey TO concept_version_operation_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_number_key TO concept_version_number_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_essential_elements_check TO concept_version_essential_elements_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_home_concept_key TO concept_version_concept_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_home_concept_id_fkey TO concept_version_concept_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_approved_role_check TO concept_version_approved_role_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_approval_refs_check TO concept_version_approval_refs_check;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_approval_operation_id_key TO concept_version_approval_operation_id_key;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_approval_operation_id_fkey TO concept_version_approval_operation_id_fkey;
ALTER TABLE app.home_concept_version RENAME CONSTRAINT home_concept_version_approval_check TO concept_version_approval_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_size_check TO concept_media_file_size_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_sha256_check TO concept_media_file_sha256_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_role_check TO concept_media_file_role_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_pkey TO concept_media_file_pkey;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_media_id_fkey TO concept_media_file_media_id_fkey;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_content_type_check TO concept_media_file_content_type_check;
ALTER TABLE app.home_concept_media_file RENAME CONSTRAINT home_concept_media_file_byte_size_check TO concept_media_file_byte_size_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_withdrawal_operation_id_key TO concept_media_withdrawal_operation_id_key;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_withdrawal_operation_id_fkey TO concept_media_withdrawal_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_withdrawal_check TO concept_media_withdrawal_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_withdrawal_basis_check TO concept_media_withdrawal_basis_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_state_check TO concept_media_state_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_source_sha256_check TO concept_media_source_sha256_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_pkey TO concept_media_pkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_operation_id_key TO concept_media_operation_id_key;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_operation_id_fkey TO concept_media_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_lifecycle_check TO concept_media_lifecycle_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_crop_y_check TO concept_media_crop_y_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_crop_x_check TO concept_media_crop_x_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_credit_check TO concept_media_credit_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_home_concept_id_fkey TO concept_media_concept_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_approved_role_check TO concept_media_approved_role_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_approval_operation_id_key TO concept_media_approval_operation_id_key;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_approval_operation_id_fkey TO concept_media_approval_operation_id_fkey;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_approval_check TO concept_media_approval_check;
ALTER TABLE app.home_concept_media RENAME CONSTRAINT home_concept_media_alt_check TO concept_media_alt_check;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT home_concept_curation_rank_check TO concept_curation_rank_check;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT home_concept_curation_pkey TO concept_curation_pkey;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT home_concept_curation_operation_id_fkey TO concept_curation_operation_id_fkey;
ALTER TABLE app.home_concept_curation RENAME CONSTRAINT home_concept_curation_home_concept_id_fkey TO concept_curation_concept_id_fkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT home_concept_title_check TO concept_title_check;
ALTER TABLE app.home_concept RENAME CONSTRAINT home_concept_pkey TO concept_pkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT home_concept_operation_id_key TO concept_operation_id_key;
ALTER TABLE app.home_concept RENAME CONSTRAINT home_concept_operation_id_fkey TO concept_operation_id_fkey;
ALTER TABLE app.home_concept RENAME CONSTRAINT home_concept_brand_partner_id_fkey TO concept_brand_partner_id_fkey;
ALTER TABLE app.home_concept_version
  ADD COLUMN guests_max smallint CONSTRAINT concept_version_guests_max_check CHECK (guests_max BETWEEN 1 AND 100),
  ADD COLUMN suites smallint CONSTRAINT concept_version_suites_check CHECK (suites BETWEEN 1 AND 50),
  ADD COLUMN built_area_m2 integer CONSTRAINT concept_version_built_area_m2_check
    CHECK (built_area_m2 BETWEEN 1 AND 100000);
GRANT SELECT (guests_max, suites, built_area_m2) ON app.home_concept_version TO anon;
ALTER TABLE app.investor_authorization RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.home_concept_curation RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.home_concept_media RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.home_concept_version_term RENAME COLUMN home_concept_version_id TO concept_version_id;
ALTER TABLE app.home_concept_version RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.home_concept RENAME TO concept;
ALTER TABLE app.home_concept_curation RENAME TO concept_curation;
ALTER TABLE app.home_concept_media RENAME TO concept_media;
ALTER TABLE app.home_concept_media_file RENAME TO concept_media_file;
ALTER TABLE app.home_concept_version RENAME TO concept_version;
ALTER TABLE app.home_concept_version_term RENAME TO concept_version_term;

CREATE OR REPLACE FUNCTION app.concept_version_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'not_approved'
     OR NEW.state <> 'approved'
     OR (to_jsonb(NEW) - 'state' - 'approval_refs' - 'approved_at' - 'approved_by_user_id' - 'approved_role'
                       - 'approval_operation_id')
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'state' - 'approval_refs' - 'approved_at' - 'approved_by_user_id' - 'approved_role'
                       - 'approval_operation_id')
  THEN
    RAISE EXCEPTION 'app.concept_version: only the approval of a not approved version can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.concept_version_term_guard() RETURNS trigger
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

CREATE OR REPLACE FUNCTION app.concept_media_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'state' - 'approved_at' - 'approved_by_user_id' - 'approved_role' - 'approval_operation_id'
                    - 'withdrawn_at' - 'withdrawal_basis' - 'withdrawal_operation_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'state' - 'approved_at' - 'approved_by_user_id' - 'approved_role' - 'approval_operation_id'
                    - 'withdrawn_at' - 'withdrawal_basis' - 'withdrawal_operation_id')
     OR NOT ((OLD.state = 'pending' AND NEW.state = 'approved')
             OR (OLD.state = 'pending' AND NEW.state = 'withdrawn' AND NEW.approved_at IS NULL)
             OR (OLD.state = 'approved' AND NEW.state = 'withdrawn'
                 AND (NEW.approved_at, NEW.approved_by_user_id, NEW.approved_role, NEW.approval_operation_id)
                     IS NOT DISTINCT FROM
                     (OLD.approved_at, OLD.approved_by_user_id, OLD.approved_role, OLD.approval_operation_id)))
  THEN
    RAISE EXCEPTION 'app.concept_media: only a single approval and a single withdrawal can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.concept_media_file_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.concept_media AS media WHERE media.id = NEW.media_id AND media.state = 'pending')
  THEN
    RAISE EXCEPTION 'app.concept_media_file: files are added only to a pending media'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.concept_curation_guard() RETURNS trigger
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

CREATE OR REPLACE FUNCTION app.concept_is_public(p_concept_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.concept AS concept
    WHERE concept.id = p_concept_id
      AND app.brand_partner_is_public(concept.brand_partner_id)
      AND EXISTS (
        SELECT 1
        FROM app.concept_version AS version
        WHERE version.concept_id = concept.id AND version.state = 'approved'
      )
  )
$$;

CREATE OR REPLACE FUNCTION app.catalog_term_is_public(p_term_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.catalog_term AS term
    JOIN app.concept_version_term AS classification ON classification.term_id = term.id
    JOIN app.concept_version AS version ON version.id = classification.concept_version_id
    WHERE term.id = p_term_id
      AND term.active
      AND version.state = 'approved'
      AND app.concept_is_public(version.concept_id)
  )
$$;

CREATE OR REPLACE FUNCTION app.residence_require_basis() RETURNS trigger
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
