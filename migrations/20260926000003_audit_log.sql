-- migrate:up
-- Auditoria só de inserção (TECH-092, TECH-052): ator, parte representada, papel, instante, objeto, operation,
-- autorização/base e antes/depois, sem dado pessoal bruto (a aplicação redige antes de gravar). O selo é da W30.
CREATE TABLE app.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('command', 'admin_read')),
  operation_id uuid REFERENCES app.operation (id),
  occurred_at timestamptz NOT NULL,
  actor_user_id uuid,
  acting_party_id uuid,
  role app.actor_role NOT NULL,
  object_type text NOT NULL CHECK (object_type ~ '^[a-z][a-z0-9_]*$'),
  object_id text NOT NULL CHECK (length(object_id) BETWEEN 1 AND 255),
  authorization_ref text NOT NULL CHECK (length(authorization_ref) BETWEEN 1 AND 255),
  before jsonb,
  after jsonb,
  CONSTRAINT audit_log_operation_check CHECK (event_type <> 'command' OR operation_id IS NOT NULL)
);

CREATE INDEX audit_log_operation_idx ON app.audit_log (operation_id);
CREATE INDEX audit_log_object_idx ON app.audit_log (object_type, object_id);

-- Vale até para o dono das tabelas: nenhum UPDATE, DELETE ou TRUNCATE funcional.
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON app.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

GRANT INSERT ON app.audit_log TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.audit_log FROM luxtory_app;
DROP TABLE app.audit_log;
