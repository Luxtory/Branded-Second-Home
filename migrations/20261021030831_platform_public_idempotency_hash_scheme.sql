-- migrate:up
-- Esquema e chave do hash em cada registro de idempotência pública (W6; ADR-0018 §3; ADR-0017 §4 para `sha256`). A W5
-- grava SHA-256 sem chave (conteúdo sem dado pessoal); a partir da W6, a superfície `interest` grava HMAC-SHA-256 com o
-- segredo próprio identificado por `hash_key_id`. O banco guarda só o identificador técnico — nunca chave, segredo ou
-- conteúdo em claro. Linhas existentes ficam `sha256`; depois, sem default: quem grava declara o esquema. ADD COLUMN não
-- dispara o gatilho de UPDATE (a tabela continua só de inserção).
ALTER TABLE app.public_idempotency_key
  ADD COLUMN hash_scheme text NOT NULL DEFAULT 'sha256'
    CONSTRAINT public_idempotency_key_hash_scheme_check CHECK (hash_scheme IN ('sha256', 'hmac_sha256')),
  ADD COLUMN hash_key_id text
    CONSTRAINT public_idempotency_key_hash_key_id_check CHECK (hash_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  ADD CONSTRAINT public_idempotency_key_hash_key_check CHECK ((hash_scheme = 'sha256') = (hash_key_id IS NULL));

ALTER TABLE app.public_idempotency_key ALTER COLUMN hash_scheme DROP DEFAULT;

-- migrate:down
-- Fail-closed: sem as colunas, um registro chaveado seria lido como SHA-256 sem chave e perderia a semântica de
-- repetição (ADR-0018 §3).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.public_idempotency_key WHERE hash_scheme <> 'sha256') THEN
    RAISE EXCEPTION 'W6 rollback precondition: keyed public idempotency records would lose their hash scheme'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;
ALTER TABLE app.public_idempotency_key
  DROP CONSTRAINT public_idempotency_key_hash_key_check,
  DROP COLUMN hash_key_id,
  DROP COLUMN hash_scheme;
