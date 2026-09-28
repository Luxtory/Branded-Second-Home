-- migrate:up
-- Residence Concept e suas versões (`03` §3.1, BR-013, BR-014, BR-025, REQ-096; ADR-0010 §1). `concept` guarda a
-- identidade; `concept_version`, o conteúdo, imutável. A única transição é a aprovação (`not_approved` → `approved`,
-- com as referências das aprovações). Versão vigente = a aprovada de maior número.

-- Lista de textos não vazia, sem itens nulos ou vazios e com tamanho máximo por item.
CREATE FUNCTION app.is_text_list(p_items text[], p_max_items integer, p_max_length integer) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path = ''
AS $$
  SELECT p_items IS NOT NULL
     AND array_ndims(p_items) = 1
     AND cardinality(p_items) BETWEEN 1 AND p_max_items
     AND NOT EXISTS (
       SELECT 1 FROM unnest(p_items) AS item WHERE item IS NULL OR length(item) NOT BETWEEN 1 AND p_max_length
     )
$$;

CREATE TABLE app.concept (
  id uuid PRIMARY KEY,
  brand_partner_id uuid NOT NULL REFERENCES app.brand_partner (id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL
);

CREATE INDEX concept_brand_partner_idx ON app.concept (brand_partner_id);

CREATE TABLE app.concept_version (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES app.concept (id),
  version integer NOT NULL CHECK (version >= 1),
  essential_elements text[] NOT NULL CHECK (app.is_text_list(essential_elements, 50, 500)),
  preservation_premises text[] NOT NULL CHECK (app.is_text_list(preservation_premises, 50, 500)),
  specification text NOT NULL CHECK (length(specification) BETWEEN 1 AND 20000),
  state text NOT NULL CHECK (state IN ('not_approved', 'approved')),
  approval_refs text[] CHECK (approval_refs IS NULL OR app.is_text_list(approval_refs, 20, 255)),
  approved_at timestamptz,
  approved_by_user_id uuid,
  approved_role app.actor_role CHECK (approved_role IN ('admin', 'super_admin')),
  approval_operation_id uuid UNIQUE REFERENCES app.operation (id),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT concept_version_number_key UNIQUE (concept_id, version),
  -- Alvo das FKs compostas da Residence: a versão fixada é do mesmo Concept da Edition.
  CONSTRAINT concept_version_concept_key UNIQUE (id, concept_id),
  CONSTRAINT concept_version_approval_check CHECK (
    (state = 'approved') = (approval_refs IS NOT NULL)
    AND (approval_refs IS NULL) = (approved_at IS NULL)
    AND (approved_at IS NULL) = (approved_by_user_id IS NULL)
    AND (approved_by_user_id IS NULL) = (approved_role IS NULL)
    AND (approved_role IS NULL) = (approval_operation_id IS NULL)
  )
);

CREATE INDEX concept_version_approved_idx ON app.concept_version (concept_id, version DESC)
  WHERE state = 'approved';

-- Conteúdo imutável; a única mudança é a aprovação de uma versão ainda não aprovada.
CREATE FUNCTION app.concept_version_transition() RETURNS trigger
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

CREATE TRIGGER concept_no_update BEFORE UPDATE ON app.concept
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_no_delete BEFORE DELETE ON app.concept
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_no_truncate BEFORE TRUNCATE ON app.concept
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_version_transition BEFORE UPDATE ON app.concept_version
  FOR EACH ROW EXECUTE FUNCTION app.concept_version_transition();
CREATE TRIGGER concept_version_no_delete BEFORE DELETE ON app.concept_version
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_version_no_truncate BEFORE TRUNCATE ON app.concept_version
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.concept ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_app_read ON app.concept FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_app_insert ON app.concept FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept TO luxtory_app;

ALTER TABLE app.concept_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_version_app_read ON app.concept_version FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_version_app_insert ON app.concept_version FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY concept_version_app_update ON app.concept_version FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept_version TO luxtory_app;
GRANT UPDATE (state, approval_refs, approved_at, approved_by_user_id, approved_role, approval_operation_id)
  ON app.concept_version TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.concept_version FROM luxtory_app;
REVOKE ALL ON app.concept FROM luxtory_app;
DROP TABLE app.concept_version;
DROP TABLE app.concept;
DROP FUNCTION app.concept_version_transition();
DROP FUNCTION app.is_text_list(text[], integer, integer);
