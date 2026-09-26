-- migrate:up
-- Outbox transacional (TECH-091, ADR-006 do 03): gravado no commit do command, entregue ao menos uma vez.
CREATE TABLE app.outbox (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES app.operation (id),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  dedup_key text NOT NULL UNIQUE CHECK (length(dedup_key) BETWEEN 1 AND 255),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text CHECK (length(last_error) <= 200),
  delivered_at timestamptz
);

CREATE INDEX outbox_pending_idx ON app.outbox (occurred_at, id) WHERE delivered_at IS NULL;

-- Consumidor idempotente: o recibo entra na mesma transação do efeito do consumidor.
CREATE TABLE app.outbox_receipt (
  event_id uuid NOT NULL REFERENCES app.outbox (id),
  consumer text NOT NULL CHECK (consumer ~ '^[a-z][a-z0-9_]*$'),
  received_at timestamptz NOT NULL,
  PRIMARY KEY (event_id, consumer)
);

CREATE TRIGGER outbox_receipt_append_only BEFORE UPDATE OR DELETE ON app.outbox_receipt
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();

-- Notificação dentro do app (REQ-097 chega com as waves que produzem cada evento; TECH-091).
CREATE TABLE app.notification (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES app.outbox (id),
  recipient_party_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  CONSTRAINT notification_event_recipient_kind_key UNIQUE (event_id, recipient_party_id, kind)
);

CREATE INDEX notification_recipient_idx ON app.notification (recipient_party_id, created_at DESC);

GRANT SELECT, INSERT ON app.outbox, app.outbox_receipt, app.notification TO luxtory_app;
GRANT UPDATE (attempts, last_error, delivered_at) ON app.outbox TO luxtory_app;
GRANT UPDATE (read_at) ON app.notification TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.outbox, app.outbox_receipt, app.notification FROM luxtory_app;
DROP TABLE app.notification;
DROP TABLE app.outbox_receipt;
DROP TABLE app.outbox;
