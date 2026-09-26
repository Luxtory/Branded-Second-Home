-- migrate:up
-- Schema da aplicação e papel de aplicação (ADR-0006 §1 e §5). Nada da aplicação em `public`.
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

-- Papel do servidor: LOGIN sem senha (a senha entra pelo runbook, como verificador SCRAM), sem DDL nem atributos
-- privilegiados. Papéis são do cluster: outro banco do mesmo servidor (clones de teste) pode já tê-lo criado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxtory_app') THEN
    CREATE ROLE luxtory_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO luxtory_app;

-- Papel de quem fez a ação (TECH-002, TECH-051): Titular (inclui detentor, solicitante e ofertante), Admin,
-- Super Admin, parceiro com authorization_grant e sistema (jobs do TECH-090).
CREATE DOMAIN app.actor_role AS text
  CHECK (VALUE IN ('titular', 'admin', 'super_admin', 'grantee', 'system'));

-- Tabelas só de inserção (TECH-052, TECH-092) e linhas que nunca são apagadas usam este gatilho.
CREATE FUNCTION app.forbid_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% on app.% is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

-- migrate:down
DROP FUNCTION app.forbid_change();
DROP DOMAIN app.actor_role;
REVOKE USAGE ON SCHEMA app FROM luxtory_app;
DROP SCHEMA app;
DO $$
BEGIN
  DROP ROLE IF EXISTS luxtory_app;
EXCEPTION WHEN dependent_objects_still_exist THEN
  -- Outro banco do cluster ainda concede privilégios ao papel (clones de teste): ele continua existindo lá.
  NULL;
END
$$;
