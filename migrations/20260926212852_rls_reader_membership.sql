-- migrate:up
-- Leituras de usuário sob RLS (ADR-0006 §6, ADR-0008): o papel de aplicação troca para `authenticated` só dentro da
-- transação (`SET LOCAL ROLE`), sem herdar os privilégios dele fora dela. Papéis são do cluster; no Supabase o dono
-- das migrations (`postgres`) tem ADMIN OPTION em `authenticated` (verificado em 2026-09-26).
GRANT authenticated TO luxtory_app WITH INHERIT FALSE, SET TRUE;

-- migrate:down
REVOKE authenticated FROM luxtory_app;
