-- migrate:up
-- W4.2 (ADR-0019; `03` v3.15 TECH-002): `operation.residence_id` passa a `second_home_id`. RENAME preserva as linhas
-- existentes, os grants por coluna e o CHECK; as duas funções cujo corpo cita a coluna são recriadas com o nome novo
-- (o corpo PL/pgSQL é texto e só é resolvido na execução).
ALTER TABLE app.operation RENAME COLUMN residence_id TO second_home_id;

CREATE OR REPLACE FUNCTION app.operation_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.command, NEW.actor_user_id, NEW.acting_party_id, NEW.role, NEW.second_home_id,
      NEW.idempotency_key, NEW.correlation_id, NEW.authorization_ref, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.command, OLD.actor_user_id, OLD.acting_party_id, OLD.role, OLD.second_home_id,
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

CREATE OR REPLACE FUNCTION app.record_operator_change(
  p_command text,
  p_object_type text,
  p_object_id text,
  p_basis text,
  p_before jsonb,
  p_after jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_at timestamptz := now();
BEGIN
  INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
                             correlation_id, authorization_ref, state, created_at, updated_at)
  VALUES (v_operation_id, p_command, NULL, NULL, 'system', NULL, 'runbook:' || v_operation_id,
          'runbook:' || v_operation_id, p_basis, 'committed', v_at, v_at);
  INSERT INTO app.audit_log (event_type, operation_id, occurred_at, actor_user_id, acting_party_id, role,
                             object_type, object_id, authorization_ref, before, after)
  VALUES ('command', v_operation_id, v_at, NULL, NULL, 'system', p_object_type, p_object_id, p_basis, p_before,
          p_after);
  RETURN v_operation_id;
END
$$;

-- migrate:down
ALTER TABLE app.operation RENAME COLUMN second_home_id TO residence_id;

CREATE OR REPLACE FUNCTION app.operation_transition() RETURNS trigger
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

CREATE OR REPLACE FUNCTION app.record_operator_change(
  p_command text,
  p_object_type text,
  p_object_id text,
  p_basis text,
  p_before jsonb,
  p_after jsonb
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_at timestamptz := now();
BEGIN
  INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, residence_id, idempotency_key,
                             correlation_id, authorization_ref, state, created_at, updated_at)
  VALUES (v_operation_id, p_command, NULL, NULL, 'system', NULL, 'runbook:' || v_operation_id,
          'runbook:' || v_operation_id, p_basis, 'committed', v_at, v_at);
  INSERT INTO app.audit_log (event_type, operation_id, occurred_at, actor_user_id, acting_party_id, role,
                             object_type, object_id, authorization_ref, before, after)
  VALUES ('command', v_operation_id, v_at, NULL, NULL, 'system', p_object_type, p_object_id, p_basis, p_before,
          p_after);
  RETURN v_operation_id;
END
$$;
