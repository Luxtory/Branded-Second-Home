-- migrate:up
-- W7 (ADR-0020 §5): hash de idempotência pseudonimizado **por chave**. Commands cujo input carrega CPF/CNPJ ou e-mail
-- gravam o id da chave do HMAC que pseudonimizou o input; o replay recalcula com a mesma chave, então trocar a chave
-- ativa não transforma replay em conflito (ADR-006 do `03`). NULL = hash do input validado (os demais commands e todos os
-- registros anteriores). Imutável como o resto do registro.
ALTER TABLE app.idempotency_record
  ADD COLUMN request_hash_key_id text CHECK (request_hash_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$');

CREATE OR REPLACE FUNCTION app.idempotency_record_resolve() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.outcome IS NOT NULL
     OR (NEW.scope, NEW.idempotency_key, NEW.command, NEW.request_hash, NEW.request_hash_key_id, NEW.operation_id,
         NEW.created_at)
        IS DISTINCT FROM
        (OLD.scope, OLD.idempotency_key, OLD.command, OLD.request_hash, OLD.request_hash_key_id, OLD.operation_id,
         OLD.created_at) THEN
    RAISE EXCEPTION 'app.idempotency_record: the response is written once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION app.idempotency_record_resolve() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.outcome IS NOT NULL
     OR (NEW.scope, NEW.idempotency_key, NEW.command, NEW.request_hash, NEW.operation_id, NEW.created_at)
        IS DISTINCT FROM
        (OLD.scope, OLD.idempotency_key, OLD.command, OLD.request_hash, OLD.operation_id, OLD.created_at) THEN
    RAISE EXCEPTION 'app.idempotency_record: the response is written once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE app.idempotency_record DROP COLUMN request_hash_key_id;
