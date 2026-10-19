-- migrate:up
-- Idempotência de mutações públicas não críticas (ADR-0017; TECH-056, ADR-006 do 03). Sem conta, o escopo da chave é a
-- superfície (`surface`) e a chave é um UUID imprevisível do cliente. Fora do pipeline de commands críticos: sem
-- `operation`, `audit_log` de command nem `idempotency_record`. Guarda só o hash do conteúdo validado — nenhum dado do
-- visitante. A chave é reservada na mesma transação do efeito de domínio; só o sucesso a grava. Só inserção.
CREATE TABLE app.public_idempotency_key (
  surface text NOT NULL CHECK (surface ~ '^[a-z][a-z0-9_]*$'),
  idempotency_key text NOT NULL
    CHECK (idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (surface, idempotency_key)
);

CREATE TRIGGER public_idempotency_key_no_update BEFORE UPDATE ON app.public_idempotency_key
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER public_idempotency_key_no_delete BEFORE DELETE ON app.public_idempotency_key
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER public_idempotency_key_no_truncate BEFORE TRUNCATE ON app.public_idempotency_key
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.public_idempotency_key ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_idempotency_key_app_read ON app.public_idempotency_key FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY public_idempotency_key_app_insert ON app.public_idempotency_key FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.public_idempotency_key TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.public_idempotency_key FROM luxtory_app;
DROP TABLE app.public_idempotency_key;
