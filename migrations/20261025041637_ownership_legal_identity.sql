-- migrate:up
-- W8, ADR-0021: durable ownership reference, never a name match or environment variable.
-- The composite key lets the FK require CNPJ without reading or duplicating the protected document.
ALTER TABLE app.party ADD CONSTRAINT party_id_document_type_key UNIQUE (id, document_type);

CREATE TABLE app.luxtory_legal_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  party_id uuid NOT NULL UNIQUE,
  document_type text GENERATED ALWAYS AS ('cnpj'::text) STORED,
  basis_ref text NOT NULL CHECK (length(btrim(basis_ref)) BETWEEN 1 AND 255),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation(id),
  registered_at timestamptz NOT NULL,
  CONSTRAINT luxtory_legal_identity_company_fk FOREIGN KEY (party_id, document_type)
    REFERENCES app.party(id, document_type)
);
CREATE TRIGGER luxtory_legal_identity_no_change BEFORE UPDATE OR DELETE ON app.luxtory_legal_identity
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxtory_legal_identity_no_truncate BEFORE TRUNCATE ON app.luxtory_legal_identity
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
ALTER TABLE app.luxtory_legal_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY luxtory_legal_identity_app_read ON app.luxtory_legal_identity
  FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.luxtory_legal_identity TO luxtory_app;

-- Provisioning is a subsequent operational gate. No business row is inserted by this migration.
-- Invoker rights: only the table owner/operator can call this; never luxtory_app, anon or authenticated.
CREATE FUNCTION app.register_luxtory_legal_identity(p_party_id uuid, p_basis_ref text) RETURNS uuid
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_operation_id uuid;
BEGIN
  v_operation_id := app.record_operator_change(
    'register_luxtory_legal_identity', 'luxtory_legal_identity', p_party_id::text,
    p_basis_ref, NULL, jsonb_build_object('party_id', p_party_id)
  );
  INSERT INTO app.luxtory_legal_identity(singleton, party_id, basis_ref, operation_id, registered_at)
  VALUES (true, p_party_id, p_basis_ref, v_operation_id, now());
  RETURN v_operation_id;
END
$$;
REVOKE ALL ON FUNCTION app.register_luxtory_legal_identity(uuid, text) FROM PUBLIC;



-- migrate:down
DO $$ BEGIN
  LOCK TABLE app.luxtory_legal_identity IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.luxtory_legal_identity) THEN
    RAISE EXCEPTION 'W8 rollback would discard a registered institutional identity';
  END IF;
END $$;
DROP FUNCTION app.register_luxtory_legal_identity(uuid, text);
DROP TABLE app.luxtory_legal_identity;
ALTER TABLE app.party DROP CONSTRAINT party_id_document_type_key;
