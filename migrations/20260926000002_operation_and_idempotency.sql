-- migrate:up
-- Operação (TECH-002) e idempotência (ADR-006 do 03). Instantes vêm do Clock da aplicação (TECH-110).
CREATE TABLE app.operation (
  id uuid PRIMARY KEY,
  command text NOT NULL CHECK (command ~ '^[a-z][a-z0-9_]*$'),
  actor_user_id uuid,
  acting_party_id uuid,
  role app.actor_role NOT NULL,
  residence_id uuid,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
  authorization_ref text NOT NULL CHECK (length(authorization_ref) BETWEEN 1 AND 255),
  state text NOT NULL CHECK (state IN ('pending', 'committed', 'failed', 'compensated')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT operation_actor_check CHECK ((role = 'system') = (actor_user_id IS NULL))
);

-- Só o estado muda, e só para frente: pending → committed | failed; committed → compensated.
CREATE FUNCTION app.operation_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.command, NEW.actor_user_id, NEW.acting_party_id, NEW.role, NEW.residence_id,
      NEW.idempotency_key, NEW.correlation_id, NEW.authorization_ref, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.command, OLD.actor_user_id, OLD.acting_party_id, OLD.role, OLD.residence_id,
      OLD.idempotency_key, OLD.correlation_id, OLD.authorization_ref, OLD.created_at) THEN
    RAISE EXCEPTION 'app.operation: only state and updated_at can change' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.state = 'pending' AND NEW.state IN ('committed', 'failed'))
          OR (OLD.state = 'committed' AND NEW.state = 'compensated')) THEN
    RAISE EXCEPTION 'app.operation: invalid state transition % -> %', OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER operation_transition BEFORE UPDATE ON app.operation
  FOR EACH ROW EXECUTE FUNCTION app.operation_transition();
CREATE TRIGGER operation_no_delete BEFORE DELETE ON app.operation
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER operation_no_truncate BEFORE TRUNCATE ON app.operation
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Escopo = ator (`user:<uuid>` ou `system:<job>`). A chave é reservada no início da transação do command; a resposta
-- é gravada uma única vez, no mesmo commit.
CREATE TABLE app.idempotency_record (
  scope text NOT NULL CHECK (scope ~ '^(user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|system:[a-z][a-z0-9_]*)$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
  command text NOT NULL CHECK (command ~ '^[a-z][a-z0-9_]*$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  outcome text CHECK (outcome IN ('committed', 'rejected')),
  response jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (scope, idempotency_key),
  CONSTRAINT idempotency_record_response_check CHECK ((outcome IS NULL) = (response IS NULL))
);

CREATE FUNCTION app.idempotency_record_resolve() RETURNS trigger
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

CREATE TRIGGER idempotency_record_resolve BEFORE UPDATE ON app.idempotency_record
  FOR EACH ROW EXECUTE FUNCTION app.idempotency_record_resolve();
CREATE TRIGGER idempotency_record_no_delete BEFORE DELETE ON app.idempotency_record
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER idempotency_record_no_truncate BEFORE TRUNCATE ON app.idempotency_record
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

GRANT SELECT, INSERT ON app.operation, app.idempotency_record TO luxtory_app;
GRANT UPDATE (state, updated_at) ON app.operation TO luxtory_app;
GRANT UPDATE (outcome, response) ON app.idempotency_record TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.operation, app.idempotency_record FROM luxtory_app;
DROP TABLE app.idempotency_record;
DROP FUNCTION app.idempotency_record_resolve();
DROP TABLE app.operation;
DROP FUNCTION app.operation_transition();
