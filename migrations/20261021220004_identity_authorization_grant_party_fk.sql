-- migrate:up
-- Encerra a dívida transitória D-W2-1 (ADR-0008, spec identity §5): `app.party` existe, então a FK definitiva entra
-- **validada** (sem `NOT VALID`; Production auditada em 2026-10-21 com 0 grants) e o gatilho que a simulava sai.
ALTER TABLE app.authorization_grant
  ADD CONSTRAINT authorization_grant_grantee_party_fk FOREIGN KEY (grantee_party_id) REFERENCES app.party (id);

DROP TRIGGER authorization_grant_require_party ON app.authorization_grant;
DROP FUNCTION app.authorization_grant_require_party();

-- migrate:down
CREATE FUNCTION app.authorization_grant_require_party() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_exists boolean := false;
BEGIN
  IF to_regclass('app.party') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM app.party WHERE id = $1)' INTO v_exists USING NEW.grantee_party_id;
  END IF;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'app.authorization_grant: grantee party % does not exist', NEW.grantee_party_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'authorization_grant_grantee_party_fk';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.authorization_grant_require_party() FROM PUBLIC;

CREATE TRIGGER authorization_grant_require_party BEFORE INSERT ON app.authorization_grant
  FOR EACH ROW EXECUTE FUNCTION app.authorization_grant_require_party();

ALTER TABLE app.authorization_grant DROP CONSTRAINT authorization_grant_grantee_party_fk;
