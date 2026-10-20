-- migrate:up
-- W4.2 (ADR-0015, ADR-0019; `01` v10.2 BR-031, BR-036; spec catalog §17.2–§17.3): mídia da Home Edition — imagens,
-- renders e plantas. Mesmo ciclo e mesmo armazenamento da capa do Home Concept: `pending` → `approved` → `withdrawn`
-- (ou `pending` → `withdrawn`), cada passo uma única vez; várias aprovadas por Home Edition (gestão de mídia, não
-- alteração material). Binários WebP reencodados no Storage privado; no banco, só referência e metadados.
CREATE TABLE app.home_edition_media (
  id uuid PRIMARY KEY,
  home_edition_id uuid NOT NULL REFERENCES app.home_edition (id),
  kind text NOT NULL CONSTRAINT home_edition_media_kind_check CHECK (kind IN ('image', 'render', 'floor_plan')),
  state text NOT NULL CONSTRAINT home_edition_media_state_check CHECK (state IN ('pending', 'approved', 'withdrawn')),
  alt text NOT NULL CONSTRAINT home_edition_media_alt_check CHECK (length(alt) BETWEEN 1 AND 300),
  credit text CONSTRAINT home_edition_media_credit_check CHECK (length(credit) BETWEEN 1 AND 200),
  crop_x smallint NOT NULL CONSTRAINT home_edition_media_crop_x_check CHECK (crop_x IN (20, 35, 50, 65, 80)),
  crop_y smallint NOT NULL CONSTRAINT home_edition_media_crop_y_check CHECK (crop_y IN (20, 35, 50, 65, 80)),
  source_sha256 text NOT NULL CONSTRAINT home_edition_media_source_sha256_check CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz,
  approved_by_user_id uuid,
  approved_role app.actor_role
    CONSTRAINT home_edition_media_approved_role_check CHECK (approved_role IN ('admin', 'super_admin')),
  approval_operation_id uuid UNIQUE REFERENCES app.operation (id),
  withdrawn_at timestamptz,
  withdrawal_basis text CONSTRAINT home_edition_media_withdrawal_basis_check CHECK (length(withdrawal_basis) BETWEEN 1 AND 255),
  withdrawal_operation_id uuid UNIQUE REFERENCES app.operation (id),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT home_edition_media_approval_check CHECK (
    (approved_at IS NULL) = (approved_by_user_id IS NULL)
    AND (approved_by_user_id IS NULL) = (approved_role IS NULL)
    AND (approved_role IS NULL) = (approval_operation_id IS NULL)
  ),
  CONSTRAINT home_edition_media_withdrawal_check CHECK (
    (withdrawn_at IS NULL) = (withdrawal_basis IS NULL)
    AND (withdrawal_basis IS NULL) = (withdrawal_operation_id IS NULL)
  ),
  CONSTRAINT home_edition_media_lifecycle_check CHECK (
    (state = 'pending' AND approved_at IS NULL AND withdrawn_at IS NULL)
    OR (state = 'approved' AND approved_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (state = 'withdrawn' AND withdrawn_at IS NOT NULL)
  )
);

CREATE INDEX home_edition_media_home_edition_idx ON app.home_edition_media (home_edition_id, created_at);

CREATE FUNCTION app.home_edition_media_transition() RETURNS trigger
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
    RAISE EXCEPTION 'app.home_edition_media: only a single approval and a single withdrawal can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER home_edition_media_transition BEFORE UPDATE ON app.home_edition_media
  FOR EACH ROW EXECUTE FUNCTION app.home_edition_media_transition();
CREATE TRIGGER home_edition_media_no_delete BEFORE DELETE ON app.home_edition_media
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER home_edition_media_no_truncate BEFORE TRUNCATE ON app.home_edition_media
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Versões de uma mídia (ADR-0015): `master` sanitizado (nunca público) e as larguras de exibição.
CREATE TABLE app.home_edition_media_file (
  media_id uuid NOT NULL REFERENCES app.home_edition_media (id),
  role text NOT NULL CONSTRAINT home_edition_media_file_role_check CHECK (role IN ('master', 'display')),
  width integer NOT NULL,
  height integer NOT NULL,
  content_type text NOT NULL CONSTRAINT home_edition_media_file_content_type_check CHECK (content_type = 'image/webp'),
  byte_size integer NOT NULL CONSTRAINT home_edition_media_file_byte_size_check CHECK (byte_size BETWEEN 1 AND 33554432),
  sha256 text NOT NULL CONSTRAINT home_edition_media_file_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text NOT NULL,
  PRIMARY KEY (media_id, role, width),
  CONSTRAINT home_edition_media_file_storage_key_check
    CHECK (storage_key = 'home-edition-media/' || sha256 || '.webp'),
  CONSTRAINT home_edition_media_file_size_check CHECK (
    width >= 1 AND height >= 1
    AND ((role = 'master' AND width <= 4096 AND height <= 4096)
         OR (role = 'display' AND width <= 1600))
  )
);

CREATE UNIQUE INDEX home_edition_media_file_master_idx ON app.home_edition_media_file (media_id)
  WHERE role = 'master';

CREATE FUNCTION app.home_edition_media_file_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM app.home_edition_media AS media WHERE media.id = NEW.media_id AND media.state = 'pending'
     )
  THEN
    RAISE EXCEPTION 'app.home_edition_media_file: files are added only to a pending media'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER home_edition_media_file_guard BEFORE INSERT ON app.home_edition_media_file
  FOR EACH ROW EXECUTE FUNCTION app.home_edition_media_file_guard();
CREATE TRIGGER home_edition_media_file_no_update BEFORE UPDATE ON app.home_edition_media_file
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER home_edition_media_file_no_delete BEFORE DELETE ON app.home_edition_media_file
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER home_edition_media_file_no_truncate BEFORE TRUNCATE ON app.home_edition_media_file
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.home_edition_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_edition_media_app_read ON app.home_edition_media FOR SELECT TO luxtory_app USING (true);
CREATE POLICY home_edition_media_app_insert ON app.home_edition_media FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY home_edition_media_app_update ON app.home_edition_media FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.home_edition_media TO luxtory_app;
GRANT UPDATE (state, approved_at, approved_by_user_id, approved_role, approval_operation_id, withdrawn_at,
              withdrawal_basis, withdrawal_operation_id) ON app.home_edition_media TO luxtory_app;

ALTER TABLE app.home_edition_media_file ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_edition_media_file_app_read ON app.home_edition_media_file FOR SELECT TO luxtory_app USING (true);
CREATE POLICY home_edition_media_file_app_insert ON app.home_edition_media_file FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.home_edition_media_file TO luxtory_app;

-- Leitura pública (spec catalog §17.7): só mídia aprovada de Home Edition pública (a subconsulta lê como `anon` e herda
-- a policy pública da Home Edition); arquivos só de exibição — o master nunca.
GRANT SELECT (id, home_edition_id, kind, alt, credit, crop_x, crop_y, approved_at) ON app.home_edition_media TO anon;
GRANT SELECT (media_id, role, width, height, content_type, storage_key) ON app.home_edition_media_file TO anon;
CREATE POLICY home_edition_media_public_read ON app.home_edition_media FOR SELECT TO anon
  USING (
    state = 'approved'
    AND EXISTS (SELECT 1 FROM app.home_edition AS home_edition WHERE home_edition.id = home_edition_id)
  );
CREATE POLICY home_edition_media_file_public_read ON app.home_edition_media_file FOR SELECT TO anon
  USING (role = 'display' AND EXISTS (SELECT 1 FROM app.home_edition_media AS media WHERE media.id = media_id));

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.home_edition_media) THEN
    RAISE EXCEPTION 'W4.2 rollback precondition: home_edition_media has rows; they would be dropped'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

DROP TABLE app.home_edition_media_file;
DROP FUNCTION app.home_edition_media_file_guard();
DROP TABLE app.home_edition_media;
DROP FUNCTION app.home_edition_media_transition();
