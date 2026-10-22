-- migrate:up
-- Party do `03` §3.1 (W7, spec identity §13, ADR-0020): a pessoa física ou jurídica identificada por CPF/CNPJ — a
-- identidade no domínio, **não** sinônimo de Titular (titularidade é relação posterior: holding, W8). CPF/CNPJ só
-- cifrado na aplicação (AES-256-GCM, `key_id` ao lado) e HMAC normalizado `UNIQUE` com segredo próprio, em tabela de
-- digests (abaixo). Sem nome (o `03` não o prevê) e sem nenhuma forma do documento em claro, parcial ou mascarada.
-- Imutável: nunca alterada nem apagada (TECH-100, TECH-052).
CREATE TABLE app.party (
  id uuid PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  -- IV (12 bytes) ‖ cifra ‖ tag GCM (16 bytes) do documento normalizado: CPF tem 11 caracteres; CNPJ, 14.
  document_ciphertext bytea NOT NULL,
  document_key_id text NOT NULL CHECK (document_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  registered_by_user_id uuid NOT NULL,
  registered_role app.actor_role NOT NULL CHECK (registered_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT party_document_ciphertext_check CHECK (
    (document_type = 'cpf' AND octet_length(document_ciphertext) = 39)
    OR (document_type = 'cnpj' AND octet_length(document_ciphertext) = 42)
  )
);

CREATE INDEX party_created_idx ON app.party (created_at DESC, id);

CREATE TRIGGER party_no_change BEFORE UPDATE OR DELETE ON app.party
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER party_no_truncate BEFORE TRUNCATE ON app.party
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- O command `register_party` insere pelo papel de aplicação; a leitura do Titular (por delegação vigente) chega com a
-- tabela de delegações, na migration seguinte.
ALTER TABLE app.party ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_app_read ON app.party FOR SELECT TO luxtory_app USING (true);
CREATE POLICY party_app_insert ON app.party FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.party TO luxtory_app;

-- HMAC-SHA-256 do documento normalizado, **um por chave do anel do HMAC de quem gravou** (ADR-0020 §2). `UNIQUE (digest)`
-- garante o invariante "um CPF/CNPJ normalizado → no máximo uma party", inclusive durante a rotação: duas versões do app
-- com anéis diferentes ao mesmo tempo compartilham ao menos uma chave (protocolo de rotação do runbook) e colidem nela,
-- seja qual for a chave ativa de cada uma. Imutável; nunca legível por `authenticated`.
CREATE TABLE app.party_document_digest (
  party_id uuid NOT NULL REFERENCES app.party (id),
  hmac_key_id text NOT NULL CHECK (hmac_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  digest bytea NOT NULL CHECK (octet_length(digest) = 32),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (party_id, hmac_key_id),
  -- Duplicidade → `ERR_STATE_TRANSITION` pelo prefixo `conflict_` (ADR-0020 §10).
  CONSTRAINT conflict_party_document_digest UNIQUE (digest)
);

CREATE TRIGGER party_document_digest_no_change BEFORE UPDATE OR DELETE ON app.party_document_digest
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER party_document_digest_no_truncate BEFORE TRUNCATE ON app.party_document_digest
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.party_document_digest ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_document_digest_app_read ON app.party_document_digest FOR SELECT TO luxtory_app USING (true);
CREATE POLICY party_document_digest_app_insert ON app.party_document_digest FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.party_document_digest TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.party_document_digest FROM luxtory_app;
DROP TABLE app.party_document_digest;
REVOKE ALL ON app.party FROM luxtory_app;
DROP TABLE app.party;
