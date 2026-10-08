-- migrate:up
-- Capa do Concept (Wave 4.1; spec catalog §13.12; ADR-0015). Metadados em `concept_media`, com ciclo próprio:
-- `pending` → `approved` → `withdrawn` (ou `pending` → `withdrawn`), cada passo uma única vez; só a aprovada é pública e
-- há zero ou uma aprovada por Concept (a capa não é exigida para publicar). Os binários (WebP reencodado pelo servidor,
-- sem metadados; o arquivo cru nunca é guardado) ficam no Supabase Storage privado; o banco guarda só a referência e os
-- metadados de cada versão em `concept_media_file`, inseridos junto com a mídia e imutáveis.
CREATE TABLE app.concept_media (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES app.concept (id),
  state text NOT NULL CHECK (state IN ('pending', 'approved', 'withdrawn')),
  alt text NOT NULL CHECK (length(alt) BETWEEN 1 AND 300),
  credit text CHECK (length(credit) BETWEEN 1 AND 200),
  crop_x smallint NOT NULL CHECK (crop_x IN (20, 35, 50, 65, 80)),
  crop_y smallint NOT NULL CHECK (crop_y IN (20, 35, 50, 65, 80)),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz,
  approved_by_user_id uuid,
  approved_role app.actor_role CHECK (approved_role IN ('admin', 'super_admin')),
  approval_operation_id uuid UNIQUE REFERENCES app.operation (id),
  withdrawn_at timestamptz,
  withdrawal_basis text CHECK (length(withdrawal_basis) BETWEEN 1 AND 255),
  withdrawal_operation_id uuid UNIQUE REFERENCES app.operation (id),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT concept_media_approval_check CHECK (
    (approved_at IS NULL) = (approved_by_user_id IS NULL)
    AND (approved_by_user_id IS NULL) = (approved_role IS NULL)
    AND (approved_role IS NULL) = (approval_operation_id IS NULL)
  ),
  CONSTRAINT concept_media_withdrawal_check CHECK (
    (withdrawn_at IS NULL) = (withdrawal_basis IS NULL)
    AND (withdrawal_basis IS NULL) = (withdrawal_operation_id IS NULL)
  ),
  CONSTRAINT concept_media_lifecycle_check CHECK (
    (state = 'pending' AND approved_at IS NULL AND withdrawn_at IS NULL)
    OR (state = 'approved' AND approved_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (state = 'withdrawn' AND withdrawn_at IS NOT NULL)
  )
);

CREATE INDEX concept_media_concept_idx ON app.concept_media (concept_id, created_at);
-- Uma capa vigente por Concept.
CREATE UNIQUE INDEX concept_media_current_cover_idx ON app.concept_media (concept_id) WHERE state = 'approved';

CREATE FUNCTION app.concept_media_transition() RETURNS trigger
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

CREATE TRIGGER concept_media_transition BEFORE UPDATE ON app.concept_media
  FOR EACH ROW EXECUTE FUNCTION app.concept_media_transition();
CREATE TRIGGER concept_media_no_delete BEFORE DELETE ON app.concept_media
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_media_no_truncate BEFORE TRUNCATE ON app.concept_media
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Versões de uma capa (ADR-0015): `master` (sanitizado, até 4096 px no lado maior, nunca público) e as larguras de
-- exibição do `srcset` (até 1600 px, sem ampliar). `storage_key` é a chave do objeto no Storage, decidida pelo conteúdo.
CREATE TABLE app.concept_media_file (
  media_id uuid NOT NULL REFERENCES app.concept_media (id),
  role text NOT NULL CHECK (role IN ('master', 'display')),
  width integer NOT NULL,
  height integer NOT NULL,
  content_type text NOT NULL CHECK (content_type = 'image/webp'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 33554432),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text NOT NULL CHECK (storage_key = 'concept-media/' || sha256 || '.webp'),
  PRIMARY KEY (media_id, role, width),
  CONSTRAINT concept_media_file_size_check CHECK (
    width >= 1 AND height >= 1
    AND ((role = 'master' AND width <= 4096 AND height <= 4096)
         OR (role = 'display' AND width <= 1600))
  )
);

-- Uma versão de cada papel e largura; um único master por mídia.
CREATE UNIQUE INDEX concept_media_file_master_idx ON app.concept_media_file (media_id) WHERE role = 'master';

-- As versões entram só com a mídia ainda pendente (na mesma transação do envio).
CREATE FUNCTION app.concept_media_file_guard() RETURNS trigger
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

CREATE TRIGGER concept_media_file_guard BEFORE INSERT ON app.concept_media_file
  FOR EACH ROW EXECUTE FUNCTION app.concept_media_file_guard();
CREATE TRIGGER concept_media_file_no_update BEFORE UPDATE ON app.concept_media_file
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_media_file_no_delete BEFORE DELETE ON app.concept_media_file
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER concept_media_file_no_truncate BEFORE TRUNCATE ON app.concept_media_file
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.concept_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_media_app_read ON app.concept_media FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_media_app_insert ON app.concept_media FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY concept_media_app_update ON app.concept_media FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept_media TO luxtory_app;
GRANT UPDATE (state, approved_at, approved_by_user_id, approved_role, approval_operation_id, withdrawn_at,
              withdrawal_basis, withdrawal_operation_id) ON app.concept_media TO luxtory_app;

ALTER TABLE app.concept_media_file ENABLE ROW LEVEL SECURITY;
CREATE POLICY concept_media_file_app_read ON app.concept_media_file FOR SELECT TO luxtory_app USING (true);
CREATE POLICY concept_media_file_app_insert ON app.concept_media_file FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.concept_media_file TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.concept_media_file FROM luxtory_app;
REVOKE ALL ON app.concept_media FROM luxtory_app;
DROP TABLE app.concept_media_file;
DROP FUNCTION app.concept_media_file_guard();
DROP TABLE app.concept_media;
DROP FUNCTION app.concept_media_transition();
