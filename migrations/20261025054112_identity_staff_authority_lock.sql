-- migrate:up
-- Same exact staff assignment as the W8 shared preamble; lock before FOR UPDATE avoids inverted ordering.
-- CREATE OR REPLACE retains the existing restricted EXECUTE privileges. No new privilege or authority.
CREATE OR REPLACE FUNCTION app.revoke_staff_role(p_staff_role_id uuid, p_basis text) RETURNS uuid
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_before app.staff_role;
  v_after app.staff_role;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('app.staff_role:' || p_staff_role_id::text, 0));
  SELECT * INTO v_before FROM app.staff_role WHERE id = p_staff_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.revoke_staff_role: staff role % does not exist', p_staff_role_id
      USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE app.staff_role SET revoked_at = now(), revocation_basis = p_basis
  WHERE id = p_staff_role_id RETURNING * INTO v_after;
  PERFORM app.record_operator_change('revoke_staff_role', 'staff_role', p_staff_role_id::text, p_basis,
                                    to_jsonb(v_before), to_jsonb(v_after));
  RETURN p_staff_role_id;
END
$$;


-- migrate:down
-- Restore the pre-W8 function semantics; existing grants remain unchanged.
CREATE OR REPLACE FUNCTION app.revoke_staff_role(p_staff_role_id uuid, p_basis text) RETURNS uuid
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_before app.staff_role;
  v_after app.staff_role;
BEGIN
  SELECT * INTO v_before FROM app.staff_role WHERE id = p_staff_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.revoke_staff_role: staff role % does not exist', p_staff_role_id
      USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE app.staff_role SET revoked_at = now(), revocation_basis = p_basis
  WHERE id = p_staff_role_id RETURNING * INTO v_after;
  PERFORM app.record_operator_change('revoke_staff_role', 'staff_role', p_staff_role_id::text, p_basis,
                                    to_jsonb(v_before), to_jsonb(v_after));
  RETURN p_staff_role_id;
END
$$;
