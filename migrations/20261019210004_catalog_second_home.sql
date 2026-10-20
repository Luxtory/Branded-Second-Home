-- migrate:up
-- W4.2 (ADR-0019; `01` v10.2 BR-003, BR-025, BR-035; `02` v4.3 REQ-022; `03` v3.15 §3.1): a Residence passa a Second Home.
-- RENAME preserva dados, FKs compostas (Home Edition, versão e autorização no mesmo Home Concept), grants e policies. A
-- base do registro passa a exigir Home Edition materialmente finalizada — a visibilidade pública não é condição.
ALTER TABLE app.residence RENAME TO second_home;
ALTER TABLE app.second_home RENAME COLUMN edition_id TO home_edition_id;
ALTER TABLE app.second_home RENAME COLUMN concept_id TO home_concept_id;
ALTER TABLE app.second_home RENAME COLUMN concept_version_id TO home_concept_version_id;

ALTER TABLE app.second_home RENAME CONSTRAINT residence_pkey TO second_home_pkey;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_edition_fk TO second_home_home_edition_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_concept_version_fk TO second_home_home_concept_version_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_investor_authorization_fk TO second_home_investor_authorization_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_label_check TO second_home_label_check;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_timezone_check TO second_home_timezone_check;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_operation_id_fkey TO second_home_operation_id_fkey;
ALTER TABLE app.second_home RENAME CONSTRAINT residence_operation_id_key TO second_home_operation_id_key;
ALTER INDEX app.residence_edition_idx RENAME TO second_home_home_edition_idx;
ALTER INDEX app.residence_investor_authorization_idx RENAME TO second_home_investor_authorization_idx;

ALTER TRIGGER residence_require_basis ON app.second_home RENAME TO second_home_require_basis;
ALTER TRIGGER residence_no_update ON app.second_home RENAME TO second_home_no_update;
ALTER TRIGGER residence_no_delete ON app.second_home RENAME TO second_home_no_delete;
ALTER TRIGGER residence_no_truncate ON app.second_home RENAME TO second_home_no_truncate;
ALTER POLICY residence_app_read ON app.second_home RENAME TO second_home_app_read;
ALTER POLICY residence_app_insert ON app.second_home RENAME TO second_home_app_insert;

-- Defesa no banco (o command revalida sob trava): Home Edition finalizada (definição material estável, BR-025/BR-036),
-- versão fixada = a aprovada vigente do Home Concept (BR-025) e autorização de Investor, se houver, não revogada e
-- vigente na aprovação comercial (REQ-027).
ALTER FUNCTION app.residence_require_basis() RENAME TO second_home_require_basis;
CREATE OR REPLACE FUNCTION app.second_home_require_basis() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_current uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.home_edition WHERE id = NEW.home_edition_id AND material_state = 'finalized'
  ) THEN
    RAISE EXCEPTION 'app.second_home: home edition % is not materially finalized', NEW.home_edition_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'second_home_home_edition_finalized';
  END IF;
  SELECT id INTO v_current FROM app.home_concept_version
  WHERE home_concept_id = NEW.home_concept_id AND state = 'approved'
  ORDER BY version DESC
  LIMIT 1;
  IF v_current IS NULL OR v_current <> NEW.home_concept_version_id THEN
    RAISE EXCEPTION 'app.second_home: home concept version % is not the current approved version',
      NEW.home_concept_version_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'second_home_home_concept_version_current';
  END IF;
  IF NEW.investor_authorization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.investor_authorization
    WHERE id = NEW.investor_authorization_id
      AND revoked_at IS NULL
      AND valid_from <= NEW.commercially_approved_at
      AND (valid_until IS NULL OR valid_until > NEW.commercially_approved_at)
  ) THEN
    RAISE EXCEPTION 'app.second_home: investor authorization % is not valid', NEW.investor_authorization_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'second_home_investor_authorization_valid';
  END IF;
  RETURN NEW;
END
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION app.second_home_require_basis() RETURNS trigger
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
ALTER FUNCTION app.second_home_require_basis() RENAME TO residence_require_basis;

ALTER POLICY second_home_app_insert ON app.second_home RENAME TO residence_app_insert;
ALTER POLICY second_home_app_read ON app.second_home RENAME TO residence_app_read;
ALTER TRIGGER second_home_no_truncate ON app.second_home RENAME TO residence_no_truncate;
ALTER TRIGGER second_home_no_delete ON app.second_home RENAME TO residence_no_delete;
ALTER TRIGGER second_home_no_update ON app.second_home RENAME TO residence_no_update;
ALTER TRIGGER second_home_require_basis ON app.second_home RENAME TO residence_require_basis;

ALTER INDEX app.second_home_investor_authorization_idx RENAME TO residence_investor_authorization_idx;
ALTER INDEX app.second_home_home_edition_idx RENAME TO residence_edition_idx;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_operation_id_key TO residence_operation_id_key;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_operation_id_fkey TO residence_operation_id_fkey;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_timezone_check TO residence_timezone_check;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_label_check TO residence_label_check;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_investor_authorization_fk TO residence_investor_authorization_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_home_concept_version_fk TO residence_concept_version_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_home_edition_fk TO residence_edition_fk;
ALTER TABLE app.second_home RENAME CONSTRAINT second_home_pkey TO residence_pkey;

ALTER TABLE app.second_home RENAME COLUMN home_concept_version_id TO concept_version_id;
ALTER TABLE app.second_home RENAME COLUMN home_concept_id TO concept_id;
ALTER TABLE app.second_home RENAME COLUMN home_edition_id TO edition_id;
ALTER TABLE app.second_home RENAME TO residence;
