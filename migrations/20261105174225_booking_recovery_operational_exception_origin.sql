-- migrate:up
-- W13 E2b — origem P-A na recuperação (bloqueio B-A3; spec booking §10.13; A3, ADR-0027 §3–§4, spec inventory; BR-123).
-- A E1 reconhecia a origem P-A só por `exception_resolution` (P-A cancelada pelo Admin); o cancelamento tardio do
-- Titular durante a exceção operacional aberta gerava as mesmas `forfeited_right` sem exigir a atestação. Só o critério
-- de origem muda. `CREATE OR REPLACE` mantém dono e ACL (EXECUTE só do papel autorizador, sem PUBLIC); a assinatura,
-- `SECURITY DEFINER` e `SET search_path = pg_catalog, pg_temp` (T-1312) são repetidos aqui porque a redefinição
-- substitui os atributos declarados. A prontidão (`app.assert_own_use_activation_ready`) confere tudo isso.
CREATE OR REPLACE FUNCTION app.authorize_booking_action(p_request_id uuid, p_approval_ref text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_at timestamptz;
  r app.booking_authorization_request;
  b app.booking;
  i record;
  e app.booking_exception;
  v_dates date[] := '{}';
  v_custodies uuid[] := '{}';
  v_class text;
  v_valid timestamptz;
  v_from_exception boolean;
  v_id uuid := gen_random_uuid();
BEGIN
  IF p_request_id IS NULL OR p_approval_ref IS NULL
     OR p_approval_ref !~ '^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$' THEN
    RAISE EXCEPTION 'authorization input outside the closed schema'
      USING ERRCODE = 'invalid_parameter_value', CONSTRAINT = 'authorization_input';
  END IF;
  SELECT * INTO r FROM app.booking_authorization_request WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown authorization request'
      USING ERRCODE = 'no_data_found', CONSTRAINT = 'authorization_request_unknown';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.booking:' || r.booking_id::text, 0));
  v_at := clock_timestamp();
  IF EXISTS (SELECT 1 FROM app.booking_authorization WHERE request_id = r.id) THEN
    RAISE EXCEPTION 'the request was already authorized'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'authorization_request_already_authorized';
  END IF;
  -- Duas autorizações vivas para a mesma reserva e finalidade: exatamente uma.
  IF EXISTS (SELECT 1 FROM app.booking_authorization x
              WHERE x.booking_id = r.booking_id AND x.purpose = r.purpose AND x.valid_until > v_at
                AND NOT EXISTS (SELECT 1 FROM app.booking_authorization_use u WHERE u.authorization_id = x.id)
                AND NOT EXISTS (SELECT 1 FROM app.booking_authorization_revocation v WHERE v.authorization_id = x.id)) THEN
    RAISE EXCEPTION 'a live authorization already exists for this booking and purpose'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'authorization_live_exists';
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = r.booking_id;
  SELECT * INTO i FROM app.booking_period_instants(b.id);
  IF r.purpose = 'no_show' THEN
    IF b.state NOT IN ('confirmed', 'in_use')
       OR NOT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, v_at) THEN
      RAISE EXCEPTION 'a no-show authorization is issued only inside the no-show window'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_window';
    END IF;
    v_dates := app.booking_unstarted_nights(b.id, v_at);
    v_valid := i.checkout_at;
  ELSIF r.purpose IN ('exception_cancellation', 'invalidation') THEN
    SELECT x.* INTO e FROM app.booking_exception x
     WHERE x.id = r.exception_id AND x.booking_id = b.id
       AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution z WHERE z.exception_id = x.id);
    IF NOT FOUND OR b.state <> 'in_exception'
       OR e.exception_type <> (CASE r.purpose WHEN 'exception_cancellation' THEN 'operational'
                                 ELSE 'unauthorized_booking' END) THEN
      RAISE EXCEPTION 'the authorization requires the matching open exception'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_exception';
    END IF;
    v_dates := app.booking_unstarted_nights(b.id, v_at);
    IF cardinality(v_dates) = 0 THEN
      RAISE EXCEPTION 'the authorization requires at least one night not started'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_nights';
    END IF;
    v_valid := i.last_checkin_at;
    IF r.purpose = 'exception_cancellation' AND b.stake_id IS NOT NULL THEN
      v_class := CASE WHEN app.own_use_cancellation_timely(i.first_checkin_at, v_at) THEN 'timely' ELSE 'late' END;
    END IF;
  ELSE
    -- Recuperação (BR-283, BR-284): custódias `forfeited_right` ativas e futuras com linhagem à reserva, depois do
    -- no-show ou do cancelamento tardio commitado; origem P-A exige atestação de disponibilidade. Origem P-A (A3,
    -- BR-123): a transição que abriu a `forfeited_right` resolveu uma exceção operacional — cancelamento do Admin
    -- (`exception_resolution`) ou do Titular durante a exceção aberta (`cancellation`, `titular_cancellation`).
    IF b.stake_id IS NULL OR b.state NOT IN ('no_show', 'cancelled') THEN
      RAISE EXCEPTION 'recovery applies only to a Co-Owner booking after a late cancellation or no-show'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_recovery';
    END IF;
    SELECT array_agg(f.id ORDER BY f.id), max(d.checkin_at),
           bool_or(EXISTS (SELECT 1 FROM app.booking_exception_resolution z
                             JOIN app.booking_exception x ON x.id = z.exception_id
                            WHERE z.transition_id = t.id AND x.exception_type = 'operational'))
      INTO v_custodies, v_valid, v_from_exception
      FROM app.date_custody f
      JOIN app.date_custody p ON p.id = f.parent_custody_id
      JOIN app.second_home_date d ON d.second_home_id = f.second_home_id AND d.stay_date = f.stay_date
      JOIN app.booking_state_transition t ON t.operation_id = f.opened_by_operation AND t.booking_id = b.id
     WHERE f.second_home_id = b.second_home_id AND f.stay_date >= b.checkin_date AND f.stay_date < b.checkout_date
       AND f.closed_at IS NULL AND f.holder_kind = 'use_right' AND f.basis = 'forfeited_right'
       AND f.stake_id = b.stake_id AND p.basis = 'reserved_right' AND p.opened_by_operation = b.opened_by_operation
       AND v_at < d.checkin_at;
    IF v_custodies IS NULL THEN
      RAISE EXCEPTION 'no future forfeited capacity of this booking to recover'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_recovery';
    END IF;
    IF v_from_exception AND NOT r.availability_attested THEN
      RAISE EXCEPTION 'recovery after an operational exception requires the availability attestation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_attestation_missing';
    END IF;
  END IF;
  IF v_valid <= v_at THEN
    RAISE EXCEPTION 'the authorization would already be expired'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_expired';
  END IF;
  IF r.expected_dates IS DISTINCT FROM v_dates
     OR coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(r.expected_custody_ids) AS x), '{}') IS DISTINCT FROM v_custodies
     OR r.expected_cancellation_class IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'the expected scope differs from the scope derived from the facts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_scope_mismatch';
  END IF;
  INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, exception_id, scope_dates,
      scope_custody_ids, expected_cancellation_class, valid_until, approval_ref, authorized_at)
  VALUES (v_id, r.id, b.id, r.purpose, r.exception_id, v_dates, v_custodies, v_class, v_valid, p_approval_ref, v_at);
  RETURN v_id;
END $$;

-- migrate:down
-- Recusado quando a reversão reabriria o defeito sobre fatos ou ativação: K1/K2 presentes, reserva, solicitação ou
-- autorização existentes. Sem eles (banco vazio do `db:check`), volta exatamente o corpo da E1.
DO $$
BEGIN
  LOCK TABLE app.capability_activation, app.booking, app.booking_authorization_request, app.booking_authorization
    IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.capability_activation WHERE capability IN ('own_use_booking', 'own_use_lifecycle')) THEN
    RAISE EXCEPTION 'B-A3 rollback would reopen the P-A recovery origin defect under an activation decision';
  END IF;
  IF EXISTS (SELECT 1 FROM app.booking) OR EXISTS (SELECT 1 FROM app.booking_authorization_request)
     OR EXISTS (SELECT 1 FROM app.booking_authorization) THEN
    RAISE EXCEPTION 'B-A3 rollback would reopen the P-A recovery origin defect over existing booking facts';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.authorize_booking_action(p_request_id uuid, p_approval_ref text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_at timestamptz;
  r app.booking_authorization_request;
  b app.booking;
  i record;
  e app.booking_exception;
  v_dates date[] := '{}';
  v_custodies uuid[] := '{}';
  v_class text;
  v_valid timestamptz;
  v_from_exception boolean;
  v_id uuid := gen_random_uuid();
BEGIN
  IF p_request_id IS NULL OR p_approval_ref IS NULL
     OR p_approval_ref !~ '^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$' THEN
    RAISE EXCEPTION 'authorization input outside the closed schema'
      USING ERRCODE = 'invalid_parameter_value', CONSTRAINT = 'authorization_input';
  END IF;
  SELECT * INTO r FROM app.booking_authorization_request WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown authorization request'
      USING ERRCODE = 'no_data_found', CONSTRAINT = 'authorization_request_unknown';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.booking:' || r.booking_id::text, 0));
  v_at := clock_timestamp();
  IF EXISTS (SELECT 1 FROM app.booking_authorization WHERE request_id = r.id) THEN
    RAISE EXCEPTION 'the request was already authorized'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'authorization_request_already_authorized';
  END IF;
  -- Duas autorizações vivas para a mesma reserva e finalidade: exatamente uma.
  IF EXISTS (SELECT 1 FROM app.booking_authorization x
              WHERE x.booking_id = r.booking_id AND x.purpose = r.purpose AND x.valid_until > v_at
                AND NOT EXISTS (SELECT 1 FROM app.booking_authorization_use u WHERE u.authorization_id = x.id)
                AND NOT EXISTS (SELECT 1 FROM app.booking_authorization_revocation v WHERE v.authorization_id = x.id)) THEN
    RAISE EXCEPTION 'a live authorization already exists for this booking and purpose'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'authorization_live_exists';
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = r.booking_id;
  SELECT * INTO i FROM app.booking_period_instants(b.id);
  IF r.purpose = 'no_show' THEN
    IF b.state NOT IN ('confirmed', 'in_use')
       OR NOT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, v_at) THEN
      RAISE EXCEPTION 'a no-show authorization is issued only inside the no-show window'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_window';
    END IF;
    v_dates := app.booking_unstarted_nights(b.id, v_at);
    v_valid := i.checkout_at;
  ELSIF r.purpose IN ('exception_cancellation', 'invalidation') THEN
    SELECT x.* INTO e FROM app.booking_exception x
     WHERE x.id = r.exception_id AND x.booking_id = b.id
       AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution z WHERE z.exception_id = x.id);
    IF NOT FOUND OR b.state <> 'in_exception'
       OR e.exception_type <> (CASE r.purpose WHEN 'exception_cancellation' THEN 'operational'
                                 ELSE 'unauthorized_booking' END) THEN
      RAISE EXCEPTION 'the authorization requires the matching open exception'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_exception';
    END IF;
    v_dates := app.booking_unstarted_nights(b.id, v_at);
    IF cardinality(v_dates) = 0 THEN
      RAISE EXCEPTION 'the authorization requires at least one night not started'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_nights';
    END IF;
    v_valid := i.last_checkin_at;
    IF r.purpose = 'exception_cancellation' AND b.stake_id IS NOT NULL THEN
      v_class := CASE WHEN app.own_use_cancellation_timely(i.first_checkin_at, v_at) THEN 'timely' ELSE 'late' END;
    END IF;
  ELSE
    -- Recuperação (BR-283, BR-284): custódias `forfeited_right` ativas e futuras com linhagem à reserva, depois do
    -- no-show ou do cancelamento tardio commitado; origem P-A exige atestação de disponibilidade.
    IF b.stake_id IS NULL OR b.state NOT IN ('no_show', 'cancelled') THEN
      RAISE EXCEPTION 'recovery applies only to a Co-Owner booking after a late cancellation or no-show'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_recovery';
    END IF;
    SELECT array_agg(f.id ORDER BY f.id), max(d.checkin_at), bool_or(t.kind = 'exception_resolution')
      INTO v_custodies, v_valid, v_from_exception
      FROM app.date_custody f
      JOIN app.date_custody p ON p.id = f.parent_custody_id
      JOIN app.second_home_date d ON d.second_home_id = f.second_home_id AND d.stay_date = f.stay_date
      JOIN app.booking_state_transition t ON t.operation_id = f.opened_by_operation AND t.booking_id = b.id
     WHERE f.second_home_id = b.second_home_id AND f.stay_date >= b.checkin_date AND f.stay_date < b.checkout_date
       AND f.closed_at IS NULL AND f.holder_kind = 'use_right' AND f.basis = 'forfeited_right'
       AND f.stake_id = b.stake_id AND p.basis = 'reserved_right' AND p.opened_by_operation = b.opened_by_operation
       AND v_at < d.checkin_at;
    IF v_custodies IS NULL THEN
      RAISE EXCEPTION 'no future forfeited capacity of this booking to recover'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_recovery';
    END IF;
    IF v_from_exception AND NOT r.availability_attested THEN
      RAISE EXCEPTION 'recovery after an operational exception requires the availability attestation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_attestation_missing';
    END IF;
  END IF;
  IF v_valid <= v_at THEN
    RAISE EXCEPTION 'the authorization would already be expired'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_emission_expired';
  END IF;
  IF r.expected_dates IS DISTINCT FROM v_dates
     OR coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(r.expected_custody_ids) AS x), '{}') IS DISTINCT FROM v_custodies
     OR r.expected_cancellation_class IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'the expected scope differs from the scope derived from the facts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_scope_mismatch';
  END IF;
  INSERT INTO app.booking_authorization (id, request_id, booking_id, purpose, exception_id, scope_dates,
      scope_custody_ids, expected_cancellation_class, valid_until, approval_ref, authorized_at)
  VALUES (v_id, r.id, b.id, r.purpose, r.exception_id, v_dates, v_custodies, v_class, v_valid, p_approval_ref, v_at);
  RETURN v_id;
END $$;
