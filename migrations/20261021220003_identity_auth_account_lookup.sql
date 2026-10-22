-- migrate:up
-- Contas do Supabase Auth vistas pelo convite (W7, decisão do fundador de 2026-10-21; ADR-0020 §8): o app nunca lê
-- `auth.users` diretamente. Uma função devolve só o id e se a conta está confirmada, a partir do e-mail que o Admin
-- digitou; a outra devolve o e-mail já mascarado no SQL, para a lista de representantes. SECURITY DEFINER (dono das
-- tabelas) e executáveis só pelo papel de aplicação.
CREATE FUNCTION app.auth_account_by_email(p_email text)
  RETURNS TABLE (user_id uuid, email_confirmed boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_email IS NULL OR length(btrim(p_email)) NOT BETWEEN 3 AND 254 THEN
    RAISE EXCEPTION 'app.auth_account_by_email: invalid e-mail' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email_confirmed_at IS NOT NULL
    FROM auth.users u
    WHERE lower(u.email) = lower(btrim(p_email))
      AND u.deleted_at IS NULL
      AND NOT u.is_sso_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Mais de uma conta para o mesmo e-mail: nunca escolher uma (fechado para falhas).
  IF v_count > 1 THEN
    RAISE EXCEPTION 'app.auth_account_by_email: ambiguous account' USING ERRCODE = 'cardinality_violation';
  END IF;
END
$$;

CREATE FUNCTION app.auth_account_labels(p_user_ids uuid[])
  RETURNS TABLE (user_id uuid, email_masked text, email_confirmed boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) > 500 THEN
    RAISE EXCEPTION 'app.auth_account_labels: invalid id list' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
    SELECT u.id,
           CASE WHEN position('@' IN coalesce(u.email, '')) > 1
                THEN left(u.email, 1) || '***@' || split_part(u.email, '@', 2)
           END,
           u.email_confirmed_at IS NOT NULL
    FROM auth.users u
    WHERE u.id = ANY (p_user_ids);
END
$$;

REVOKE ALL ON FUNCTION app.auth_account_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_account_labels(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auth_account_by_email(text) TO luxtory_app;
GRANT EXECUTE ON FUNCTION app.auth_account_labels(uuid[]) TO luxtory_app;

-- migrate:down
DROP FUNCTION app.auth_account_labels(uuid[]);
DROP FUNCTION app.auth_account_by_email(text);
