-- migrate:up
-- W22 (REQ-061, REQ-063, REQ-064, REQ-096, PD-006, PD-012; TECH-053, TECH-073; ADR-0037 §14): Request transitions.
-- Keep the existing terminal-event uniqueness and allow at most one winning Request per acceptance operation.

ALTER TABLE app.luxchange_request
  DROP CONSTRAINT luxchange_request_state,
  ADD CONSTRAINT luxchange_request_state CHECK (state IN ('pending', 'expired', 'cancelled_pre_accept', 'accepted', 'declined'));
ALTER TABLE app.luxchange_request_transition
  DROP CONSTRAINT luxchange_request_transition_pair,
  ADD CONSTRAINT luxchange_request_transition_pair CHECK (from_state = 'pending' AND (
    (to_state = 'expired' AND reason = 'expired')
    OR (to_state = 'accepted' AND reason = 'accepted' AND evidence_kind = 'actor' AND evidence_id IS NULL)
    OR (to_state = 'declined' AND reason = 'declined' AND evidence_kind = 'actor' AND evidence_id IS NULL)
    OR (to_state = 'cancelled_pre_accept' AND reason IN ('withdrawn', 'period_started', 'requester_membership',
        'holder_membership', 'capacity_unavailable', 'complement_unavailable'))));
CREATE UNIQUE INDEX luxchange_request_accept_one_per_operation
  ON app.luxchange_request_transition (operation_id) WHERE to_state = 'accepted';

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  r app.luxchange_request;
  v_at timestamptz;
  v_reason text;
  v_kind text;
  v_evidence uuid;
  v_resolved_at timestamptz;
  v_night record;
  v_id uuid;
  v_winner uuid;
  v_cession uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- TECH-053 classe 1.
  SELECT * INTO r FROM app.luxchange_request WHERE id = NEW.request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a transition belongs to an existing Request'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'luxchange_request_transition_request_id_fkey';
  END IF;
  IF r.state <> 'pending' THEN
    RAISE EXCEPTION 'a Request closes once, from pending'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_luxchange_request_closed';
  END IF;
  -- Only the winning transition is selected by this input. State, actor, clock and evidence come from the database.
  IF op.command = 'accept_request' AND NEW.reason = 'accepted' THEN
    -- A fixed transaction snapshot could miss a sender that committed while class 5 was blocked.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'acceptance requires READ COMMITTED to see requests committed before the night locks'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_isolation';
    END IF;
    IF op.role <> 'titular' OR op.actor_user_id IS NULL OR op.acting_party_id IS DISTINCT FROM r.holder_party_id
       OR (op.second_home_id IS NOT NULL AND op.second_home_id <> r.second_home_id) THEN
      RAISE EXCEPTION 'only the holder accepts this Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
    IF NOT app.economic_snapshot_in_current_transaction(op.id) THEN
      RAISE EXCEPTION 'acceptance belongs to the transaction of its snapshot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_transaction';
    END IF;
    SELECT resolved_at INTO STRICT v_resolved_at FROM app.economic_snapshot WHERE operation_id = op.id;

    PERFORM app.assert_credits_active();
    PERFORM app.assert_payments_active();
    PERFORM app.assert_luxchange_exchange_active();
    IF r.complement_credits > 0 THEN
      PERFORM app.assert_luxchange_deposit_active();
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.holder_party_id, clock_timestamp());

    -- TECH-053: ordered and reentrant when the caller already holds these locks.
    PERFORM app.assert_credit_membership(least(r.holder_party_id, r.requester_party_id));
    PERFORM app.assert_credit_membership(greatest(r.holder_party_id, r.requester_party_id));
    FOR v_id IN
      SELECT DISTINCT h.stake_id FROM app.holding h WHERE h.stake_id IS NOT NULL AND h.id IN (
        SELECT r.holder_holding_id
        UNION ALL
        SELECT u.holding_id FROM app.luxchange_request_complement_unit u WHERE u.request_id = r.id
      ) ORDER BY h.stake_id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('app.stake:' || v_id::text, 0));
    END LOOP;
    FOR v_night IN
      SELECT n.second_home_id, n.stay_date FROM app.luxchange_request_night n WHERE n.request_id = r.id
      UNION
      SELECT n.second_home_id, n.stay_date FROM app.luxchange_request_complement_night n WHERE n.request_id = r.id
      ORDER BY 1, 2
    LOOP
      PERFORM app.lock_night(v_night.second_home_id, v_night.stay_date, false);
    END LOOP;
    FOR v_id IN
      SELECT n.booking_id FROM app.luxchange_request_night n WHERE n.request_id = r.id AND n.booking_id IS NOT NULL
      UNION
      SELECT u.booking_id FROM app.luxchange_request_complement_unit u
       WHERE u.request_id = r.id AND u.booking_id IS NOT NULL
      ORDER BY 1
    LOOP
      PERFORM app.lock_booking(v_id, false);
    END LOOP;

    v_at := clock_timestamp();
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.holder_party_id, v_at);
    IF EXISTS (SELECT 1 FROM app.party_delegation d
                WHERE d.user_id = op.actor_user_id AND d.party_id = r.requester_party_id AND d.state = 'active'
                  AND d.valid_from <= v_at AND (d.valid_until IS NULL OR v_at < d.valid_until)) THEN
      RAISE EXCEPTION 'the acting user also represents the requester'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_self_dealing';
    END IF;
    IF v_resolved_at < r.sent_at OR v_resolved_at >= r.expires_at OR v_at >= r.expires_at THEN
      RAISE EXCEPTION 'the Request is accepted before its deadline'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_deadline';
    END IF;
    IF (app.luxchange_request_closure_reason(r.id)).reason IS NOT NULL
       OR NOT EXISTS (SELECT 1 FROM app.holding h WHERE h.party_id = r.requester_party_id
                       AND h.valid_from <= v_at AND (h.valid_until IS NULL OR v_at < h.valid_until))
       OR EXISTS (SELECT 1 FROM app.luxchange_request_night n
                   WHERE n.request_id = r.id
                     AND app.luxchange_complement_effective(n.second_home_id, n.stay_date) IS NOT NULL)
       OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                   WHERE u.request_id = r.id AND u.state <> 'active')
       OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night n
                   JOIN app.second_home_date d USING (second_home_id, stay_date)
                   WHERE n.request_id = r.id AND (n.state <> 'active'
                       OR NOT app.luxchange_deposit_notice_met(d.checkin_at, v_resolved_at))) THEN
      RAISE EXCEPTION 'the Request and its committed capacity must still be eligible'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_ineligible';
    END IF;
    NEW.from_state := 'pending';
    NEW.to_state := 'accepted';
    NEW.reason := 'accepted';
    NEW.evidence_kind := 'actor';
    NEW.evidence_id := NULL;
    NEW.created_at := v_at;
    RETURN NEW;
  END IF;

  v_at := clock_timestamp();
  SELECT c.reason, c.evidence_kind, c.evidence_id INTO v_reason, v_kind, v_evidence
    FROM app.luxchange_request_closure_reason(r.id) c;
  IF op.command IN ('withdraw_request', 'send_request') THEN
    IF op.role <> 'titular' OR op.actor_user_id IS NULL OR op.acting_party_id IS DISTINCT FROM r.requester_party_id THEN
      RAISE EXCEPTION 'only the requester closes the Request with this command'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.requester_party_id, v_at);
  ELSIF op.command = 'reject_request' THEN
    IF op.role <> 'titular' OR op.actor_user_id IS NULL OR op.acting_party_id IS DISTINCT FROM r.holder_party_id
       OR (op.second_home_id IS NOT NULL AND op.second_home_id <> r.second_home_id) THEN
      RAISE EXCEPTION 'only the holder declines this Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.holder_party_id, v_at);
    v_at := clock_timestamp();
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.holder_party_id, v_at);
    NEW.from_state := 'pending';
    NEW.to_state := CASE WHEN v_at >= r.expires_at THEN 'expired' ELSE 'declined' END;
    NEW.reason := NEW.to_state;
    NEW.evidence_kind := CASE WHEN NEW.to_state = 'expired' THEN 'clock' ELSE 'actor' END;
    NEW.evidence_id := NULL;
    NEW.created_at := v_at;
    RETURN NEW;
  ELSIF op.command = 'accept_request' THEN
    SELECT t.request_id INTO v_winner FROM app.luxchange_request_transition t
     WHERE t.operation_id = op.id AND t.to_state = 'accepted';
    IF v_winner IS NULL OR NOT app.economic_snapshot_in_current_transaction(op.id) THEN
      RAISE EXCEPTION 'a competing closure belongs to the current acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
    -- Match by night. A competing Request may already have lost the original custody of that night.
    WITH ceded AS (
      SELECT n.custody_id, n.second_home_id, n.stay_date, 'request_destination:' || v_winner AS authorization_ref
        FROM app.luxchange_request_night n WHERE n.request_id = v_winner
      UNION ALL
      SELECT n.custody_id, n.second_home_id, n.stay_date, 'request_complement:' || v_winner
        FROM app.luxchange_request_complement_night n WHERE n.request_id = v_winner
    ), competing AS (
      SELECT n.second_home_id, n.stay_date FROM app.luxchange_request_night n WHERE n.request_id = r.id
      UNION
      SELECT n.second_home_id, n.stay_date FROM app.luxchange_request_complement_night n
       WHERE n.request_id = r.id AND n.state = 'active'
    )
    SELECT parent.id INTO v_cession
      FROM ceded d JOIN competing n USING (second_home_id, stay_date)
      JOIN app.date_custody parent ON parent.id = d.custody_id AND parent.closed_by_operation = op.id
      JOIN app.date_custody successor ON successor.parent_custody_id = parent.id
       AND successor.opened_by_operation = op.id AND successor.inventory_origin = 'luxchange_cession'
       AND successor.authorization_ref = d.authorization_ref
     ORDER BY d.second_home_id, d.stay_date, parent.id LIMIT 1;
    IF v_cession IS NULL THEN
      RAISE EXCEPTION 'a competing Request overlaps a proven cession of the winning Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_competing_cession';
    END IF;
    -- Preserve independent evidence from W21, including expiration and loss of Membership before this acceptance.
    -- When W21 sees an effect of the winning Request, use the parent custody as the evidence (ADR-0037 §14.3).
    IF v_reason IS NULL
       OR (v_kind = 'custody' AND EXISTS (SELECT 1 FROM app.date_custody c
                 WHERE c.id = v_evidence AND c.closed_by_operation = op.id))
       OR (v_kind = 'booking_transition' AND EXISTS (SELECT 1 FROM app.booking_state_transition t
                 WHERE t.id = v_evidence AND t.operation_id = op.id))
       OR (v_kind = 'occupancy' AND EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.id = v_evidence AND o.opened_by_operation = op.id))
       OR (v_kind = 'complement_night' AND EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                 WHERE u.id = v_evidence AND u.request_id = v_winner)) THEN
      v_reason := 'capacity_unavailable';
      v_kind := 'custody';
      v_evidence := v_cession;
    END IF;
  ELSIF op.command IN ('expire_requests', 'close_ineligible_request') THEN
    IF op.role <> 'system' THEN
      RAISE EXCEPTION 'expiration and ineligibility closings are system commands'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
  ELSE
    RAISE EXCEPTION 'command % does not close a pending Request in this wave', op.command
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
  END IF;
  IF op.command = 'withdraw_request' AND v_reason IS DISTINCT FROM 'expired' THEN
    NEW.to_state := 'cancelled_pre_accept';
    NEW.reason := 'withdrawn';
    NEW.evidence_kind := 'actor';
    NEW.evidence_id := NULL;
  ELSE
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'the Request can still be accepted'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_still_acceptable';
    END IF;
    IF (op.command = 'expire_requests' AND v_reason <> 'expired')
       OR (op.command = 'close_ineligible_request' AND v_reason = 'expired') THEN
      RAISE EXCEPTION 'the closing command does not match the proven reason %', v_reason
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_reason';
    END IF;
    NEW.to_state := CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'cancelled_pre_accept' END;
    NEW.reason := v_reason;
    NEW.evidence_kind := v_kind;
    NEW.evidence_id := v_evidence;
  END IF;
  NEW.from_state := 'pending';
  NEW.created_at := v_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'luxchange_request_transition' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'Request state projection runs only after a transition insert'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_projection';
  END IF;
  UPDATE app.luxchange_request
     SET state = NEW.to_state, closure_reason = NEW.reason, last_transition_id = NEW.id,
         closed_by_operation = NEW.operation_id, closed_at = NEW.created_at
   WHERE id = NEW.request_id;
  -- Acceptance keeps the commitments for consumption by its cession. Only pre-acceptance outcomes release them.
  IF NEW.to_state = 'accepted' THEN
    RETURN NULL;
  END IF;
  UPDATE app.luxchange_request_complement_unit SET state = 'released', closed_by_operation = NEW.operation_id
   WHERE request_id = NEW.request_id AND state = 'active';
  UPDATE app.luxchange_request_complement_night SET state = 'released'
   WHERE request_id = NEW.request_id AND state = 'active';
  RETURN NULL;
END $$;

-- ADR-0037 §8: the accepted transition is the sole authority for all cession writes.
CREATE FUNCTION app.luxchange_request_accepted_write(p_operation uuid) RETURNS app.luxchange_request
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request;
BEGIN
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT q.* INTO r
    FROM app.luxchange_request_transition t
    JOIN app.luxchange_request q ON q.id = t.request_id AND q.last_transition_id = t.id
    JOIN app.operation o ON o.id = t.operation_id
   WHERE t.operation_id = p_operation AND t.to_state = 'accepted'
     AND q.state = 'accepted' AND o.command = 'accept_request';
  IF NOT FOUND OR NOT app.economic_snapshot_in_current_transaction(p_operation) THEN
    RAISE EXCEPTION 'cession requires the accepted Request in the transaction of its snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_binding';
  END IF;
  RETURN r;
END $$;

-- Source rows of the two cession paths, from the send facts. No current PRL lookup.
CREATE FUNCTION app.luxchange_request_cession_nights(p_request uuid)
  RETURNS TABLE (custody_id uuid, second_home_id uuid, stay_date date, holding_id uuid, booking_id uuid,
    complement_unit_id uuid, prl_id uuid)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT n.custody_id, n.second_home_id, n.stay_date, r.holder_holding_id, n.booking_id, NULL::uuid, s.prl_id
    FROM app.luxchange_request_night n JOIN app.luxchange_request r ON r.id = n.request_id
    LEFT JOIN app.economic_snapshot_night s ON s.operation_id = r.operation_id
     AND s.second_home_id = n.second_home_id AND s.stay_date = n.stay_date
   WHERE n.request_id = p_request
  UNION ALL
  SELECT n.custody_id, n.second_home_id, n.stay_date, u.holding_id, u.booking_id, u.id, n.prl_id
    FROM app.luxchange_request_complement_night n JOIN app.luxchange_request_complement_unit u ON u.id = n.unit_id
   WHERE n.request_id = p_request
$$;

CREATE FUNCTION app.luxchange_request_cession_ref(p_operation uuid, p_custody app.date_custody) RETURNS text
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; n record; h app.holding; v_checkin timestamptz; v_resolved_at timestamptz;
BEGIN
  r := app.luxchange_request_accepted_write(p_operation);
  SELECT * INTO n FROM app.luxchange_request_cession_nights(r.id) x
   WHERE x.custody_id = p_custody.id AND x.second_home_id = p_custody.second_home_id
     AND x.stay_date = p_custody.stay_date;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only the original custody of a recorded night of the accepted Request may be ceded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_source';
  END IF;
  SELECT * INTO h FROM app.holding WHERE id = n.holding_id;
  IF NOT FOUND OR h.second_home_id <> n.second_home_id OR h.valid_from > r.closed_at
     OR (h.valid_until IS NOT NULL AND h.valid_until <= r.closed_at)
     OR h.party_id <> (CASE WHEN n.complement_unit_id IS NULL THEN r.holder_party_id ELSE r.requester_party_id END) THEN
    RAISE EXCEPTION 'the source belongs to the holding recorded on the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_holding';
  END IF;
  IF n.booking_id IS NULL THEN
    IF h.role <> 'owner' OR p_custody.holder_kind <> 'owner' THEN
      RAISE EXCEPTION 'a free cession uses Owner custody'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_source';
    END IF;
  ELSIF h.role <> 'co_owner' OR p_custody.holder_kind <> 'use_right'
     OR p_custody.basis IS DISTINCT FROM 'reserved_right' OR p_custody.stake_id IS DISTINCT FROM h.stake_id
     OR NOT EXISTS (
       SELECT 1 FROM app.booking b JOIN app.booking_state_transition t ON t.id = b.last_transition_id
        WHERE b.id = n.booking_id AND b.holding_id = h.id AND b.stake_id = h.stake_id
          AND b.opened_by_operation = p_custody.opened_by_operation AND b.state = 'cancelled'
          AND t.operation_id = p_operation AND t.kind = 'cession') THEN
    RAISE EXCEPTION 'a reserved right is ceded with its Co-Owner booking in the same acceptance'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_booking';
  END IF;

  SELECT d.checkin_at INTO STRICT v_checkin FROM app.second_home_date d
   WHERE d.second_home_id = n.second_home_id AND d.stay_date = n.stay_date;
  IF NOT EXISTS (SELECT 1 FROM app.prl p WHERE p.id = n.prl_id AND p.second_home_id = n.second_home_id
                   AND p.stay_date = n.stay_date AND p.currency = 'BRL') THEN
    RAISE EXCEPTION 'the ceded night uses the PRL recorded at send'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_prl';
  END IF;
  IF n.complement_unit_id IS NULL THEN
    IF v_checkin <= r.closed_at THEN
      RAISE EXCEPTION 'requested capacity must be future at acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_notice';
    END IF;
    RETURN 'request_destination:' || r.id;
  END IF;

  SELECT resolved_at INTO STRICT v_resolved_at FROM app.economic_snapshot WHERE operation_id = p_operation;
  IF NOT app.luxchange_deposit_notice_met(v_checkin, v_resolved_at) THEN
    RAISE EXCEPTION 'complement capacity must meet the deposit notice at acceptance'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_notice';
  END IF;
  IF NOT EXISTS (
     SELECT 1 FROM app.luxchange_request_complement_night x
     JOIN app.luxchange_request_complement_unit u ON u.id = x.unit_id
     JOIN app.prl p ON p.id = x.prl_id
      WHERE x.unit_id = n.complement_unit_id AND x.custody_id = p_custody.id
        AND x.state = 'active' AND u.state = 'active'
        AND x.potential_credits = app.luxchange_night_credits(p.amount_minor,
            app.luxchange_snapshot_parameter(r.operation_id, 'credit_multiplier'))) THEN
    RAISE EXCEPTION 'only the active complement committed by this Request may be ceded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_commitment';
  END IF;
  RETURN 'request_complement:' || r.id;
END $$;

-- Run after a real successor exists. A multi-night Co-Owner unit is consumed only after all its nights were ceded.
CREATE FUNCTION app.luxchange_request_consume_complement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; v_unit uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'date_custody' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'complement consumption follows the successor custody insert'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_commitment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id = NEW.opened_by_operation AND command = 'accept_request') THEN
    RETURN NULL;
  END IF;
  r := app.luxchange_request_accepted_write(NEW.opened_by_operation);
  IF NEW.authorization_ref IS DISTINCT FROM 'request_complement:' || r.id THEN
    RETURN NULL;
  END IF;
  SELECT n.unit_id INTO STRICT v_unit FROM app.luxchange_request_complement_night n
   WHERE n.request_id = r.id AND n.custody_id = NEW.parent_custody_id;
  -- A multi-row insert can queue several AFTER events for the same unit.
  IF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u WHERE u.id = v_unit AND u.state = 'consumed'
               AND u.closed_by_operation = NEW.opened_by_operation) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM app.luxchange_request_complement_night n
     WHERE n.unit_id = v_unit AND NOT EXISTS (
       SELECT 1 FROM app.date_custody p JOIN app.date_custody s ON s.parent_custody_id = p.id
        WHERE p.id = n.custody_id AND p.closed_by_operation = NEW.opened_by_operation
          AND s.opened_by_operation = NEW.opened_by_operation AND s.inventory_origin = 'luxchange_cession'
          AND s.authorization_ref = NEW.authorization_ref)) THEN
    RETURN NULL;
  END IF;
  UPDATE app.luxchange_request_complement_unit SET state = 'consumed', closed_by_operation = NEW.opened_by_operation
   WHERE id = v_unit AND state = 'active';
  UPDATE app.luxchange_request_complement_night SET state = 'consumed'
   WHERE unit_id = v_unit AND state = 'active';
  RETURN NULL;
END $$;
CREATE TRIGGER date_custody_consume_complement AFTER INSERT ON app.date_custody
  FOR EACH ROW WHEN (NEW.inventory_origin = 'luxchange_cession')
  EXECUTE FUNCTION app.luxchange_request_consume_complement();

-- Structural completion remains part of the deferred acceptance check, independent of the financial blocks.
CREATE FUNCTION app.assert_luxchange_request_cession_complete(
  p_request uuid, p_operation uuid, p_at_acceptance boolean DEFAULT true
) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.luxchange_request_cession_nights(p_request) n
     WHERE NOT EXISTS (
       SELECT 1 FROM app.date_custody p JOIN app.date_custody s ON s.parent_custody_id = p.id
        WHERE p.id = n.custody_id AND p.closed_by_operation = p_operation AND s.opened_by_operation = p_operation
          AND s.inventory_origin = 'luxchange_cession' AND (NOT p_at_acceptance OR s.closed_at IS NULL)
          AND s.authorization_ref = CASE WHEN n.complement_unit_id IS NULL
                THEN 'request_destination:' ELSE 'request_complement:' END || p_request)
     OR (n.booking_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM app.booking b JOIN app.booking_state_transition t ON t.id = b.last_transition_id
       JOIN app.date_occupancy o ON o.booking_id = b.id
        WHERE b.id = n.booking_id AND b.state = 'cancelled' AND t.kind = 'cession' AND t.operation_id = p_operation
          AND o.custody_id = n.custody_id AND o.release_reason = 'ceded' AND o.released_by_operation = p_operation)))
     OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                 WHERE u.request_id = p_request AND (u.state <> 'consumed'
                       OR u.closed_by_operation IS DISTINCT FROM p_operation))
     OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night n
                 WHERE n.request_id = p_request AND n.state <> 'consumed')
     OR EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = p_operation) THEN
    RAISE EXCEPTION 'acceptance cedes all recorded nights and bookings, consumes commitments and preserves use rights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_complete';
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.luxchange_request_consume_complement(),
  app.luxchange_request_accepted_write(uuid), app.luxchange_request_cession_nights(uuid),
  app.luxchange_request_cession_ref(uuid, app.date_custody),
  app.assert_luxchange_request_cession_complete(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.luxchange_request_accepted_write(uuid), app.luxchange_request_cession_nights(uuid),
  app.luxchange_request_cession_ref(uuid, app.date_custody),
  app.assert_luxchange_request_cession_complete(uuid, uuid, boolean) TO luxtory_app;

CREATE OR REPLACE FUNCTION app.luxchange_complement_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_operation uuid; v_request uuid;
BEGIN
  IF TG_TABLE_NAME = 'luxchange_request_complement_unit' THEN
    IF (NEW.id, NEW.request_id, NEW.kind, NEW.holding_id, NEW.booking_id, NEW.potential_credits)
       IS DISTINCT FROM (OLD.id, OLD.request_id, OLD.kind, OLD.holding_id, OLD.booking_id, OLD.potential_credits) THEN
      RAISE EXCEPTION 'only the state of a commitment changes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_history_immutable';
    END IF;
    v_operation := NEW.closed_by_operation;
    v_request := NEW.request_id;
  ELSE
    IF (NEW.unit_id, NEW.request_id, NEW.second_home_id, NEW.stay_date, NEW.custody_id, NEW.prl_id, NEW.potential_credits)
       IS DISTINCT FROM
       (OLD.unit_id, OLD.request_id, OLD.second_home_id, OLD.stay_date, OLD.custody_id, OLD.prl_id, OLD.potential_credits)
    THEN
      RAISE EXCEPTION 'only the state of a commitment changes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_history_immutable';
    END IF;
    SELECT u.closed_by_operation INTO v_operation FROM app.luxchange_request_complement_unit u
     WHERE u.id = NEW.unit_id AND u.state = NEW.state;
    v_request := NEW.request_id;
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF NEW.state = 'consumed' THEN
    IF OLD.state <> 'active' OR NOT app.acts_as_schema_owner()
       OR (app.luxchange_request_accepted_write(v_operation)).id IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'only the accepted Request may consume its active commitment'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_commitment';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'released' OR v_operation IS NULL
     OR NOT EXISTS (SELECT 1 FROM app.luxchange_request_transition t
                     WHERE t.request_id = v_request AND t.operation_id = v_operation AND t.to_state <> 'accepted') THEN
    RAISE EXCEPTION 'a commitment is released only by the pre-acceptance closing of its Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_release';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.assert_luxchange_request_closing_complete(p_transition uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.luxchange_request_transition; r app.luxchange_request; f app.fee_charge; op app.operation;
BEGIN
  SELECT * INTO STRICT t FROM app.luxchange_request_transition WHERE id = p_transition;
  SELECT * INTO STRICT r FROM app.luxchange_request WHERE id = t.request_id;
  SELECT * INTO STRICT op FROM app.operation WHERE id = t.operation_id;
  IF r.state <> t.to_state OR r.last_transition_id <> t.id THEN
    RAISE EXCEPTION 'the Request state follows its closing'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_projection';
  END IF;
  IF EXISTS (SELECT 1 FROM app.credit_entry h
              WHERE h.operation_id = r.operation_id AND h.movement = 'hold'
                AND h.quantity <> coalesce((SELECT sum(x.quantity) FROM app.credit_entry x
                                             WHERE x.parent_entry_id = h.id AND x.movement = 'release'
                                               AND x.operation_id = t.operation_id), 0)) THEN
    RAISE EXCEPTION 'a pre-acceptance closing releases the whole guarantee of the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_guarantee';
  END IF;
  SELECT * INTO STRICT f FROM app.fee_charge WHERE operation_id = r.operation_id;
  IF NOT EXISTS (SELECT 1 FROM app.fee_charge_reversal v WHERE v.fee_charge_id = f.id AND v.operation_id = t.operation_id)
     OR NOT EXISTS (SELECT 1 FROM app.refund x
                     WHERE x.payment_id = f.payment_id AND x.operation_id = t.operation_id
                       AND x.amount_minor = f.amount_minor AND x.currency = f.currency
                       AND (op.command <> 'accept_request'
                         OR NOT app.economic_snapshot_in_current_transaction(op.id)
                         OR (x.state = 'pending' AND x.provider_refund_id IS NULL AND x.resolved_at IS NULL))) THEN
    RAISE EXCEPTION 'a pre-acceptance closing reverses the Fee with a full refund'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_fee';
  END IF;
  IF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u WHERE u.request_id = r.id
              AND (u.state <> 'released' OR u.closed_by_operation IS DISTINCT FROM t.operation_id))
     OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night c WHERE c.request_id = r.id AND c.state <> 'released')
  THEN
    RAISE EXCEPTION 'a pre-acceptance closing releases every committed date'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_complement';
  END IF;
  IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request', 'reject_request')
     AND (EXISTS (SELECT 1 FROM app.date_custody c
                   WHERE c.opened_by_operation = op.id OR c.closed_by_operation = op.id)
          OR EXISTS (SELECT 1 FROM app.date_occupancy o
                      WHERE o.opened_by_operation = op.id OR o.released_by_operation = op.id)
          OR EXISTS (SELECT 1 FROM app.booking_state_transition b WHERE b.operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.settlement s WHERE s.operation_id = op.id)) THEN
    RAISE EXCEPTION 'closing a Request never touches capacity, use right, credit lots or settlement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_side_effect';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.credit_entry_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  lot app.credit_lot;
  parent app.credit_entry;
  r app.luxchange_request;
  v_now timestamptz;
  v_valid boolean;
  v_left numeric;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- ADR-0037 §10: a K4 abre só movimento novo; liberação e expiração de obrigação existente nunca dependem de chave.
  IF NEW.movement NOT IN ('release', 'expire') THEN
    PERFORM app.assert_credits_active();
  END IF;
  -- K7 is required for new exchange effects; release of an existing guarantee is independent of it.
  IF op.command IN ('send_request', 'accept_request', 'create_direct') AND NEW.movement <> 'release' THEN
    PERFORM app.assert_luxchange_exchange_active();
  END IF;
  SELECT * INTO lot FROM app.credit_lot WHERE id = NEW.lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit movement on an unknown lot'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'credit_entry_lot_id_fkey';
  END IF;
  v_now := clock_timestamp();
  v_valid := v_now < lot.expires_at;
  NEW.command := op.command;
  NEW.created_at := v_now;
  IF NEW.parent_entry_id IS NOT NULL THEN
    SELECT * INTO parent FROM app.credit_entry WHERE id = NEW.parent_entry_id;
    IF NOT FOUND OR parent.lot_id <> NEW.lot_id
       OR parent.movement <> (CASE WHEN NEW.movement = 'reverse' THEN 'consume' ELSE 'hold' END) THEN
      RAISE EXCEPTION 'the movement follows a hold or a consumption of the same lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_parent';
    END IF;
  END IF;

  IF NEW.movement = 'originate' THEN
    -- Só o gatilho do lote (dono) escreve a originação, uma vez, com a quantidade e a operação do lote.
    IF NOT app.acts_as_schema_owner() OR NEW.quantity <> lot.quantity
       OR NEW.operation_id <> lot.origin_operation_id THEN
      RAISE EXCEPTION 'origination is recorded only with its lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_origination';
    END IF;
    NEW.created_at := lot.originated_at;
  ELSIF op.command = 'accept_request' AND NEW.movement = 'consume' AND NEW.from_bucket = 'available' THEN
    r := app.luxchange_request_accepted_write(op.id);
    IF lot.origin_operation_id IS DISTINCT FROM op.id OR lot.origin_command IS DISTINCT FROM 'accept_request'
       OR lot.party_id IS DISTINCT FROM r.requester_party_id OR lot.quantity IS DISTINCT FROM r.complement_credits
       OR r.complement_consumption <= 0 OR NEW.quantity IS DISTINCT FROM r.complement_consumption THEN
      RAISE EXCEPTION 'acceptance spends only the exact bound amount of its requester complement lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_consume_complement';
    END IF;
    -- The lot is already locked. Check the append-only ledger as well as the balance, even if the excess covers C.
    IF lot.available IS DISTINCT FROM lot.quantity OR EXISTS (
      SELECT 1 FROM app.credit_entry e WHERE e.lot_id = lot.id AND e.operation_id = op.id
        AND e.movement = 'consume' AND e.from_bucket = 'available') THEN
      RAISE EXCEPTION 'the complement amount is consumed once from the new lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_complement_already_spent';
    END IF;
  ELSIF NEW.movement = 'hold' OR (NEW.movement = 'consume' AND NEW.from_bucket = 'available') THEN
    -- Garantia (envio de Request) e consumo direto (Direct): a party que age gasta os próprios Créditos.
    IF op.command <> (CASE WHEN NEW.movement = 'hold' THEN 'send_request' ELSE 'create_direct' END)
       OR op.acting_party_id IS DISTINCT FROM lot.party_id OR op.actor_user_id IS NULL THEN
      RAISE EXCEPTION 'credits are spent only by their party through an authorized mechanism'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, lot.party_id, v_now);
    IF NEW.movement = 'hold' THEN
      -- W21 (TECH-071, ADR-0037 §4): a Garantia lastreia a Request da própria operação, com lote válido até o prazo.
      SELECT * INTO r FROM app.luxchange_request WHERE operation_id = op.id;
      IF NOT FOUND OR r.requester_party_id <> lot.party_id OR lot.expires_at < r.expires_at THEN
        RAISE EXCEPTION 'a hold backs the Request of its operation with a lot valid until the Request expires'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_hold_request';
      END IF;
      -- FEFO (ADR-0037 §2): nenhum lote elegível que vença antes — ou empate e seja mais antigo — fica com saldo livre.
      IF EXISTS (SELECT 1 FROM app.credit_lot x
                  WHERE x.party_id = lot.party_id AND x.id <> lot.id AND x.available > 0
                    AND v_now < x.expires_at AND x.expires_at >= r.expires_at
                    AND (x.expires_at, x.originated_at, x.id) < (lot.expires_at, lot.originated_at, lot.id)) THEN
        RAISE EXCEPTION 'the guarantee takes the eligible lots that expire first'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_hold_fefo';
      END IF;
    END IF;
  ELSIF NEW.movement = 'consume' THEN
    -- ADR-0037 §8: consume each original hold in full, only for the Request accepted by this operation.
    IF op.command <> 'accept_request' THEN
      RAISE EXCEPTION 'a hold is consumed only by the acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
    r := app.luxchange_request_accepted_write(op.id);
    IF parent.operation_id IS DISTINCT FROM r.operation_id OR parent.command IS DISTINCT FROM 'send_request'
       OR lot.party_id IS DISTINCT FROM r.requester_party_id OR NEW.quantity IS DISTINCT FROM parent.quantity THEN
      RAISE EXCEPTION 'acceptance consumes only the original Guarantee of the accepted Request, in full'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_consume_request';
    END IF;
  ELSIF NEW.movement = 'release' THEN
    IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request', 'send_request',
                      'reject_request', 'accept_request') THEN
      -- W21: só a Garantia da Request encerrada antes do aceite, na mesma operação do encerramento.
      SELECT q.* INTO r FROM app.luxchange_request q JOIN app.credit_entry h ON h.operation_id = q.operation_id
       WHERE h.id = NEW.parent_entry_id;
      IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.luxchange_request_transition t
                                   WHERE t.request_id = r.id AND t.operation_id = op.id
                                     AND t.to_state <> 'accepted') THEN
        RAISE EXCEPTION 'a hold is released only by the pre-acceptance closing of its Request'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
      END IF;
    ELSE
      RAISE EXCEPTION 'a hold is released only by a pre-acceptance closing'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
  ELSIF NEW.movement = 'expire' THEN
    IF op.command <> 'expire_credit_lots' OR v_valid OR NEW.quantity <> lot.available THEN
      RAISE EXCEPTION 'expiration records the whole available balance of a lot past its validity'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_expiration';
    END IF;
  ELSIF NEW.movement = 'reverse' THEN
    IF op.command <> 'reverse_credit' THEN
      RAISE EXCEPTION 'a consumption is reversed only by reverse_credit'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
    PERFORM app.lock_own_use_admin_authority(op);
  END IF;

  -- Uso exige `now < expires_at` e Membership elegível (TECH-044, TECH-071, BR-195), independentemente de job.
  IF NEW.movement IN ('hold', 'consume') THEN
    IF NOT v_valid THEN
      RAISE EXCEPTION 'credits are usable only before the lot expires'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credits_lot_expired';
    END IF;
    PERFORM app.assert_credit_membership(lot.party_id);
  END IF;
  -- Liberação e reversão voltam a `available` só antes do vencimento; depois, `expired` (TECH-070, TECH-072).
  IF NEW.movement IN ('release', 'reverse')
     AND NEW.to_bucket <> (CASE WHEN v_valid THEN 'available' ELSE 'expired' END) THEN
    RAISE EXCEPTION 'a released or reversed balance returns to available only before the lot expires'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_validity_bucket';
  END IF;
  -- Nenhuma liberação, consumo ou reversão acima do que o movimento-pai ainda reserva ou consumiu.
  IF NEW.parent_entry_id IS NOT NULL THEN
    SELECT parent.quantity - coalesce(sum(c.quantity), 0) INTO v_left
      FROM app.credit_entry c WHERE c.parent_entry_id = parent.id;
    IF NEW.quantity > v_left THEN
      RAISE EXCEPTION 'the movement exceeds what its hold or consumption still covers'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credits_parent_exceeded';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.fee_charge_reversal_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; fee_op app.operation; v_payment uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- Desfechos pré-aceite do PD-006 (TECH-051/TECH-090) e o encerramento por inelegibilidade (W21).
  IF op.command NOT IN ('withdraw_request', 'reject_request', 'accept_request', 'expire_requests',
                        'close_ineligible_request', 'send_request') THEN
    RAISE EXCEPTION 'the Fee is reversed only by a pre-acceptance outcome'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
  END IF;
  SELECT o.* INTO fee_op FROM app.fee_charge f JOIN app.operation o ON o.id = f.operation_id
   WHERE f.id = NEW.fee_charge_id;
  SELECT f.payment_id INTO v_payment FROM app.fee_charge f WHERE f.id = NEW.fee_charge_id;
  IF fee_op.command IS DISTINCT FROM 'send_request' THEN
    RAISE EXCEPTION 'only the Fee of a Request has pre-acceptance outcomes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_mechanism';
  END IF;
  -- ADR-0037 §10: the recorded pre-acceptance outcome authorizes reversal even with K5 off.
  IF NOT EXISTS (SELECT 1 FROM app.luxchange_request q JOIN app.luxchange_request_transition t ON t.request_id = q.id
                  WHERE q.operation_id = fee_op.id AND t.operation_id = op.id AND t.to_state <> 'accepted') THEN
    RAISE EXCEPTION 'the Fee is reversed only with the pre-acceptance closing of its Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
  END IF;
  PERFORM 1 FROM app.payment WHERE id = v_payment FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.settlement s WHERE s.fee_charge_id = NEW.fee_charge_id) THEN
    RAISE EXCEPTION 'a settled Fee is not reversed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_settled';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.booking_state_transition_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_at timestamptz;
  op app.operation;
  b app.booking;
  i record;
  e app.booking_exception;
  a app.booking_authorization;
  v_unstarted date[];
  v_class text;
  v_request app.luxchange_request;
  v_request_cession boolean;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a transition belongs to an existing booking'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'booking_state_transition_booking_id_fkey';
  END IF;
  IF b.channel = 'luxchange_request' AND NEW.kind <> 'advance' THEN
    RAISE EXCEPTION 'only advance is enabled for a Luxchange Request booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_booking_transition';
  END IF;
  v_request_cession := NEW.kind = 'cession' AND op.command = 'accept_request';
  IF NOT v_request_cession AND op.second_home_id IS NOT NULL AND op.second_home_id <> b.second_home_id THEN
    RAISE EXCEPTION 'the operation belongs to another Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  -- Atores: a autoridade antes das travas da reserva (padrão W8, ADR-0021).
  IF NEW.kind = 'advance' THEN
    IF op.command <> 'advance_booking_states' OR op.role <> 'system' THEN
      RAISE EXCEPTION 'only advance_booking_states advances a booking'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    END IF;
  ELSIF v_request_cession THEN
    -- The Request transition already took these booking and stake locks in TECH-053 order and checked both Memberships.
    v_request := app.luxchange_request_accepted_write(op.id);
    IF b.channel <> 'own_use' OR b.stake_id IS NULL
       OR (SELECT count(*) FROM app.luxchange_request_cession_nights(v_request.id) n
            WHERE n.booking_id = b.id AND n.holding_id = b.holding_id AND n.second_home_id = b.second_home_id
              AND n.stay_date >= b.checkin_date AND n.stay_date < b.checkout_date)
           <> b.checkout_date - b.checkin_date THEN
      RAISE EXCEPTION 'acceptance cedes only a whole Co-Owner booking recorded on the accepted Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_booking';
    END IF;
  ELSIF NEW.kind = 'cession' THEN
    -- W20 (ADR-0036 §1): a cessão da reserva Co-Owner pelo depósito, com a K6 (não a K2).
    PERFORM app.assert_luxchange_deposit_active();
    IF op.command <> 'deposit_capacity' THEN
      RAISE EXCEPTION 'only deposit_capacity cedes a booking'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    END IF;
  ELSE
    -- K2 (ADR-0027 §5): os seis commands; jobs fora.
    PERFORM app.assert_own_use_lifecycle_active();
    IF NEW.kind = 'cancellation' THEN
      IF op.command <> 'cancel_own_use_booking' THEN
        RAISE EXCEPTION 'only cancel_own_use_booking cancels on behalf of the Titular'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
      END IF;
    ELSIF op.command <> (CASE NEW.kind
        WHEN 'no_show' THEN 'declare_no_show'
        WHEN 'exception_opening' THEN 'open_exception'
        WHEN 'exception_resolution' THEN 'resolve_exception'
        ELSE (CASE WHEN b.stake_id IS NULL THEN 'resolve_exception' ELSE 'correct_use_right' END)
      END) THEN
      RAISE EXCEPTION 'the transition kind does not match the command of the operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    ELSE
      PERFORM app.lock_own_use_admin_authority(op);
    END IF;
  END IF;
  IF NEW.kind IN ('cancellation', 'cession') AND NOT v_request_cession THEN
    PERFORM app.lock_own_use_titular(op, b, clock_timestamp());
  END IF;
  PERFORM app.lock_own_use_booking(b);
  -- Relê depois da trava (READ COMMITTED): a transição concorrente que venceu já está visível.
  SELECT * INTO STRICT b FROM app.booking WHERE id = NEW.booking_id;
  v_at := clock_timestamp();
  IF NEW.previous_transition_id IS DISTINCT FROM b.last_transition_id OR NEW.from_state <> b.state THEN
    RAISE EXCEPTION 'a transition starts from the current state of the booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_transition_stale';
  END IF;
  -- TECH-055 (o CHECK repete a regra para quando os gatilhos forem contornados).
  IF NOT coalesce(CASE NEW.kind
       WHEN 'advance' THEN (NEW.from_state, NEW.to_state) IN (('confirmed', 'in_use'), ('in_use', 'completed'))
       WHEN 'cancellation' THEN NEW.from_state IN ('confirmed', 'in_use', 'in_exception') AND NEW.to_state = 'cancelled'
       WHEN 'no_show' THEN NEW.from_state IN ('confirmed', 'in_use') AND NEW.to_state = 'no_show'
       WHEN 'exception_opening' THEN NEW.from_state IN ('confirmed', 'in_use') AND NEW.to_state = 'in_exception'
       WHEN 'exception_resolution' THEN NEW.from_state = 'in_exception'
         AND NEW.to_state IN ('confirmed', 'completed', 'cancelled')
       WHEN 'invalidation' THEN NEW.from_state = 'in_exception' AND NEW.to_state = 'cancelled'
       WHEN 'cession' THEN NEW.from_state = 'confirmed' AND NEW.to_state = 'cancelled'
     END, false) THEN
    RAISE EXCEPTION 'transition outside TECH-055'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_transition_pair';
  END IF;
  NEW.recorded_at := v_at;
  SELECT * INTO i FROM app.booking_period_instants(b.id);
  v_unstarted := app.booking_unstarted_nights(b.id, v_at);
  IF NEW.from_state = 'in_exception' THEN
    SELECT x.* INTO e FROM app.booking_exception x
     WHERE x.booking_id = b.id
       AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = x.id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a booking in exception has one open exception'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_open';
    END IF;
  END IF;

  IF v_request_cession THEN
    IF cardinality(v_unstarted) <> b.checkout_date - b.checkin_date OR NEW.cancellation_class IS NOT NULL THEN
      RAISE EXCEPTION 'acceptance cedes a whole future booking without cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_booking';
    END IF;
    NEW.first_affected_date := v_unstarted[1];
    RETURN NEW;
  END IF;

  IF NEW.kind = 'cession' THEN
    -- W20 (ADR-0036 §1–§3; REQ-060, TECH-023, TECH-043): só reserva Co-Owner, inteira e ainda não iniciada, com 14 dias
    -- de antecedência do 1º check-in, Membership elegível e todas as noites no snapshot da operação. Sem classe de
    -- cancelamento nem base: a cessão não é cancelamento convencional.
    IF b.stake_id IS NULL THEN
      RAISE EXCEPTION 'an Owner booking is cancelled before its capacity is deposited'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_owner_booking';
    END IF;
    IF cardinality(v_unstarted) <> b.checkout_date - b.checkin_date THEN
      RAISE EXCEPTION 'a booking is ceded whole, before its first night'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_whole_booking';
    END IF;
    IF NOT app.luxchange_deposit_notice_met(i.first_checkin_at, v_at) THEN
      RAISE EXCEPTION 'a capacity is deposited at least 14 days before its first check-in'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'deposit_min_notice';
    END IF;
    PERFORM app.assert_credit_membership(op.acting_party_id);
    IF EXISTS (SELECT 1 FROM unnest(v_unstarted) AS n(stay_date)
                WHERE NOT EXISTS (SELECT 1 FROM app.economic_snapshot_night s
                                   WHERE s.operation_id = op.id AND s.second_home_id = b.second_home_id
                                     AND s.stay_date = n.stay_date)) THEN
      RAISE EXCEPTION 'every ceded night is priced in the snapshot of its operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_snapshot';
    END IF;
    IF NEW.cancellation_class IS NOT NULL THEN
      RAISE EXCEPTION 'a cession carries no cancellation class'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    NEW.first_affected_date := v_unstarted[1];
    RETURN NEW;
  END IF;

  IF NEW.kind = 'advance' THEN
    -- TECH-055 pelo instante: em uso a partir do 1º check-in; concluída a partir do check-out.
    IF (NEW.to_state = 'in_use' AND v_at < i.first_checkin_at)
       OR (NEW.to_state = 'completed' AND v_at < i.checkout_at) THEN
      RAISE EXCEPTION 'the booking period has not reached this state yet'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_advance_early';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'an advance carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.kind = 'exception_opening' THEN
    IF v_at >= i.checkout_at THEN
      RAISE EXCEPTION 'an exception opens only before the check-out'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_exception_after_checkout';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'an exception opening carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.kind = 'exception_resolution' AND NEW.to_state IN ('confirmed', 'completed') THEN
    -- Resolução sem efeito econômico: `confirmed` só antes do check-out, `completed` só a partir dele (REQ-084).
    IF (NEW.to_state = 'confirmed' AND v_at >= i.checkout_at)
       OR (NEW.to_state = 'completed' AND v_at < i.checkout_at) THEN
      RAISE EXCEPTION 'the resolution follows the booking period'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_resolution_period';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'a resolution without cancellation carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  -- Daqui em diante, eventos que liberam noites: `cancelled` ou `no_show`.
  IF NEW.kind = 'no_show' THEN
    IF NOT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, v_at) THEN
      RAISE EXCEPTION 'a no-show is declared only between the first check-in and the check-out'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_no_show_window';
    END IF;
  ELSIF cardinality(v_unstarted) = 0 THEN
    RAISE EXCEPTION 'a cancellation needs at least one night not started'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_no_unstarted_night';
  END IF;
  -- REQ-080, TECH-043: classe no instante, só no Co-Owner e só no cancelamento (Titular ou P-A).
  IF b.stake_id IS NOT NULL AND NEW.kind IN ('cancellation', 'exception_resolution') THEN
    v_class := CASE WHEN app.own_use_cancellation_timely(i.first_checkin_at, v_at) THEN 'timely' ELSE 'late' END;
  END IF;
  IF NEW.kind = 'exception_resolution' AND e.exception_type <> 'operational' THEN
    RAISE EXCEPTION 'an unauthorized booking inquiry is cancelled only by invalidation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_inquiry_resolution';
  END IF;
  IF NEW.kind = 'invalidation' AND e.exception_type <> 'unauthorized_booking' THEN
    RAISE EXCEPTION 'only an unauthorized booking inquiry is invalidated'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_inquiry_resolution';
  END IF;

  IF NEW.kind = 'cancellation' THEN
    -- REQ-084: na apuração, o Co-Owner só cancela tempestivamente (tardio suspenso); o Owner, a qualquer tempo.
    IF NEW.from_state = 'in_exception' AND e.exception_type = 'unauthorized_booking' AND v_class = 'late' THEN
      RAISE EXCEPTION 'a late Co-Owner cancellation is suspended during an unauthorized booking inquiry'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_late_during_inquiry';
    END IF;
    -- D7: termos esperados da prévia = termos calculados no instante, ou nada acontece.
    IF NEW.cancellation_class IS DISTINCT FROM v_class OR NEW.first_affected_date IS DISTINCT FROM v_unstarted[1] THEN
      RAISE EXCEPTION 'the cancellation terms changed since the preview'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'cancellation_terms_changed';
    END IF;
    RETURN NEW;
  END IF;

  -- Atos Admin com efeito econômico: o uso da autorização independente da mesma operação (TECH-051, ADR-0027 §3).
  SELECT * INTO a FROM app.booking_authorization_of_operation(NEW.operation_id, b.id);
  IF a.id IS NULL OR a.purpose <> (CASE NEW.kind WHEN 'no_show' THEN 'no_show'
       WHEN 'exception_resolution' THEN 'exception_cancellation' ELSE 'invalidation' END) THEN
    RAISE EXCEPTION 'this act requires the independent authorization of the same operation'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_missing';
  END IF;
  IF (a.exception_id IS NOT NULL AND a.exception_id IS DISTINCT FROM e.id)
     OR NOT (v_unstarted <@ a.scope_dates)
     OR a.expected_cancellation_class IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'the act is outside the scope of the authorization'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
  END IF;
  NEW.cancellation_class := v_class;
  NEW.first_affected_date := v_unstarted[1];
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.assert_booking_closure_complete(p_transition uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t app.booking_state_transition;
  b app.booking;
  v_affected date[];
  v_n integer;
  v_reason text;
  v_spe_pool boolean;
BEGIN
  SELECT * INTO STRICT t FROM app.booking_state_transition WHERE id = p_transition;
  IF t.kind = 'cession' THEN
    IF EXISTS (SELECT 1 FROM app.operation WHERE id = t.operation_id AND command = 'accept_request') THEN
      -- This cession is bound to the accepted transition, whose deferred check covers all ceded bookings once.
      RETURN;
    END IF;
    -- W20 (ADR-0036 §6): a cessão é conferida com o depósito inteiro da operação, não como cancelamento.
    PERFORM app.assert_luxchange_deposit_complete(t.operation_id);
    RETURN;
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = t.booking_id;
  v_affected := app.booking_unstarted_nights(b.id, t.recorded_at);
  v_n := cardinality(v_affected);
  v_reason := app.booking_release_reason(t.kind);
  IF (SELECT count(*) FROM app.date_occupancy o
       WHERE o.booking_id = b.id AND o.released_by_operation = t.operation_id AND o.release_reason = v_reason
         AND o.stay_date = ANY (v_affected)) <> v_n
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.released_by_operation = t.operation_id
                   AND (o.booking_id <> b.id OR o.release_reason <> v_reason OR NOT (o.stay_date = ANY (v_affected)))) THEN
    RAISE EXCEPTION 'every night not started is released by the event, and only those'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_occupancy';
  END IF;
  IF b.stake_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = t.operation_id)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = t.operation_id)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.closed_by_operation = t.operation_id) THEN
      RAISE EXCEPTION 'an Owner booking moves neither custody nor use right'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_owner_effects';
    END IF;
    RETURN;
  END IF;
  v_spe_pool := t.kind = 'invalidation' OR t.cancellation_class = 'timely';
  IF (SELECT count(*) FROM app.date_custody p JOIN app.date_custody n ON n.parent_custody_id = p.id
       WHERE p.closed_by_operation = t.operation_id AND n.opened_by_operation = t.operation_id
         AND p.second_home_id = b.second_home_id AND p.stay_date = ANY (v_affected)
         AND p.opened_by_operation = b.opened_by_operation AND p.holder_kind = 'use_right'
         AND p.basis = 'reserved_right' AND p.stake_id = b.stake_id
         AND CASE WHEN v_spe_pool THEN n.holder_kind = 'spe_pool'
                  ELSE n.holder_kind = 'use_right' AND n.basis = 'forfeited_right' AND n.stake_id = b.stake_id END) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = t.operation_id) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = t.operation_id) <> v_n THEN
    RAISE EXCEPTION 'every night not started moves its reserved right as the event requires'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_custody';
  END IF;
  IF (SELECT count(*) FROM app.use_right_ledger l JOIN app.use_right_ledger c ON c.id = l.refers_to_id
       WHERE l.operation_id = t.operation_id AND c.operation_id = b.opened_by_operation AND c.movement = 'consume'
         AND c.stay_date = ANY (v_affected)
         AND l.movement = CASE WHEN t.kind = 'invalidation' THEN 'correction' ELSE 'restore' END)
        <> (CASE WHEN v_spe_pool THEN v_n ELSE 0 END)
     OR (SELECT count(*) FROM app.use_right_ledger l WHERE l.operation_id = t.operation_id)
        <> (CASE WHEN v_spe_pool THEN v_n ELSE 0 END) THEN
    RAISE EXCEPTION 'each night returned to the SPE reverses its consumption once; a forfeited night keeps it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_use_right';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.date_occupancy_release() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.booking_state_transition; v_command text; v_custody app.date_custody;
BEGIN
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'a released occupancy never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_released_once';
  END IF;
  SELECT command INTO v_command FROM app.operation WHERE id = NEW.released_by_operation;
  IF v_command = 'accept_request' OR NOT app.acts_as_schema_owner() THEN
    IF v_command = 'accept_request' THEN
      SELECT * INTO STRICT v_custody FROM app.date_custody WHERE id = OLD.custody_id;
      PERFORM app.luxchange_request_cession_ref(NEW.released_by_operation, v_custody);
      IF NEW.release_reason IS DISTINCT FROM 'ceded' OR OLD.channel <> 'own_use' OR OLD.stake_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM app.booking_state_transition x
                         WHERE x.operation_id = NEW.released_by_operation AND x.booking_id = OLD.booking_id
                           AND x.kind = 'cession') THEN
        RAISE EXCEPTION 'only the occupancy of the ceded Co-Owner booking is released'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_booking';
      END IF;
    ELSIF v_command = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só libera com `ceded` a reserva Co-Owner que ela cedeu.
      PERFORM app.luxchange_deposit_release(NEW.released_by_operation, OLD, NEW.release_reason);
    ELSE
      IF OLD.channel <> 'own_use' THEN
        PERFORM app.assert_inventory_transition_enabled();
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.released_by_operation, OLD.booking_id, OLD.stay_date);
      IF NEW.release_reason IS DISTINCT FROM app.booking_release_reason(t.kind) THEN
        RAISE EXCEPTION 'the release reason is the reason of the event of the operation'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_release_reason';
      END IF;
    END IF;
    IF NEW.released_at IS NOT NULL THEN
      NEW.released_at := clock_timestamp();
    END IF;
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.booking_id, NEW.channel, NEW.custody_id, NEW.stake_id,
      NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.booking_id, OLD.channel, OLD.custody_id, OLD.stake_id,
      OLD.opened_by_operation)
     OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'only the release of an active occupancy is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.released_by_operation);
  IF NEW.release_reason = 'ceded' AND NOT EXISTS (
       SELECT 1 FROM app.date_custody c
        WHERE c.id = OLD.custody_id AND c.holder_kind = 'use_right' AND c.basis = 'reserved_right'
          AND c.stake_id = OLD.stake_id) THEN
    RAISE EXCEPTION 'ceded only releases Co-Owner own use over a reserved right of the same stake'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_ceded_reserved_right';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_parent app.date_custody;
  v_grand app.date_custody;
  v_modality text;
  v_found boolean;
  b app.booking;
  t app.booking_state_transition;
  a app.booking_authorization;
BEGIN
  IF NEW.closed_at IS NOT NULL OR NEW.closed_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'a custody opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_opens_active';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  IF NEW.parent_custody_id IS NULL THEN
    -- TECH-021: raiz autorizada pelos fatos (formalização + noite selada), nunca por decisão: a primeira custódia da
    -- noite, owner no Owner e spe_pool no Co-Owner, aberta pelo command de sistema que sela.
    IF EXISTS (SELECT 1 FROM app.date_custody
                WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date) THEN
      RAISE EXCEPTION 'only the first custody of a sealed night is a root'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_first';
    END IF;
    SELECT modality INTO v_modality FROM app.acquisition WHERE second_home_id = NEW.second_home_id;
    IF NOT FOUND OR NEW.holder_kind <> (CASE v_modality WHEN 'owner' THEN 'owner' ELSE 'spe_pool' END) THEN
      RAISE EXCEPTION 'the root custody follows the acquisition modality'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_modality';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.opened_by_operation AND command = 'open_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only open_exercise opens a root custody'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'inventory_operation_provenance';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_parent FROM app.date_custody WHERE id = NEW.parent_custody_id;
  v_found := FOUND;
  IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.opened_by_operation) = 'accept_request' THEN
    IF NEW.holder_kind IS DISTINCT FROM 'luxtory' OR NEW.purpose IS DISTINCT FROM 'inventory'
       OR NEW.inventory_origin IS DISTINCT FROM 'luxchange_cession'
       OR NEW.authorization_ref IS DISTINCT FROM app.luxchange_request_cession_ref(NEW.opened_by_operation, v_parent) THEN
      RAISE EXCEPTION 'acceptance opens only the linked Luxchange cession successor'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_cession_successor';
    END IF;
  ELSIF NOT app.acts_as_schema_owner() THEN
    IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.opened_by_operation) = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só abre `luxtory/inventory/luxchange_cession` com a referência dela.
      PERFORM app.luxchange_deposit_open(NEW);
    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'
       AND NEW.basis IS NOT DISTINCT FROM 'reserved_right' THEN
      -- W12: `use_right/reserved_right` sobre `spe_pool`, para a Ação da reserva da mesma operação.
      b := app.assert_own_use_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
      IF b.stake_id IS DISTINCT FROM NEW.stake_id THEN
        RAISE EXCEPTION 'a reserved right belongs to the stake of the booking'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'use_right' AND v_parent.basis = 'reserved_right' THEN
      -- W13: cancelamento, no-show, cancelamento P-A ou invalidação da reserva que abriu a `reserved_right`.
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = v_parent.opened_by_operation;
      IF NOT FOUND OR b.stake_id IS DISTINCT FROM v_parent.stake_id THEN
        RAISE EXCEPTION 'a reserved right moves only with the booking that opened it'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.opened_by_operation, b.id, NEW.stay_date);
      IF NEW.holder_kind IS DISTINCT FROM (CASE app.own_use_reserved_right_successor(t)
                                             WHEN 'spe_pool' THEN 'spe_pool' ELSE 'use_right' END)
         OR NEW.basis IS DISTINCT FROM (CASE app.own_use_reserved_right_successor(t)
                                          WHEN 'spe_pool' THEN NULL ELSE 'forfeited_right' END) THEN
        RAISE EXCEPTION 'the successor of a reserved right follows the event of the operation'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_lifecycle_successor';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'use_right' AND v_parent.basis = 'forfeited_right' THEN
      -- W13 (BR-283): recuperação autorizada da capacidade futura perdida; `authorization_ref` aponta a autorização.
      SELECT * INTO a FROM app.own_use_recovery_write(NEW.opened_by_operation, v_parent.id);
      IF NEW.authorization_ref IS DISTINCT FROM 'booking_authorization:' || a.id::text THEN
        RAISE EXCEPTION 'recovered capacity carries the reference of its independent authorization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_recovery_authorization';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'luxtory' THEN
      -- W14 (TECH-022, REQ-036): seleção Luxtory da operação `select_luxtory_capacity`, com a K3, na janela e dentro da
      -- capacidade da categoria, com a base registrada; finalidade e origem seguem a tabela fechada abaixo.
      PERFORM app.assert_luxtory_selection_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
      IF NEW.authorization_ref IS NULL OR length(btrim(NEW.authorization_ref)) NOT BETWEEN 1 AND 255 THEN
        RAISE EXCEPTION 'a Luxtory selection carries its registered basis'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'luxtory_selection_basis';
      END IF;
      PERFORM app.assert_luxtory_capacity_available(NEW.second_home_id, NEW.stay_date);
    ELSE
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
  END IF;
  -- Transição atômica: a mãe (mesma noite, pela FK composta) foi fechada pela operação que abre a filha.
  IF NOT v_found OR v_parent.closed_by_operation IS DISTINCT FROM NEW.opened_by_operation THEN
    RAISE EXCEPTION 'a successor custody is opened by the operation that closed its parent'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_atomic';
  END IF;
  IF v_parent.parent_custody_id IS NOT NULL THEN
    SELECT * INTO v_grand FROM app.date_custody WHERE id = v_parent.parent_custody_id;
  END IF;
  IF NOT app.custody_transition_valid(v_parent, NEW, v_grand) THEN
    RAISE EXCEPTION 'custody transition outside the closed TECH-022 table'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_closed_table';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE b app.booking; t app.booking_state_transition; a app.booking_authorization; v_command text;
BEGIN
  SELECT command INTO v_command FROM app.operation WHERE id = NEW.closed_by_operation;
  IF v_command = 'accept_request' OR NOT app.acts_as_schema_owner() THEN
    IF v_command = 'accept_request' THEN
      PERFORM app.luxchange_request_cession_ref(NEW.closed_by_operation, OLD);
    ELSIF v_command = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só fecha `owner` livre da holding vigente ou `reserved_right` da
      -- reserva que ela cedeu.
      PERFORM app.luxchange_deposit_close(NEW.closed_by_operation, OLD);
    ELSIF OLD.holder_kind = 'spe_pool'
       AND (SELECT o.command FROM app.operation o WHERE o.id = NEW.closed_by_operation) = 'select_luxtory_capacity' THEN
      -- W14: a seleção Luxtory fecha `spe_pool`; a abertura da sucessora confere finalidade, base e capacidade.
      PERFORM app.assert_luxtory_selection_write(NEW.closed_by_operation, OLD.second_home_id, OLD.stay_date);
    ELSIF OLD.holder_kind = 'spe_pool' THEN
      b := app.assert_own_use_write(NEW.closed_by_operation, OLD.second_home_id, OLD.stay_date);
      IF b.stake_id IS NULL THEN
        RAISE EXCEPTION 'an Owner booking never closes a custody'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
      END IF;
    ELSIF OLD.holder_kind = 'use_right' AND OLD.basis = 'reserved_right' THEN
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = OLD.opened_by_operation;
      IF NOT FOUND OR b.stake_id IS DISTINCT FROM OLD.stake_id THEN
        RAISE EXCEPTION 'a reserved right moves only with the booking that opened it'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.closed_by_operation, b.id, OLD.stay_date);
    ELSIF OLD.holder_kind = 'use_right' AND OLD.basis = 'forfeited_right' THEN
      SELECT * INTO a FROM app.own_use_recovery_write(NEW.closed_by_operation, OLD.id);
    ELSE
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    -- ADR-0024 §3: o instante do fechamento é carimbado pelo banco; o valor enviado nunca prevalece.
    IF NEW.closed_at IS NOT NULL THEN
      NEW.closed_at := clock_timestamp();
    END IF;
  END IF;
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a closed custody never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_closed_once';
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.holder_kind, NEW.stake_id, NEW.basis, NEW.purpose,
      NEW.inventory_origin, NEW.authorization_ref, NEW.parent_custody_id, NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.holder_kind, OLD.stake_id, OLD.basis, OLD.purpose,
      OLD.inventory_origin, OLD.authorization_ref, OLD.parent_custody_id, OLD.opened_by_operation)
     OR NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'only the closing of an active custody is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.closed_by_operation);
  RETURN NEW;
END $$;

-- ADR-0037 §14.2 (Q2), TECH-023/052: the accepted operation already identifies the destination booking uniquely.
ALTER TABLE app.booking
  ADD COLUMN party_id uuid REFERENCES app.party(id),
  ALTER COLUMN holding_id DROP NOT NULL,
  ADD CONSTRAINT booking_holding_channel CHECK (
    channel = 'luxchange_request' OR (holding_id IS NOT NULL AND party_id IS NULL)),
  ADD CONSTRAINT booking_requester_channel CHECK (
    channel <> 'luxchange_request' OR (holding_id IS NULL AND stake_id IS NULL AND party_id IS NOT NULL));

-- Retain booking_holder_read and the existing column grants. party_id is used internally by the RLS policy.
CREATE POLICY booking_requester_read ON app.booking FOR SELECT TO authenticated USING (
  channel = 'luxchange_request'
  AND EXISTS (SELECT 1 FROM app.party_delegation d
               WHERE d.party_id = booking.party_id AND d.user_id = auth.uid() AND d.state = 'active'
                 AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);

CREATE OR REPLACE FUNCTION app.booking_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  op app.operation;
  h app.holding;
  r app.luxchange_request;
  v_nights integer;
  v_sealed integer;
  v_first_checkin timestamptz;
BEGIN
  IF NEW.channel = 'luxchange_request' THEN
    PERFORM app.assert_luxchange_exchange_active();
    r := app.luxchange_request_accepted_write(NEW.opened_by_operation);
    IF (NEW.second_home_id, NEW.checkin_date, NEW.checkout_date, NEW.party_id)
       IS DISTINCT FROM (r.second_home_id, r.checkin, r.checkout, r.requester_party_id) THEN
      RAISE EXCEPTION 'the destination booking matches the home, stay and requester of the accepted Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_booking_binding';
    END IF;
    IF NEW.state IS DISTINCT FROM 'confirmed' OR NEW.last_transition_id IS NOT NULL
       OR NEW.cancellation_class IS NOT NULL THEN
      RAISE EXCEPTION 'a booking opens confirmed without a lifecycle transition'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_opens_confirmed';
    END IF;
    NEW.confirmed_at := v_at;
    RETURN NEW;
  END IF;
  PERFORM app.assert_own_use_booking_active();
  IF NEW.channel <> 'own_use' THEN
    RAISE EXCEPTION 'only own use bookings are enabled in W12'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'booking_channel_not_enabled';
  END IF;
  IF NEW.state <> 'confirmed' THEN
    RAISE EXCEPTION 'a booking opens confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_opens_confirmed';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.opened_by_operation;
  IF op.command <> 'create_own_use_booking' OR op.role <> 'titular' OR op.acting_party_id IS NULL
     OR op.second_home_id IS DISTINCT FROM NEW.second_home_id THEN
    RAISE EXCEPTION 'only create_own_use_booking opens an own use booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_representation(op.actor_user_id, op.acting_party_id, v_at);
  SELECT * INTO h FROM app.holding WHERE id = NEW.holding_id;
  IF NOT FOUND OR h.party_id <> op.acting_party_id OR h.second_home_id <> NEW.second_home_id
     OR h.valid_from > v_at OR (h.valid_until IS NOT NULL AND h.valid_until <= v_at)
     OR NEW.stake_id IS DISTINCT FROM h.stake_id THEN
    RAISE EXCEPTION 'the booking holding is the current holding of the represented party'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  -- TECH-053 classe 4: reservas concorrentes da mesma Ação se serializam no banco (saldo e permanência), mesmo num
  -- caminho que pule a trava da aplicação. Reentrante: o command já a tomou.
  IF h.role = 'co_owner' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('app.stake:' || h.stake_id::text, 0));
  END IF;
  v_nights := NEW.checkout_date - NEW.checkin_date;
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'a booking has at least one night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_minimum_one_night';
  END IF;
  -- BR-111, TECH-045: no máximo 14 noites consecutivas no uso próprio do Co-Owner; o Owner não tem esse limite (REQ-035).
  IF h.role = 'co_owner' AND v_nights > 14 THEN
    RAISE EXCEPTION 'a Co-Owner stay never exceeds 14 consecutive nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_length_maximum';
  END IF;
  SELECT count(*), max(d.checkin_at) FILTER (WHERE d.stay_date = NEW.checkin_date)
    INTO v_sealed, v_first_checkin
    FROM app.second_home_date d
   WHERE d.second_home_id = NEW.second_home_id
     AND d.stay_date >= NEW.checkin_date AND d.stay_date < NEW.checkout_date;
  IF v_sealed <> v_nights THEN
    RAISE EXCEPTION 'every night of an own use booking is sealed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_booking_night_sealed';
  END IF;
  -- TECH-043: noite futura = `now < checkin_at`, aqui no instante da validação.
  IF v_first_checkin <= v_at THEN
    RAISE EXCEPTION 'an own use booking starts at a future night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_booking_night_future';
  END IF;
  -- REQ-034, TECH-042: janela aberta para cada exercício e para o 29/02 das noites (período que cruza exercício ou
  -- categoria é validado noite a noite).
  IF h.role = 'co_owner' AND EXISTS (
       SELECT 1
         FROM (SELECT DISTINCT d.exercise_year, d.is_leap_day
                 FROM app.second_home_date d
                WHERE d.second_home_id = NEW.second_home_id
                  AND d.stay_date >= NEW.checkin_date AND d.stay_date < NEW.checkout_date) n
        WHERE NOT coalesce(
          app.use_window_opens_at(NEW.second_home_id, h.stake_id, n.exercise_year, n.is_leap_day) <= v_at, false)) THEN
    RAISE EXCEPTION 'the use window of the stake is not open'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'window_not_open';
  END IF;
  NEW.confirmed_at := v_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_occupancy_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_custody app.date_custody;
  b app.booking;
  r app.luxchange_request;
  v_app boolean := NOT app.acts_as_schema_owner();
BEGIN
  IF NEW.released_at IS NOT NULL OR NEW.release_reason IS NOT NULL OR NEW.released_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'an occupancy opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_opens_active';
  END IF;
  IF NEW.channel = 'luxchange_request' THEN
    r := app.luxchange_request_accepted_write(NEW.opened_by_operation);
    SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id;
    IF NOT FOUND OR b.channel <> 'luxchange_request' OR b.state <> 'confirmed'
       OR b.opened_by_operation <> NEW.opened_by_operation OR b.second_home_id <> NEW.second_home_id
       OR NEW.stay_date < b.checkin_date OR NEW.stay_date >= b.checkout_date THEN
      RAISE EXCEPTION 'each destination occupancy belongs to the booking of this acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_occupancy_binding';
    END IF;
  ELSIF v_app THEN
    -- W12: a aplicação só grava a ocupação `own_use` da reserva da mesma operação, da mesma Ação e dentro do período.
    IF NEW.channel <> 'own_use' THEN
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    b := app.assert_own_use_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
    IF b.id <> NEW.booking_id OR b.stake_id IS DISTINCT FROM NEW.stake_id THEN
      RAISE EXCEPTION 'an own use occupancy belongs to the booking of the same operation and stake'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_occupancy_binding';
    END IF;
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  -- TECH-053: o command já travou a noite (classe 5); aqui só a custódia (classe 6), contra o fechamento concorrente.
  SELECT * INTO v_custody FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR v_custody.closed_at IS NOT NULL
     OR v_custody.second_home_id <> NEW.second_home_id OR v_custody.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'an occupancy references the active custody of the same night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_active';
  END IF;
  -- D4 (ADR-0026): `reserved_right` devolvido — aberto por outra operação — só recebe nova ocupação na wave que produzir
  -- validamente esse estado (W21/W22), com o teste da TECH-023.
  IF v_app AND v_custody.holder_kind = 'use_right'
     AND v_custody.opened_by_operation <> NEW.opened_by_operation THEN
    RAISE EXCEPTION 'own use over a returned reserved right is not enabled before its wave'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_reserved_right_reuse';
  END IF;
  IF NEW.channel = 'luxchange_request'
     AND (v_custody.authorization_ref IS DISTINCT FROM 'request_destination:' || r.id
       OR NOT EXISTS (SELECT 1 FROM app.luxchange_request_night n WHERE n.request_id = r.id
                       AND n.second_home_id = NEW.second_home_id AND n.stay_date = NEW.stay_date
                       AND n.custody_id = v_custody.parent_custody_id)) THEN
    RAISE EXCEPTION 'a destination occupancy uses the successor of the requested custody'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_occupancy_custody';
  END IF;
  IF NOT app.occupancy_pair_valid(NEW, v_custody) THEN
    RAISE EXCEPTION 'occupancy and custody pair outside the TECH-023 matrix'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_matrix';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.assert_luxchange_request_destination_complete(p_booking uuid, p_at_acceptance boolean)
  RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE b app.booking; r app.luxchange_request; v_nights integer;
BEGIN
  SELECT * INTO STRICT b FROM app.booking WHERE id = p_booking;
  v_nights := b.checkout_date - b.checkin_date;
  -- At the deferred check the operation may already have been marked committed.
  SELECT q.* INTO r FROM app.luxchange_request_transition t
    JOIN app.luxchange_request q ON q.id = t.request_id AND q.last_transition_id = t.id
   WHERE t.operation_id = b.opened_by_operation AND t.to_state = 'accepted' AND q.state = 'accepted';
  IF NOT FOUND OR (b.second_home_id, b.checkin_date, b.checkout_date, b.party_id)
     IS DISTINCT FROM (r.second_home_id, r.checkin, r.checkout, r.requester_party_id) THEN
    RAISE EXCEPTION 'the destination booking belongs to its accepted Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_booking_binding';
  END IF;
  IF (SELECT count(*) FROM app.date_occupancy o WHERE o.booking_id = b.id) <> v_nights
     OR (SELECT count(*) FROM app.date_occupancy o
          JOIN app.date_custody c ON c.id = o.custody_id
          JOIN app.luxchange_request_night n ON n.request_id = r.id AND n.custody_id = c.parent_custody_id
           AND n.second_home_id = o.second_home_id AND n.stay_date = o.stay_date
         WHERE o.booking_id = b.id AND o.channel = b.channel AND o.opened_by_operation = b.opened_by_operation
           AND (NOT p_at_acceptance OR (o.released_at IS NULL AND c.closed_at IS NULL))
           AND app.occupancy_pair_valid(o, c)
           AND c.authorization_ref = 'request_destination:' || r.id) <> v_nights THEN
    RAISE EXCEPTION 'the destination booking has exactly one occupancy of its ceded custody per requested night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_occupancy_complete';
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.assert_luxchange_request_destination_complete(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_luxchange_request_destination_complete(uuid, boolean) TO luxtory_app;

CREATE OR REPLACE FUNCTION app.assert_booking_complete(p_booking uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE b app.booking; v_nights integer; v_longest integer;
BEGIN
  SELECT * INTO STRICT b FROM app.booking WHERE id = p_booking;
  v_nights := b.checkout_date - b.checkin_date;
  IF b.channel = 'luxchange_request' THEN
    PERFORM app.assert_luxchange_request_destination_complete(b.id, true);
    RETURN;
  END IF;
  IF (SELECT count(*) FROM app.date_occupancy o
       WHERE o.booking_id = b.id AND o.channel = 'own_use' AND o.opened_by_operation = b.opened_by_operation
         AND o.stay_date >= b.checkin_date AND o.stay_date < b.checkout_date) <> v_nights
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.booking_id = b.id
                   AND (o.channel <> 'own_use' OR o.opened_by_operation <> b.opened_by_operation
                        OR o.stay_date < b.checkin_date OR o.stay_date >= b.checkout_date)) THEN
    RAISE EXCEPTION 'every night of a booking has exactly one occupancy of it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_occupancy_complete';
  END IF;
  IF b.stake_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = b.opened_by_operation)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = b.opened_by_operation)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.closed_by_operation = b.opened_by_operation) THEN
      RAISE EXCEPTION 'an Owner booking moves neither custody nor use right'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_owner_effects';
    END IF;
    RETURN;
  END IF;
  IF (SELECT count(*) FROM app.use_right_ledger l WHERE l.operation_id = b.opened_by_operation) <> v_nights
     OR (SELECT count(*) FROM app.use_right_ledger l
          WHERE l.operation_id = b.opened_by_operation AND l.movement = 'consume' AND l.stake_id = b.stake_id
            AND l.stay_date >= b.checkin_date AND l.stay_date < b.checkout_date) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = b.opened_by_operation) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c
          WHERE c.opened_by_operation = b.opened_by_operation AND c.holder_kind = 'use_right'
            AND c.basis = 'reserved_right' AND c.stake_id = b.stake_id
            AND c.stay_date >= b.checkin_date AND c.stay_date < b.checkout_date) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = b.opened_by_operation) <> v_nights THEN
    RAISE EXCEPTION 'every night of a Co-Owner booking has its reserved right and one consumption'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_consumption_complete';
  END IF;
  WITH n AS (
    SELECT o.stay_date FROM app.date_occupancy o
     WHERE o.second_home_id = b.second_home_id AND o.stake_id = b.stake_id AND o.channel = 'own_use'
       AND o.released_at IS NULL
       AND o.stay_date >= b.checkin_date - 15 AND o.stay_date < b.checkout_date + 15
  ), g AS (
    SELECT n.stay_date, n.stay_date - (row_number() OVER (ORDER BY n.stay_date))::integer AS island FROM n
  )
  SELECT max(s.nights) INTO v_longest
    FROM (SELECT count(*) AS nights FROM g GROUP BY g.island
           HAVING bool_or(g.stay_date >= b.checkin_date AND g.stay_date < b.checkout_date)) s;
  -- BR-111, TECH-045.
  IF v_longest > 14 THEN
    RAISE EXCEPTION 'consecutive or adjacent Co-Owner bookings form one stay of at most 14 nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_length_maximum';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.booking_state_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.booking_state_transition;
BEGIN
  IF (NEW.id, NEW.second_home_id, NEW.channel, NEW.holding_id, NEW.party_id, NEW.stake_id, NEW.checkin_date, NEW.checkout_date,
      NEW.opened_by_operation, NEW.confirmed_at)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.channel, OLD.holding_id, OLD.party_id, OLD.stake_id, OLD.checkin_date, OLD.checkout_date,
      OLD.opened_by_operation, OLD.confirmed_at) THEN
    RAISE EXCEPTION 'only the projected state of a booking changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_history_immutable';
  END IF;
  SELECT * INTO t FROM app.booking_state_transition WHERE id = NEW.last_transition_id;
  IF NOT FOUND OR t.booking_id <> NEW.id OR t.previous_transition_id IS DISTINCT FROM OLD.last_transition_id
     OR t.from_state <> OLD.state OR t.to_state <> NEW.state
     OR (OLD.cancellation_class IS NOT NULL AND t.cancellation_class IS NOT NULL)
     OR NEW.cancellation_class IS DISTINCT FROM coalesce(OLD.cancellation_class, t.cancellation_class) THEN
    RAISE EXCEPTION 'the booking state follows its last transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_projection';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_complement_occupancy_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF app.acts_as_schema_owner() OR NEW.channel NOT IN ('own_use', 'luxchange_request') THEN
    RETURN NEW;
  END IF;
  PERFORM app.lock_night(NEW.second_home_id, NEW.stay_date, true);
  IF app.luxchange_complement_effective(NEW.second_home_id, NEW.stay_date) IS NOT NULL THEN
    RAISE EXCEPTION 'the night is committed to a pending Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_committed_to_request';
  END IF;
  RETURN NEW;
END $$;

-- The same calculation serves the write and the audit. The holder is paid for the capacity ceded (BR-201);
-- the requester receives only the Credits of the committed complement (PD-012).
CREATE FUNCTION app.luxchange_request_lot_quantity_matches(p_request uuid, p_party uuid, p_quantity numeric)
  RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(CASE p_party
    WHEN r.holder_party_id THEN app.luxchange_deposit_quantity_matches(r.operation_id, p_quantity)
    WHEN r.requester_party_id THEN r.complement_credits > 0 AND p_quantity = r.complement_credits AND p_quantity * 100 = (
      SELECT sum(p.amount_minor)::numeric
        FROM app.luxchange_request_complement_night n
        JOIN app.prl p ON p.id = n.prl_id
       WHERE n.request_id = r.id
    ) * app.luxchange_snapshot_parameter(r.operation_id, 'credit_multiplier')::numeric
    ELSE false
  END, false)
  FROM app.luxchange_request r
  WHERE r.id = p_request
$$;

REVOKE ALL ON FUNCTION app.luxchange_request_lot_quantity_matches(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.luxchange_request_lot_quantity_matches(uuid, uuid, numeric) TO luxtory_app;

CREATE OR REPLACE FUNCTION app.credit_lot_originate() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  r app.luxchange_request;
  v_terms_operation uuid;
  v_resolved_at timestamptz;
  v_months text;
BEGIN
  PERFORM app.assert_credits_active();
  PERFORM app.assert_operation_in_transaction(NEW.origin_operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.origin_operation_id;
  v_terms_operation := op.id;
  IF op.command = 'accept_request' THEN
    PERFORM app.assert_luxchange_exchange_active();
    r := app.luxchange_request_accepted_write(op.id);
    IF NEW.party_id IS DISTINCT FROM r.holder_party_id
       AND (NEW.party_id IS DISTINCT FROM r.requester_party_id OR r.complement_credits <= 0) THEN
      RAISE EXCEPTION 'only the holder and a requester with a ceded complement originate Credits at acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_origin';
    END IF;
    IF app.luxchange_request_lot_quantity_matches(r.id, NEW.party_id, NEW.quantity) IS NOT TRUE THEN
      RAISE EXCEPTION 'acceptance originates the exact Credits bound to the Request at send'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_lot_quantity';
    END IF;
    PERFORM app.assert_luxchange_request_cession_complete(r.id, op.id);
    v_terms_operation := r.operation_id;
  ELSE
    IF op.command <> 'deposit_capacity' OR op.acting_party_id IS DISTINCT FROM NEW.party_id
       OR op.actor_user_id IS NULL THEN
      RAISE EXCEPTION 'credits originate only from a deposit or an accepted Request, to the party that acts'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_origin';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, NEW.party_id, clock_timestamp());
  END IF;
  SELECT s.resolved_at, p.value INTO v_resolved_at, v_months
    FROM app.economic_snapshot s
    JOIN app.economic_snapshot_parameter sp
      ON sp.operation_id = v_terms_operation AND sp.parameter_key = 'credit_validity_months'
    JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE s.operation_id = NEW.origin_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the origination records the credit validity in the snapshot of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_snapshot_missing';
  END IF;
  IF op.command = 'deposit_capacity' AND NOT app.luxchange_deposit_quantity_matches(op.id, NEW.quantity) THEN
    -- W20 (ADR-0036 §5; BR-201, `01` §20): Créditos = Σ PRL das noites do snapshot × multiplicador do snapshot.
    RAISE EXCEPTION 'deposit credits are the PRL of the snapshot nights times the snapshot multiplier'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_deposit_quantity';
  END IF;
  NEW.originated_at := v_resolved_at;
  NEW.expires_at := app.credit_expires_at(v_resolved_at, v_months::integer);
  NEW.held := 0;
  NEW.consumed := 0;
  NEW.expired := 0;
  NEW.origin_command := op.command;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.credit_invariant_breaches()
  RETURNS TABLE (invariant text, lot_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  WITH origin AS (
    SELECT l.id, l.party_id, l.quantity, l.originated_at, l.expires_at, l.origin_operation_id, l.origin_command,
           o.command, o.acting_party_id, r.id AS accepted_request_id,
           CASE WHEN o.command = 'accept_request' THEN r.operation_id ELSE o.id END AS validity_operation_id
      FROM app.credit_lot l JOIN app.operation o ON o.id = l.origin_operation_id
      LEFT JOIN app.luxchange_request_transition t ON o.command = 'accept_request'
        AND t.operation_id = o.id AND t.to_state = 'accepted'
      LEFT JOIN app.luxchange_request r ON r.id = t.request_id AND r.last_transition_id = t.id
        AND r.state = 'accepted' AND r.closed_by_operation = o.id AND r.holder_party_id = o.acting_party_id
  )
  -- Exatamente uma originação, com a quantidade e a operação do lote.
  SELECT 'INV-6/origination', l.id, count(e.id)::text
    FROM app.credit_lot l
    LEFT JOIN app.credit_entry e ON e.lot_id = l.id AND e.movement = 'originate'
   GROUP BY l.id, l.quantity, l.origin_operation_id
  HAVING count(e.id) <> 1 OR bool_or(e.quantity <> l.quantity OR e.operation_id <> l.origin_operation_id)
  UNION ALL
  -- Buckets iguais à soma do ledger.
  SELECT 'INV-6/buckets', l.id, concat_ws('/', l.held, l.consumed, l.expired)
    FROM app.credit_lot l
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(CASE WHEN e.to_bucket = 'held' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'held' THEN e.quantity END), 0) AS held,
             coalesce(sum(CASE WHEN e.to_bucket = 'consumed' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'consumed' THEN e.quantity END), 0) AS consumed,
             coalesce(sum(CASE WHEN e.to_bucket = 'expired' THEN e.quantity END), 0) AS expired
        FROM app.credit_entry e WHERE e.lot_id = l.id
    ) s ON true
   WHERE (l.held, l.consumed, l.expired) IS DISTINCT FROM (s.held, s.consumed, s.expired)
  UNION ALL
  -- Nenhum movimento-filho acima do pai.
  SELECT 'INV-6/parent', p.lot_id, p.id::text
    FROM app.credit_entry p
    JOIN app.credit_entry c ON c.parent_entry_id = p.id
   GROUP BY p.id, p.lot_id, p.quantity
  HAVING sum(c.quantity) > p.quantity
  UNION ALL
  -- Deposit still belongs to the acting party. An acceptance must identify its origin through the accepted Request.
  SELECT 'INV-6/origin', l.id, l.command
    FROM origin l
   WHERE l.command NOT IN ('deposit_capacity', 'accept_request') OR l.command <> l.origin_command
      OR (l.command = 'deposit_capacity' AND l.acting_party_id IS DISTINCT FROM l.party_id)
      OR (l.command = 'accept_request' AND (l.accepted_request_id IS NULL
           OR app.luxchange_request_lot_quantity_matches(l.accepted_request_id, l.party_id, l.quantity) IS NOT TRUE))
  UNION ALL
  -- TECH-044: the operation fixes origination; the send snapshot fixes the duration of an accepted Request's lots.
  SELECT 'TECH-044/validity', l.id, l.expires_at::text
    FROM origin l
    LEFT JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
    LEFT JOIN app.economic_snapshot_parameter sp
      ON sp.operation_id = l.validity_operation_id AND sp.parameter_key = 'credit_validity_months'
    LEFT JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE p.id IS NULL OR l.originated_at IS DISTINCT FROM s.resolved_at
      OR l.expires_at IS DISTINCT FROM app.credit_expires_at(s.resolved_at, p.value::integer)
$$;

-- ADR-0037 §8: the Fee becomes definitive only in the operation that accepts its Request.
CREATE OR REPLACE FUNCTION app.settlement_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  f app.fee_charge;
  fee_op text;
  r app.luxchange_request;
  p app.payment;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  NEW.created_at := clock_timestamp();
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF app.acts_as_schema_owner() AND (op.command <> 'accept_request' OR NEW.kind IS DISTINCT FROM 'luxchange_fee') THEN
    RETURN NEW;
  END IF;
  IF NEW.kind <> 'luxchange_fee' THEN
    RAISE EXCEPTION 'settlement category % is not enabled', NEW.kind
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'settlement_kind_not_enabled';
  END IF;
  SELECT * INTO STRICT f FROM app.fee_charge WHERE id = NEW.fee_charge_id;
  IF op.command = 'accept_request' THEN
    r := app.luxchange_request_accepted_write(op.id);
    SELECT o.command INTO fee_op FROM app.operation o WHERE o.id = f.operation_id;
    IF f.operation_id IS DISTINCT FROM r.operation_id OR f.payer_party_id IS DISTINCT FROM r.requester_party_id
       OR fee_op IS DISTINCT FROM 'send_request' THEN
      RAISE EXCEPTION 'acceptance settles only the Fee from the send of its accepted Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_origin';
    END IF;
  ELSIF op.command <> 'create_direct' OR f.operation_id <> NEW.operation_id THEN
    RAISE EXCEPTION 'the Fee is settled when its Request is accepted or its Direct confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_origin';
  END IF;
  -- Reuse the payment lock shared with reversal before checking its state and outcomes.
  SELECT * INTO p FROM app.payment WHERE id = f.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.fee_charge_reversal rev WHERE rev.fee_charge_id = f.id) THEN
    RAISE EXCEPTION 'a reversed Fee is not settled'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_reversed';
  END IF;
  IF op.command = 'accept_request' AND (p.state IS DISTINCT FROM 'approved'
      OR p.purpose IS DISTINCT FROM 'luxchange_fee'
      OR (p.payer_party_id, p.amount_minor, p.currency) IS DISTINCT FROM (f.payer_party_id, f.amount_minor, f.currency)) THEN
    RAISE EXCEPTION 'acceptance settles a Fee only against its matching approved payment'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_payment';
  END IF;
  IF NEW.amount_minor <> f.amount_minor OR NEW.currency <> f.currency THEN
    RAISE EXCEPTION 'the Fee is settled for its charged amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_fee_amount';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.refund_advance() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- ADR-0037 §8: record the obligation now; resolve it in a later transaction.
  IF (NEW.state, NEW.provider_refund_id) IS DISTINCT FROM (OLD.state, OLD.provider_refund_id)
     AND EXISTS (SELECT 1 FROM app.operation o WHERE o.id = OLD.operation_id AND o.command = 'accept_request')
     AND app.economic_snapshot_in_current_transaction(OLD.operation_id) THEN
    RAISE EXCEPTION 'an acceptance refund stays pending until after the acceptance transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_accept_pending';
  END IF;
  IF (NEW.id, NEW.payment_id, NEW.operation_id, NEW.amount_minor, NEW.currency, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.payment_id, OLD.operation_id, OLD.amount_minor, OLD.currency, OLD.created_at) THEN
    RAISE EXCEPTION 'a refund keeps its payment, operation and amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_immutable';
  END IF;
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'refund states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.luxchange_request_pending_conflicts(p_request uuid) RETURNS TABLE (request_id uuid)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT q.id FROM app.luxchange_request_cession_nights(p_request) d
  CROSS JOIN LATERAL (
    SELECT n.request_id FROM app.luxchange_request_night n
     WHERE n.second_home_id = d.second_home_id AND n.stay_date = d.stay_date
    UNION ALL
    SELECT n.request_id FROM app.luxchange_request_complement_night n
     WHERE n.second_home_id = d.second_home_id AND n.stay_date = d.stay_date AND n.state = 'active'
  ) affected
  JOIN app.luxchange_request q ON q.id = affected.request_id AND q.state = 'pending'
  WHERE q.id <> p_request
$$;

-- Call in a separate READ COMMITTED statement after locking every affected night (TECH-053 class 5).
-- The supplied ids are the set already locked in class 1. Never acquire Request row locks here.
CREATE FUNCTION app.luxchange_request_accept_rescan(p_request uuid, p_locked_requests uuid[]) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.luxchange_request_pending_conflicts(p_request) c
     WHERE NOT EXISTS (SELECT 1 FROM unnest(p_locked_requests) k(id) WHERE k.id = c.request_id)
  ) THEN
    RAISE EXCEPTION 'a pending competing Request was found after locking the nights'
      USING ERRCODE = 'serialization_failure';
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.luxchange_request_pending_conflicts(uuid),
  app.luxchange_request_accept_rescan(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.luxchange_request_pending_conflicts(uuid),
  app.luxchange_request_accept_rescan(uuid, uuid[]) TO luxtory_app;

-- ADR-0037 §8 and §14: prove completeness without acquiring new locks or re-running authorization.
CREATE FUNCTION app.assert_luxchange_request_accept_complete(
  p_operation uuid, p_at_acceptance boolean DEFAULT true
) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r app.luxchange_request;
  v_booking uuid;
  v_resolved_at timestamptz;
  v_expires_at timestamptz;
  v_competitor uuid;
BEGIN
  -- The partial unique index and conflict_luxchange_request_closed make this the sole winning transition.
  SELECT q.* INTO r
    FROM app.luxchange_request_transition t
    JOIN app.luxchange_request q ON q.id = t.request_id AND q.last_transition_id = t.id
    JOIN app.operation op ON op.id = t.operation_id
   WHERE t.operation_id = p_operation AND t.to_state = 'accepted' AND q.state = 'accepted'
     AND q.closed_by_operation = p_operation AND q.closed_at = t.created_at
     AND op.command = 'accept_request' AND op.acting_party_id = q.holder_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance requires its projected winning transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;

  PERFORM app.assert_luxchange_request_cession_complete(r.id, p_operation, p_at_acceptance);
  SELECT id INTO v_booking FROM app.booking
   WHERE opened_by_operation = p_operation AND channel = 'luxchange_request'
     AND (NOT p_at_acceptance OR state = 'confirmed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance requires the destination booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;
  PERFORM app.assert_luxchange_request_destination_complete(v_booking, p_at_acceptance);

  SELECT s.resolved_at, app.credit_expires_at(s.resolved_at,
      app.luxchange_snapshot_parameter(r.operation_id, 'credit_validity_months')::integer)
    INTO v_resolved_at, v_expires_at
    FROM app.economic_snapshot s WHERE s.operation_id = p_operation;
  IF v_resolved_at IS NULL OR v_expires_at IS NULL
     OR (SELECT count(*) FROM app.credit_lot l WHERE l.origin_operation_id = p_operation)
          <> (CASE WHEN r.complement_credits > 0 THEN 2 ELSE 1 END)
     OR NOT EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = p_operation
                      AND l.party_id = r.holder_party_id AND (NOT p_at_acceptance OR l.available = l.quantity))
     OR EXISTS (
       SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = p_operation
         AND ((l.origin_command, l.originated_at, l.expires_at)
                IS DISTINCT FROM ('accept_request', v_resolved_at, v_expires_at)
           OR app.luxchange_request_lot_quantity_matches(r.id, l.party_id, l.quantity) IS NOT TRUE)) THEN
    RAISE EXCEPTION 'acceptance originates exactly the lots and validity bound to the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;

  -- A balance alone would not prove a debit of the original Guarantee or complement (INV-6).
  IF (SELECT coalesce(sum(h.quantity), 0) FROM app.credit_entry h
       WHERE h.operation_id = r.operation_id AND h.movement = 'hold') <> r.guarantee_credits
     OR EXISTS (
       SELECT 1 FROM app.credit_entry h WHERE h.operation_id = r.operation_id AND h.movement = 'hold'
         AND NOT EXISTS (SELECT 1 FROM app.credit_entry e
                           WHERE e.parent_entry_id = h.id AND e.operation_id = p_operation
                             AND e.lot_id = h.lot_id AND e.quantity = h.quantity AND e.movement = 'consume')) THEN
    RAISE EXCEPTION 'acceptance consumes every original Guarantee hold in full'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;
  IF r.complement_credits > 0 AND NOT EXISTS (
    SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = p_operation AND l.party_id = r.requester_party_id
      AND (NOT p_at_acceptance OR (l.consumed = r.complement_consumption AND l.available = r.complement_excess))
      AND (SELECT count(*) = CASE WHEN r.complement_consumption > 0 THEN 1 ELSE 0 END
                  AND coalesce(sum(e.quantity), 0) = r.complement_consumption
             FROM app.credit_entry e
            WHERE e.lot_id = l.id AND e.operation_id = p_operation
              AND e.movement = 'consume' AND e.from_bucket = 'available')) THEN
    RAISE EXCEPTION 'acceptance consumes exactly the bound complement amount and preserves its excess'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;

  -- The W19 writer validates the approved payment and forbids an unrelated Fee or another settlement category.
  IF NOT EXISTS (
    SELECT 1 FROM app.fee_charge f JOIN app.settlement s ON s.fee_charge_id = f.id
     WHERE f.operation_id = r.operation_id AND s.operation_id = p_operation AND s.kind = 'luxchange_fee'
       AND (s.amount_minor, s.currency) = (f.amount_minor, f.currency)
       AND NOT EXISTS (SELECT 1 FROM app.fee_charge_reversal v WHERE v.fee_charge_id = f.id)) THEN
    RAISE EXCEPTION 'acceptance settles the winning Fee in full without reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;

  -- The transition writer proved the overlap and the cause. Reuse W21 to prove each closing's economic effects.
  FOR v_competitor IN
    SELECT t.id FROM app.luxchange_request_transition t
     WHERE t.operation_id = p_operation AND t.to_state <> 'accepted'
  LOOP
    PERFORM app.assert_luxchange_request_closing_complete(v_competitor);
  END LOOP;
  -- Only the commit-time proof checks current conflicts. Historical auditing uses the recorded outcomes.
  IF p_at_acceptance AND EXISTS (SELECT 1 FROM app.luxchange_request_pending_conflicts(r.id)) THEN
    RAISE EXCEPTION 'acceptance leaves no pending Request on its ceded nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_accept_complete';
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.assert_luxchange_request_accept_complete(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_luxchange_request_accept_complete(uuid, boolean) TO luxtory_app;

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.to_state = 'accepted' THEN
    PERFORM app.assert_luxchange_request_accept_complete(NEW.operation_id, true);
  ELSE
    PERFORM app.assert_luxchange_request_closing_complete(NEW.id);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_invariant_breaches()
  RETURNS TABLE (invariant text, operation_id uuid, detail text)
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_operation uuid; v_request app.luxchange_request;
BEGIN
  FOR v_operation IN
    SELECT o.id FROM app.operation o
     WHERE o.command = 'deposit_capacity'
       AND (EXISTS (SELECT 1 FROM app.economic_snapshot s WHERE s.operation_id = o.id)
            OR EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = o.id)
            OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = o.id OR c.closed_by_operation = o.id)
            OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.operation_id = o.id))
     ORDER BY o.id
  LOOP
    BEGIN
      PERFORM app.assert_luxchange_deposit_complete(v_operation);
      -- Sem snapshot, nenhum fato de depósito existe (toda escrita o exige).
      IF NOT EXISTS (SELECT 1 FROM app.economic_snapshot s WHERE s.operation_id = v_operation) THEN
        RAISE EXCEPTION 'deposit facts without snapshot' USING ERRCODE = 'check_violation';
      END IF;
    EXCEPTION WHEN check_violation THEN
      invariant := 'REQ-060/deposit';
      operation_id := v_operation;
      detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  -- W21: toda Request com o envio completo; encerrada com o encerramento completo; compromisso ativo só de pendente;
  -- Garantia por liberar só de pendente; Garantia de envio sempre com Request.
  FOR v_request IN SELECT * FROM app.luxchange_request ORDER BY id LOOP
    BEGIN
      PERFORM app.assert_luxchange_request_sent_complete(v_request.id);
      IF v_request.state = 'accepted' THEN
        PERFORM app.assert_luxchange_request_accept_complete(v_request.closed_by_operation, false);
      ELSIF v_request.state <> 'pending' THEN
        PERFORM app.assert_luxchange_request_closing_complete(v_request.last_transition_id);
      ELSIF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                     WHERE u.request_id = v_request.id AND u.state <> 'active')
         OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night n
                     WHERE n.request_id = v_request.id AND n.state <> 'active')
         OR EXISTS (SELECT 1 FROM app.credit_entry h JOIN app.credit_entry e ON e.parent_entry_id = h.id
                     WHERE h.operation_id = v_request.operation_id AND h.movement = 'hold') THEN
        RAISE EXCEPTION 'a pending Request keeps its commitments and Guarantee'
          USING ERRCODE = 'check_violation';
      END IF;
    EXCEPTION WHEN check_violation THEN
      invariant := 'PD-012/request';
      operation_id := v_request.operation_id;
      detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  FOR v_operation IN
    SELECT DISTINCT e.operation_id FROM app.credit_entry e
     WHERE e.command = 'send_request' AND e.movement = 'hold'
       AND NOT EXISTS (SELECT 1 FROM app.luxchange_request q WHERE q.operation_id = e.operation_id)
     ORDER BY 1
  LOOP
    invariant := 'TECH-071/hold-without-request';
    operation_id := v_operation;
    detail := 'a send_request hold without its Request';
    RETURN NEXT;
  END LOOP;
END $$;

-- The holder sees only the frozen terms and, after acceptance, the actual expiry of their lot.
CREATE OR REPLACE VIEW app.luxchange_request_received WITH (security_barrier = true) AS
  SELECT r.id, r.holder_party_id, r.second_home_id, r.checkin, r.checkout, r.sent_at, r.expires_at, r.state,
         r.closure_reason, r.closed_at,
         (SELECT trim_scale(sum(p.amount_minor)::numeric * multiplier.value::numeric / 100)
            FROM app.economic_snapshot_night n JOIN app.prl p ON p.id = n.prl_id
           WHERE n.operation_id = r.operation_id) AS holder_credits,
         validity.value::integer AS credit_validity_months,
         l.expires_at AS credit_expires_at
    FROM app.luxchange_request r
    JOIN app.economic_snapshot_parameter sm ON sm.operation_id = r.operation_id AND sm.parameter_key = 'credit_multiplier'
    JOIN app.parameter multiplier ON multiplier.id = sm.parameter_id
    JOIN app.economic_snapshot_parameter sv ON sv.operation_id = r.operation_id AND sv.parameter_key = 'credit_validity_months'
    JOIN app.parameter validity ON validity.id = sv.parameter_id
    LEFT JOIN app.credit_lot l ON r.state = 'accepted' AND l.origin_operation_id = r.closed_by_operation
      AND l.party_id = r.holder_party_id AND l.origin_command = 'accept_request'
   WHERE EXISTS (SELECT 1 FROM app.party_delegation d
                  WHERE d.party_id = r.holder_party_id AND d.user_id = auth.uid() AND d.state = 'active'
                    AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until));

-- migrate:down
-- Keep the economic history and never restore W21 under an exchange activation.
DO $$
BEGIN
  LOCK TABLE app.luxchange_request, app.luxchange_request_transition, app.capability_activation, app.booking
    IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.luxchange_request WHERE state IN ('accepted', 'declined'))
     OR EXISTS (SELECT 1 FROM app.booking WHERE channel = 'luxchange_request')
     OR EXISTS (SELECT 1 FROM app.luxchange_request_transition t JOIN app.operation o ON o.id = t.operation_id
                 WHERE o.command IN ('accept_request', 'reject_request'))
     OR EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxchange_exchange') THEN
    RAISE EXCEPTION 'rollback would discard W22 Request outcomes or restore W21 under activation'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

DROP VIEW app.luxchange_request_received;
CREATE VIEW app.luxchange_request_received WITH (security_barrier = true) AS
  SELECT r.id, r.holder_party_id, r.second_home_id, r.checkin, r.checkout, r.sent_at, r.expires_at, r.state,
         r.closure_reason, r.closed_at
    FROM app.luxchange_request r
   WHERE EXISTS (SELECT 1 FROM app.party_delegation d
                  WHERE d.party_id = r.holder_party_id AND d.user_id = auth.uid() AND d.state = 'active'
                    AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until));
REVOKE ALL ON app.luxchange_request_received FROM PUBLIC;
GRANT SELECT ON app.luxchange_request_received TO authenticated;

CREATE OR REPLACE FUNCTION app.luxchange_invariant_breaches()
  RETURNS TABLE (invariant text, operation_id uuid, detail text)
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_operation uuid; v_request app.luxchange_request;
BEGIN
  FOR v_operation IN
    SELECT o.id FROM app.operation o
     WHERE o.command = 'deposit_capacity'
       AND (EXISTS (SELECT 1 FROM app.economic_snapshot s WHERE s.operation_id = o.id)
            OR EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = o.id)
            OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = o.id OR c.closed_by_operation = o.id)
            OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.operation_id = o.id))
     ORDER BY o.id
  LOOP
    BEGIN
      PERFORM app.assert_luxchange_deposit_complete(v_operation);
      -- Sem snapshot, nenhum fato de depósito existe (toda escrita o exige).
      IF NOT EXISTS (SELECT 1 FROM app.economic_snapshot s WHERE s.operation_id = v_operation) THEN
        RAISE EXCEPTION 'deposit facts without snapshot' USING ERRCODE = 'check_violation';
      END IF;
    EXCEPTION WHEN check_violation THEN
      invariant := 'REQ-060/deposit';
      operation_id := v_operation;
      detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  -- W21: toda Request com o envio completo; encerrada com o encerramento completo; compromisso ativo só de pendente;
  -- Garantia por liberar só de pendente; Garantia de envio sempre com Request.
  FOR v_request IN SELECT * FROM app.luxchange_request ORDER BY id LOOP
    BEGIN
      PERFORM app.assert_luxchange_request_sent_complete(v_request.id);
      IF v_request.state <> 'pending' THEN
        PERFORM app.assert_luxchange_request_closing_complete(v_request.last_transition_id);
      ELSIF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                     WHERE u.request_id = v_request.id AND u.state <> 'active') THEN
        RAISE EXCEPTION 'released commitment of a pending Request' USING ERRCODE = 'check_violation';
      END IF;
    EXCEPTION WHEN check_violation THEN
      invariant := 'PD-012/request';
      operation_id := v_request.operation_id;
      detail := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  FOR v_operation IN
    SELECT DISTINCT e.operation_id FROM app.credit_entry e
     WHERE e.command = 'send_request' AND e.movement = 'hold'
       AND NOT EXISTS (SELECT 1 FROM app.luxchange_request q WHERE q.operation_id = e.operation_id)
     ORDER BY 1
  LOOP
    invariant := 'TECH-071/hold-without-request';
    operation_id := v_operation;
    detail := 'a send_request hold without its Request';
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.refund_advance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- W21 (ADR-0037 §10): sem a K5 — objeto preexistente; nada novo é criado aqui.
  IF (NEW.id, NEW.payment_id, NEW.operation_id, NEW.amount_minor, NEW.currency, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.payment_id, OLD.operation_id, OLD.amount_minor, OLD.currency, OLD.created_at) THEN
    RAISE EXCEPTION 'a refund keeps its payment, operation and amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_immutable';
  END IF;
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'refund states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  RETURN NEW;
END $function$
;

DROP INDEX app.luxchange_request_accept_one_per_operation;
ALTER TABLE app.luxchange_request
  DROP CONSTRAINT luxchange_request_state,
  ADD CONSTRAINT luxchange_request_state CHECK (state IN ('pending', 'expired', 'cancelled_pre_accept'));
ALTER TABLE app.luxchange_request_transition
  DROP CONSTRAINT luxchange_request_transition_pair,
  ADD CONSTRAINT luxchange_request_transition_pair CHECK (from_state = 'pending' AND (
    (to_state = 'expired' AND reason = 'expired')
    OR (to_state = 'cancelled_pre_accept' AND reason IN ('withdrawn', 'period_started', 'requester_membership',
        'holder_membership', 'capacity_unavailable', 'complement_unavailable'))));

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; r app.luxchange_request; v_at timestamptz; v_reason text; v_kind text; v_evidence uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- TECH-053 classe 1.
  SELECT * INTO r FROM app.luxchange_request WHERE id = NEW.request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a transition belongs to an existing Request'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'luxchange_request_transition_request_id_fkey';
  END IF;
  IF r.state <> 'pending' THEN
    RAISE EXCEPTION 'a Request closes once, from pending'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_luxchange_request_closed';
  END IF;
  v_at := clock_timestamp();
  SELECT c.reason, c.evidence_kind, c.evidence_id INTO v_reason, v_kind, v_evidence
    FROM app.luxchange_request_closure_reason(r.id) c;
  IF op.command IN ('withdraw_request', 'send_request') THEN
    IF op.role <> 'titular' OR op.actor_user_id IS NULL OR op.acting_party_id IS DISTINCT FROM r.requester_party_id THEN
      RAISE EXCEPTION 'only the requester closes the Request with this command'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, r.requester_party_id, v_at);
  ELSIF op.command IN ('expire_requests', 'close_ineligible_request') THEN
    IF op.role <> 'system' THEN
      RAISE EXCEPTION 'expiration and ineligibility closings are system commands'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
    END IF;
  ELSE
    RAISE EXCEPTION 'command % does not close a pending Request in this wave', op.command
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_binding';
  END IF;
  IF op.command = 'withdraw_request' AND v_reason IS DISTINCT FROM 'expired' THEN
    NEW.to_state := 'cancelled_pre_accept';
    NEW.reason := 'withdrawn';
    NEW.evidence_kind := 'actor';
    NEW.evidence_id := NULL;
  ELSE
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'the Request can still be accepted'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_still_acceptable';
    END IF;
    IF (op.command = 'expire_requests' AND v_reason <> 'expired')
       OR (op.command = 'close_ineligible_request' AND v_reason = 'expired') THEN
      RAISE EXCEPTION 'the closing command does not match the proven reason %', v_reason
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_reason';
    END IF;
    NEW.to_state := CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'cancelled_pre_accept' END;
    NEW.reason := v_reason;
    NEW.evidence_kind := v_kind;
    NEW.evidence_id := v_evidence;
  END IF;
  NEW.from_state := 'pending';
  NEW.created_at := v_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'luxchange_request_transition' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'Request state projection runs only after a transition insert'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_projection';
  END IF;
  UPDATE app.luxchange_request
     SET state = NEW.to_state, closure_reason = NEW.reason, last_transition_id = NEW.id,
         closed_by_operation = NEW.operation_id, closed_at = NEW.created_at
   WHERE id = NEW.request_id;
  UPDATE app.luxchange_request_complement_unit SET state = 'released', closed_by_operation = NEW.operation_id
   WHERE request_id = NEW.request_id AND state = 'active';
  UPDATE app.luxchange_request_complement_night SET state = 'released'
   WHERE request_id = NEW.request_id AND state = 'active';
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_complement_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_operation uuid; v_request uuid;
BEGIN
  IF TG_TABLE_NAME = 'luxchange_request_complement_unit' THEN
    IF (NEW.id, NEW.request_id, NEW.kind, NEW.holding_id, NEW.booking_id, NEW.potential_credits)
       IS DISTINCT FROM (OLD.id, OLD.request_id, OLD.kind, OLD.holding_id, OLD.booking_id, OLD.potential_credits) THEN
      RAISE EXCEPTION 'only the state of a commitment changes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_history_immutable';
    END IF;
    v_operation := NEW.closed_by_operation;
    v_request := NEW.request_id;
  ELSE
    IF (NEW.unit_id, NEW.request_id, NEW.second_home_id, NEW.stay_date, NEW.custody_id, NEW.prl_id, NEW.potential_credits)
       IS DISTINCT FROM
       (OLD.unit_id, OLD.request_id, OLD.second_home_id, OLD.stay_date, OLD.custody_id, OLD.prl_id, OLD.potential_credits)
    THEN
      RAISE EXCEPTION 'only the state of a commitment changes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_history_immutable';
    END IF;
    SELECT u.closed_by_operation INTO v_operation FROM app.luxchange_request_complement_unit u
     WHERE u.id = NEW.unit_id AND u.state = NEW.state;
    v_request := NEW.request_id;
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'released' OR v_operation IS NULL
     OR NOT EXISTS (SELECT 1 FROM app.luxchange_request_transition t
                     WHERE t.request_id = v_request AND t.operation_id = v_operation) THEN
    RAISE EXCEPTION 'a commitment is released only by the pre-acceptance closing of its Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_release';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.assert_luxchange_request_closing_complete(p_transition uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.luxchange_request_transition; r app.luxchange_request; f app.fee_charge; op app.operation;
BEGIN
  SELECT * INTO STRICT t FROM app.luxchange_request_transition WHERE id = p_transition;
  SELECT * INTO STRICT r FROM app.luxchange_request WHERE id = t.request_id;
  SELECT * INTO STRICT op FROM app.operation WHERE id = t.operation_id;
  IF r.state <> t.to_state OR r.last_transition_id <> t.id THEN
    RAISE EXCEPTION 'the Request state follows its closing'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_projection';
  END IF;
  IF EXISTS (SELECT 1 FROM app.credit_entry h
              WHERE h.operation_id = r.operation_id AND h.movement = 'hold'
                AND h.quantity <> coalesce((SELECT sum(x.quantity) FROM app.credit_entry x
                                             WHERE x.parent_entry_id = h.id AND x.movement = 'release'
                                               AND x.operation_id = t.operation_id), 0)) THEN
    RAISE EXCEPTION 'a pre-acceptance closing releases the whole guarantee of the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_guarantee';
  END IF;
  SELECT * INTO STRICT f FROM app.fee_charge WHERE operation_id = r.operation_id;
  IF NOT EXISTS (SELECT 1 FROM app.fee_charge_reversal v WHERE v.fee_charge_id = f.id AND v.operation_id = t.operation_id)
     OR NOT EXISTS (SELECT 1 FROM app.refund x
                     WHERE x.payment_id = f.payment_id AND x.operation_id = t.operation_id
                       AND x.amount_minor = f.amount_minor AND x.currency = f.currency) THEN
    RAISE EXCEPTION 'a pre-acceptance closing reverses the Fee with a full refund'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_fee';
  END IF;
  IF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u WHERE u.request_id = r.id AND u.state <> 'released')
     OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night c WHERE c.request_id = r.id AND c.state <> 'released')
  THEN
    RAISE EXCEPTION 'a pre-acceptance closing releases every committed date'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_complement';
  END IF;
  IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request')
     AND (EXISTS (SELECT 1 FROM app.date_custody c
                   WHERE c.opened_by_operation = op.id OR c.closed_by_operation = op.id)
          OR EXISTS (SELECT 1 FROM app.date_occupancy o
                      WHERE o.opened_by_operation = op.id OR o.released_by_operation = op.id)
          OR EXISTS (SELECT 1 FROM app.booking_state_transition b WHERE b.operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = op.id)
          OR EXISTS (SELECT 1 FROM app.settlement s WHERE s.operation_id = op.id)) THEN
    RAISE EXCEPTION 'closing a Request never touches capacity, use right, credit lots or settlement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_closing_side_effect';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_request_transition_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_luxchange_request_closing_complete(NEW.id);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.credit_entry_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  lot app.credit_lot;
  parent app.credit_entry;
  r app.luxchange_request;
  v_now timestamptz;
  v_valid boolean;
  v_left numeric;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- ADR-0037 §10: a K4 abre só movimento novo; liberação e expiração de obrigação existente nunca dependem de chave.
  IF NEW.movement NOT IN ('release', 'expire') THEN
    PERFORM app.assert_credits_active();
  END IF;
  -- K7 para Garantia, consumo e originação do intercâmbio; a recusa (W22) segue sob a K7 até a sua wave. Encerramentos
  -- pré-aceite da W21 não dependem dela.
  IF (op.command IN ('send_request', 'accept_request', 'create_direct') AND NEW.movement <> 'release')
     OR op.command = 'reject_request' THEN
    PERFORM app.assert_luxchange_exchange_active();
  END IF;
  SELECT * INTO lot FROM app.credit_lot WHERE id = NEW.lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit movement on an unknown lot'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'credit_entry_lot_id_fkey';
  END IF;
  v_now := clock_timestamp();
  v_valid := v_now < lot.expires_at;
  NEW.command := op.command;
  NEW.created_at := v_now;
  IF NEW.parent_entry_id IS NOT NULL THEN
    SELECT * INTO parent FROM app.credit_entry WHERE id = NEW.parent_entry_id;
    IF NOT FOUND OR parent.lot_id <> NEW.lot_id
       OR parent.movement <> (CASE WHEN NEW.movement = 'reverse' THEN 'consume' ELSE 'hold' END) THEN
      RAISE EXCEPTION 'the movement follows a hold or a consumption of the same lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_parent';
    END IF;
  END IF;

  IF NEW.movement = 'originate' THEN
    -- Só o gatilho do lote (dono) escreve a originação, uma vez, com a quantidade e a operação do lote.
    IF NOT app.acts_as_schema_owner() OR NEW.quantity <> lot.quantity
       OR NEW.operation_id <> lot.origin_operation_id THEN
      RAISE EXCEPTION 'origination is recorded only with its lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_origination';
    END IF;
    NEW.created_at := lot.originated_at;
  ELSIF NEW.movement = 'hold' OR (NEW.movement = 'consume' AND NEW.from_bucket = 'available') THEN
    -- Garantia (envio de Request) e consumo direto (Direct): a party que age gasta os próprios Créditos.
    IF op.command <> (CASE WHEN NEW.movement = 'hold' THEN 'send_request' ELSE 'create_direct' END)
       OR op.acting_party_id IS DISTINCT FROM lot.party_id OR op.actor_user_id IS NULL THEN
      RAISE EXCEPTION 'credits are spent only by their party through an authorized mechanism'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
    PERFORM app.lock_own_use_representation(op.actor_user_id, lot.party_id, v_now);
    IF NEW.movement = 'hold' THEN
      -- W21 (TECH-071, ADR-0037 §4): a Garantia lastreia a Request da própria operação, com lote válido até o prazo.
      SELECT * INTO r FROM app.luxchange_request WHERE operation_id = op.id;
      IF NOT FOUND OR r.requester_party_id <> lot.party_id OR lot.expires_at < r.expires_at THEN
        RAISE EXCEPTION 'a hold backs the Request of its operation with a lot valid until the Request expires'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_hold_request';
      END IF;
      -- FEFO (ADR-0037 §2): nenhum lote elegível que vença antes — ou empate e seja mais antigo — fica com saldo livre.
      IF EXISTS (SELECT 1 FROM app.credit_lot x
                  WHERE x.party_id = lot.party_id AND x.id <> lot.id AND x.available > 0
                    AND v_now < x.expires_at AND x.expires_at >= r.expires_at
                    AND (x.expires_at, x.originated_at, x.id) < (lot.expires_at, lot.originated_at, lot.id)) THEN
        RAISE EXCEPTION 'the guarantee takes the eligible lots that expire first'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_hold_fefo';
      END IF;
    END IF;
  ELSIF NEW.movement = 'consume' THEN
    -- Aceite: consome a Garantia da Request (o detentor age; a party do lote é a solicitante).
    IF op.command <> 'accept_request' THEN
      RAISE EXCEPTION 'a hold is consumed only by the acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
  ELSIF NEW.movement = 'release' THEN
    IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request', 'send_request') THEN
      -- W21: só a Garantia da Request encerrada antes do aceite, na mesma operação do encerramento.
      SELECT q.* INTO r FROM app.luxchange_request q JOIN app.credit_entry h ON h.operation_id = q.operation_id
       WHERE h.id = NEW.parent_entry_id;
      IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.luxchange_request_transition t
                                   WHERE t.request_id = r.id AND t.operation_id = op.id) THEN
        RAISE EXCEPTION 'a hold is released only by the pre-acceptance closing of its Request'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
      END IF;
    ELSIF op.command <> 'reject_request' THEN
      RAISE EXCEPTION 'a hold is released only by a pre-acceptance closing'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
  ELSIF NEW.movement = 'expire' THEN
    IF op.command <> 'expire_credit_lots' OR v_valid OR NEW.quantity <> lot.available THEN
      RAISE EXCEPTION 'expiration records the whole available balance of a lot past its validity'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_expiration';
    END IF;
  ELSIF NEW.movement = 'reverse' THEN
    IF op.command <> 'reverse_credit' THEN
      RAISE EXCEPTION 'a consumption is reversed only by reverse_credit'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
    PERFORM app.lock_own_use_admin_authority(op);
  END IF;

  -- Uso exige `now < expires_at` e Membership elegível (TECH-044, TECH-071, BR-195), independentemente de job.
  IF NEW.movement IN ('hold', 'consume') THEN
    IF NOT v_valid THEN
      RAISE EXCEPTION 'credits are usable only before the lot expires'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credits_lot_expired';
    END IF;
    PERFORM app.assert_credit_membership(lot.party_id);
  END IF;
  -- Liberação e reversão voltam a `available` só antes do vencimento; depois, `expired` (TECH-070, TECH-072).
  IF NEW.movement IN ('release', 'reverse')
     AND NEW.to_bucket <> (CASE WHEN v_valid THEN 'available' ELSE 'expired' END) THEN
    RAISE EXCEPTION 'a released or reversed balance returns to available only before the lot expires'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_validity_bucket';
  END IF;
  -- Nenhuma liberação, consumo ou reversão acima do que o movimento-pai ainda reserva ou consumiu.
  IF NEW.parent_entry_id IS NOT NULL THEN
    SELECT parent.quantity - coalesce(sum(c.quantity), 0) INTO v_left
      FROM app.credit_entry c WHERE c.parent_entry_id = parent.id;
    IF NEW.quantity > v_left THEN
      RAISE EXCEPTION 'the movement exceeds what its hold or consumption still covers'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credits_parent_exceeded';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.fee_charge_reversal_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; fee_op app.operation; v_payment uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- Desfechos pré-aceite do PD-006 (TECH-051/TECH-090) e o encerramento por inelegibilidade (W21).
  IF op.command NOT IN ('withdraw_request', 'reject_request', 'accept_request', 'expire_requests',
                        'close_ineligible_request', 'send_request') THEN
    RAISE EXCEPTION 'the Fee is reversed only by a pre-acceptance outcome'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
  END IF;
  SELECT o.* INTO fee_op FROM app.fee_charge f JOIN app.operation o ON o.id = f.operation_id
   WHERE f.id = NEW.fee_charge_id;
  SELECT f.payment_id INTO v_payment FROM app.fee_charge f WHERE f.id = NEW.fee_charge_id;
  IF fee_op.command IS DISTINCT FROM 'send_request' THEN
    RAISE EXCEPTION 'only the Fee of a Request has pre-acceptance outcomes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_mechanism';
  END IF;
  IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request', 'send_request') THEN
    -- W21 (ADR-0037 §10): só o Fee da Request encerrada antes do aceite pela mesma operação — obrigação existente,
    -- revertida mesmo com a K5 desligada.
    IF NOT EXISTS (SELECT 1 FROM app.luxchange_request q JOIN app.luxchange_request_transition t ON t.request_id = q.id
                    WHERE q.operation_id = fee_op.id AND t.operation_id = op.id) THEN
      RAISE EXCEPTION 'the Fee is reversed only with the pre-acceptance closing of its Request'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
    END IF;
  ELSE
    PERFORM app.assert_payments_active();
  END IF;
  PERFORM 1 FROM app.payment WHERE id = v_payment FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.settlement s WHERE s.fee_charge_id = NEW.fee_charge_id) THEN
    RAISE EXCEPTION 'a settled Fee is not reversed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_settled';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.booking_state_transition_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_at timestamptz;
  op app.operation;
  b app.booking;
  i record;
  e app.booking_exception;
  a app.booking_authorization;
  v_unstarted date[];
  v_class text;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a transition belongs to an existing booking'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'booking_state_transition_booking_id_fkey';
  END IF;
  IF op.second_home_id IS NOT NULL AND op.second_home_id <> b.second_home_id THEN
    RAISE EXCEPTION 'the operation belongs to another Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  -- Atores: a autoridade antes das travas da reserva (padrão W8, ADR-0021).
  IF NEW.kind = 'advance' THEN
    IF op.command <> 'advance_booking_states' OR op.role <> 'system' THEN
      RAISE EXCEPTION 'only advance_booking_states advances a booking'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    END IF;
  ELSIF NEW.kind = 'cession' THEN
    -- W20 (ADR-0036 §1): a cessão da reserva Co-Owner pelo depósito, com a K6 (não a K2).
    PERFORM app.assert_luxchange_deposit_active();
    IF op.command <> 'deposit_capacity' THEN
      RAISE EXCEPTION 'only deposit_capacity cedes a booking'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    END IF;
  ELSE
    -- K2 (ADR-0027 §5): os seis commands; jobs fora.
    PERFORM app.assert_own_use_lifecycle_active();
    IF NEW.kind = 'cancellation' THEN
      IF op.command <> 'cancel_own_use_booking' THEN
        RAISE EXCEPTION 'only cancel_own_use_booking cancels on behalf of the Titular'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
      END IF;
    ELSIF op.command <> (CASE NEW.kind
        WHEN 'no_show' THEN 'declare_no_show'
        WHEN 'exception_opening' THEN 'open_exception'
        WHEN 'exception_resolution' THEN 'resolve_exception'
        ELSE (CASE WHEN b.stake_id IS NULL THEN 'resolve_exception' ELSE 'correct_use_right' END)
      END) THEN
      RAISE EXCEPTION 'the transition kind does not match the command of the operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
    ELSE
      PERFORM app.lock_own_use_admin_authority(op);
    END IF;
  END IF;
  IF NEW.kind IN ('cancellation', 'cession') THEN
    PERFORM app.lock_own_use_titular(op, b, clock_timestamp());
  END IF;
  PERFORM app.lock_own_use_booking(b);
  -- Relê depois da trava (READ COMMITTED): a transição concorrente que venceu já está visível.
  SELECT * INTO STRICT b FROM app.booking WHERE id = NEW.booking_id;
  v_at := clock_timestamp();
  IF NEW.previous_transition_id IS DISTINCT FROM b.last_transition_id OR NEW.from_state <> b.state THEN
    RAISE EXCEPTION 'a transition starts from the current state of the booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_transition_stale';
  END IF;
  -- TECH-055 (o CHECK repete a regra para quando os gatilhos forem contornados).
  IF NOT coalesce(CASE NEW.kind
       WHEN 'advance' THEN (NEW.from_state, NEW.to_state) IN (('confirmed', 'in_use'), ('in_use', 'completed'))
       WHEN 'cancellation' THEN NEW.from_state IN ('confirmed', 'in_use', 'in_exception') AND NEW.to_state = 'cancelled'
       WHEN 'no_show' THEN NEW.from_state IN ('confirmed', 'in_use') AND NEW.to_state = 'no_show'
       WHEN 'exception_opening' THEN NEW.from_state IN ('confirmed', 'in_use') AND NEW.to_state = 'in_exception'
       WHEN 'exception_resolution' THEN NEW.from_state = 'in_exception'
         AND NEW.to_state IN ('confirmed', 'completed', 'cancelled')
       WHEN 'invalidation' THEN NEW.from_state = 'in_exception' AND NEW.to_state = 'cancelled'
       WHEN 'cession' THEN NEW.from_state = 'confirmed' AND NEW.to_state = 'cancelled'
     END, false) THEN
    RAISE EXCEPTION 'transition outside TECH-055'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_transition_pair';
  END IF;
  NEW.recorded_at := v_at;
  SELECT * INTO i FROM app.booking_period_instants(b.id);
  v_unstarted := app.booking_unstarted_nights(b.id, v_at);
  IF NEW.from_state = 'in_exception' THEN
    SELECT x.* INTO e FROM app.booking_exception x
     WHERE x.booking_id = b.id
       AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = x.id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a booking in exception has one open exception'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_open';
    END IF;
  END IF;

  IF NEW.kind = 'cession' THEN
    -- W20 (ADR-0036 §1–§3; REQ-060, TECH-023, TECH-043): só reserva Co-Owner, inteira e ainda não iniciada, com 14 dias
    -- de antecedência do 1º check-in, Membership elegível e todas as noites no snapshot da operação. Sem classe de
    -- cancelamento nem base: a cessão não é cancelamento convencional.
    IF b.stake_id IS NULL THEN
      RAISE EXCEPTION 'an Owner booking is cancelled before its capacity is deposited'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_owner_booking';
    END IF;
    IF cardinality(v_unstarted) <> b.checkout_date - b.checkin_date THEN
      RAISE EXCEPTION 'a booking is ceded whole, before its first night'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_whole_booking';
    END IF;
    IF NOT app.luxchange_deposit_notice_met(i.first_checkin_at, v_at) THEN
      RAISE EXCEPTION 'a capacity is deposited at least 14 days before its first check-in'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'deposit_min_notice';
    END IF;
    PERFORM app.assert_credit_membership(op.acting_party_id);
    IF EXISTS (SELECT 1 FROM unnest(v_unstarted) AS n(stay_date)
                WHERE NOT EXISTS (SELECT 1 FROM app.economic_snapshot_night s
                                   WHERE s.operation_id = op.id AND s.second_home_id = b.second_home_id
                                     AND s.stay_date = n.stay_date)) THEN
      RAISE EXCEPTION 'every ceded night is priced in the snapshot of its operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_snapshot';
    END IF;
    IF NEW.cancellation_class IS NOT NULL THEN
      RAISE EXCEPTION 'a cession carries no cancellation class'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    NEW.first_affected_date := v_unstarted[1];
    RETURN NEW;
  END IF;

  IF NEW.kind = 'advance' THEN
    -- TECH-055 pelo instante: em uso a partir do 1º check-in; concluída a partir do check-out.
    IF (NEW.to_state = 'in_use' AND v_at < i.first_checkin_at)
       OR (NEW.to_state = 'completed' AND v_at < i.checkout_at) THEN
      RAISE EXCEPTION 'the booking period has not reached this state yet'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_advance_early';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'an advance carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.kind = 'exception_opening' THEN
    IF v_at >= i.checkout_at THEN
      RAISE EXCEPTION 'an exception opens only before the check-out'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_exception_after_checkout';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'an exception opening carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.kind = 'exception_resolution' AND NEW.to_state IN ('confirmed', 'completed') THEN
    -- Resolução sem efeito econômico: `confirmed` só antes do check-out, `completed` só a partir dele (REQ-084).
    IF (NEW.to_state = 'confirmed' AND v_at >= i.checkout_at)
       OR (NEW.to_state = 'completed' AND v_at < i.checkout_at) THEN
      RAISE EXCEPTION 'the resolution follows the booking period'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_resolution_period';
    END IF;
    IF NEW.cancellation_class IS NOT NULL OR NEW.first_affected_date IS NOT NULL THEN
      RAISE EXCEPTION 'a resolution without cancellation carries no cancellation terms'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_transition_class_shape';
    END IF;
    RETURN NEW;
  END IF;

  -- Daqui em diante, eventos que liberam noites: `cancelled` ou `no_show`.
  IF NEW.kind = 'no_show' THEN
    IF NOT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, v_at) THEN
      RAISE EXCEPTION 'a no-show is declared only between the first check-in and the check-out'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_no_show_window';
    END IF;
  ELSIF cardinality(v_unstarted) = 0 THEN
    RAISE EXCEPTION 'a cancellation needs at least one night not started'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_no_unstarted_night';
  END IF;
  -- REQ-080, TECH-043: classe no instante, só no Co-Owner e só no cancelamento (Titular ou P-A).
  IF b.stake_id IS NOT NULL AND NEW.kind IN ('cancellation', 'exception_resolution') THEN
    v_class := CASE WHEN app.own_use_cancellation_timely(i.first_checkin_at, v_at) THEN 'timely' ELSE 'late' END;
  END IF;
  IF NEW.kind = 'exception_resolution' AND e.exception_type <> 'operational' THEN
    RAISE EXCEPTION 'an unauthorized booking inquiry is cancelled only by invalidation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_inquiry_resolution';
  END IF;
  IF NEW.kind = 'invalidation' AND e.exception_type <> 'unauthorized_booking' THEN
    RAISE EXCEPTION 'only an unauthorized booking inquiry is invalidated'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_inquiry_resolution';
  END IF;

  IF NEW.kind = 'cancellation' THEN
    -- REQ-084: na apuração, o Co-Owner só cancela tempestivamente (tardio suspenso); o Owner, a qualquer tempo.
    IF NEW.from_state = 'in_exception' AND e.exception_type = 'unauthorized_booking' AND v_class = 'late' THEN
      RAISE EXCEPTION 'a late Co-Owner cancellation is suspended during an unauthorized booking inquiry'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_late_during_inquiry';
    END IF;
    -- D7: termos esperados da prévia = termos calculados no instante, ou nada acontece.
    IF NEW.cancellation_class IS DISTINCT FROM v_class OR NEW.first_affected_date IS DISTINCT FROM v_unstarted[1] THEN
      RAISE EXCEPTION 'the cancellation terms changed since the preview'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'cancellation_terms_changed';
    END IF;
    RETURN NEW;
  END IF;

  -- Atos Admin com efeito econômico: o uso da autorização independente da mesma operação (TECH-051, ADR-0027 §3).
  SELECT * INTO a FROM app.booking_authorization_of_operation(NEW.operation_id, b.id);
  IF a.id IS NULL OR a.purpose <> (CASE NEW.kind WHEN 'no_show' THEN 'no_show'
       WHEN 'exception_resolution' THEN 'exception_cancellation' ELSE 'invalidation' END) THEN
    RAISE EXCEPTION 'this act requires the independent authorization of the same operation'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_missing';
  END IF;
  IF (a.exception_id IS NOT NULL AND a.exception_id IS DISTINCT FROM e.id)
     OR NOT (v_unstarted <@ a.scope_dates)
     OR a.expected_cancellation_class IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'the act is outside the scope of the authorization'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
  END IF;
  NEW.cancellation_class := v_class;
  NEW.first_affected_date := v_unstarted[1];
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.assert_booking_closure_complete(p_transition uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t app.booking_state_transition;
  b app.booking;
  v_affected date[];
  v_n integer;
  v_reason text;
  v_spe_pool boolean;
BEGIN
  SELECT * INTO STRICT t FROM app.booking_state_transition WHERE id = p_transition;
  IF t.kind = 'cession' THEN
    -- W20 (ADR-0036 §6): a cessão é conferida com o depósito inteiro da operação, não como cancelamento.
    PERFORM app.assert_luxchange_deposit_complete(t.operation_id);
    RETURN;
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = t.booking_id;
  v_affected := app.booking_unstarted_nights(b.id, t.recorded_at);
  v_n := cardinality(v_affected);
  v_reason := app.booking_release_reason(t.kind);
  IF (SELECT count(*) FROM app.date_occupancy o
       WHERE o.booking_id = b.id AND o.released_by_operation = t.operation_id AND o.release_reason = v_reason
         AND o.stay_date = ANY (v_affected)) <> v_n
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.released_by_operation = t.operation_id
                   AND (o.booking_id <> b.id OR o.release_reason <> v_reason OR NOT (o.stay_date = ANY (v_affected)))) THEN
    RAISE EXCEPTION 'every night not started is released by the event, and only those'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_occupancy';
  END IF;
  IF b.stake_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = t.operation_id)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = t.operation_id)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.closed_by_operation = t.operation_id) THEN
      RAISE EXCEPTION 'an Owner booking moves neither custody nor use right'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_owner_effects';
    END IF;
    RETURN;
  END IF;
  v_spe_pool := t.kind = 'invalidation' OR t.cancellation_class = 'timely';
  IF (SELECT count(*) FROM app.date_custody p JOIN app.date_custody n ON n.parent_custody_id = p.id
       WHERE p.closed_by_operation = t.operation_id AND n.opened_by_operation = t.operation_id
         AND p.second_home_id = b.second_home_id AND p.stay_date = ANY (v_affected)
         AND p.opened_by_operation = b.opened_by_operation AND p.holder_kind = 'use_right'
         AND p.basis = 'reserved_right' AND p.stake_id = b.stake_id
         AND CASE WHEN v_spe_pool THEN n.holder_kind = 'spe_pool'
                  ELSE n.holder_kind = 'use_right' AND n.basis = 'forfeited_right' AND n.stake_id = b.stake_id END) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = t.operation_id) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = t.operation_id) <> v_n THEN
    RAISE EXCEPTION 'every night not started moves its reserved right as the event requires'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_custody';
  END IF;
  IF (SELECT count(*) FROM app.use_right_ledger l JOIN app.use_right_ledger c ON c.id = l.refers_to_id
       WHERE l.operation_id = t.operation_id AND c.operation_id = b.opened_by_operation AND c.movement = 'consume'
         AND c.stay_date = ANY (v_affected)
         AND l.movement = CASE WHEN t.kind = 'invalidation' THEN 'correction' ELSE 'restore' END)
        <> (CASE WHEN v_spe_pool THEN v_n ELSE 0 END)
     OR (SELECT count(*) FROM app.use_right_ledger l WHERE l.operation_id = t.operation_id)
        <> (CASE WHEN v_spe_pool THEN v_n ELSE 0 END) THEN
    RAISE EXCEPTION 'each night returned to the SPE reverses its consumption once; a forfeited night keeps it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_closure_use_right';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.date_occupancy_release() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.booking_state_transition;
BEGIN
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'a released occupancy never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_released_once';
  END IF;
  IF NOT app.acts_as_schema_owner() THEN
    IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.released_by_operation) = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só libera com `ceded` a reserva Co-Owner que ela cedeu.
      PERFORM app.luxchange_deposit_release(NEW.released_by_operation, OLD, NEW.release_reason);
    ELSE
      IF OLD.channel <> 'own_use' THEN
        PERFORM app.assert_inventory_transition_enabled();
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.released_by_operation, OLD.booking_id, OLD.stay_date);
      IF NEW.release_reason IS DISTINCT FROM app.booking_release_reason(t.kind) THEN
        RAISE EXCEPTION 'the release reason is the reason of the event of the operation'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_release_reason';
      END IF;
    END IF;
    IF NEW.released_at IS NOT NULL THEN
      NEW.released_at := clock_timestamp();
    END IF;
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.booking_id, NEW.channel, NEW.custody_id, NEW.stake_id,
      NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.booking_id, OLD.channel, OLD.custody_id, OLD.stake_id,
      OLD.opened_by_operation)
     OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'only the release of an active occupancy is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.released_by_operation);
  IF NEW.release_reason = 'ceded' AND NOT EXISTS (
       SELECT 1 FROM app.date_custody c
        WHERE c.id = OLD.custody_id AND c.holder_kind = 'use_right' AND c.basis = 'reserved_right'
          AND c.stake_id = OLD.stake_id) THEN
    RAISE EXCEPTION 'ceded only releases Co-Owner own use over a reserved right of the same stake'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_ceded_reserved_right';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_parent app.date_custody;
  v_grand app.date_custody;
  v_modality text;
  v_found boolean;
  b app.booking;
  t app.booking_state_transition;
  a app.booking_authorization;
BEGIN
  IF NEW.closed_at IS NOT NULL OR NEW.closed_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'a custody opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_opens_active';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  IF NEW.parent_custody_id IS NULL THEN
    -- TECH-021: raiz autorizada pelos fatos (formalização + noite selada), nunca por decisão: a primeira custódia da
    -- noite, owner no Owner e spe_pool no Co-Owner, aberta pelo command de sistema que sela.
    IF EXISTS (SELECT 1 FROM app.date_custody
                WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date) THEN
      RAISE EXCEPTION 'only the first custody of a sealed night is a root'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_first';
    END IF;
    SELECT modality INTO v_modality FROM app.acquisition WHERE second_home_id = NEW.second_home_id;
    IF NOT FOUND OR NEW.holder_kind <> (CASE v_modality WHEN 'owner' THEN 'owner' ELSE 'spe_pool' END) THEN
      RAISE EXCEPTION 'the root custody follows the acquisition modality'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_root_modality';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.opened_by_operation AND command = 'open_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only open_exercise opens a root custody'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'inventory_operation_provenance';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_parent FROM app.date_custody WHERE id = NEW.parent_custody_id;
  v_found := FOUND;
  IF NOT app.acts_as_schema_owner() THEN
    IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.opened_by_operation) = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só abre `luxtory/inventory/luxchange_cession` com a referência dela.
      PERFORM app.luxchange_deposit_open(NEW);
    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'
       AND NEW.basis IS NOT DISTINCT FROM 'reserved_right' THEN
      -- W12: `use_right/reserved_right` sobre `spe_pool`, para a Ação da reserva da mesma operação.
      b := app.assert_own_use_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
      IF b.stake_id IS DISTINCT FROM NEW.stake_id THEN
        RAISE EXCEPTION 'a reserved right belongs to the stake of the booking'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'use_right' AND v_parent.basis = 'reserved_right' THEN
      -- W13: cancelamento, no-show, cancelamento P-A ou invalidação da reserva que abriu a `reserved_right`.
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = v_parent.opened_by_operation;
      IF NOT FOUND OR b.stake_id IS DISTINCT FROM v_parent.stake_id THEN
        RAISE EXCEPTION 'a reserved right moves only with the booking that opened it'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.opened_by_operation, b.id, NEW.stay_date);
      IF NEW.holder_kind IS DISTINCT FROM (CASE app.own_use_reserved_right_successor(t)
                                             WHEN 'spe_pool' THEN 'spe_pool' ELSE 'use_right' END)
         OR NEW.basis IS DISTINCT FROM (CASE app.own_use_reserved_right_successor(t)
                                          WHEN 'spe_pool' THEN NULL ELSE 'forfeited_right' END) THEN
        RAISE EXCEPTION 'the successor of a reserved right follows the event of the operation'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_lifecycle_successor';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'use_right' AND v_parent.basis = 'forfeited_right' THEN
      -- W13 (BR-283): recuperação autorizada da capacidade futura perdida; `authorization_ref` aponta a autorização.
      SELECT * INTO a FROM app.own_use_recovery_write(NEW.opened_by_operation, v_parent.id);
      IF NEW.authorization_ref IS DISTINCT FROM 'booking_authorization:' || a.id::text THEN
        RAISE EXCEPTION 'recovered capacity carries the reference of its independent authorization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_recovery_authorization';
      END IF;
    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'luxtory' THEN
      -- W14 (TECH-022, REQ-036): seleção Luxtory da operação `select_luxtory_capacity`, com a K3, na janela e dentro da
      -- capacidade da categoria, com a base registrada; finalidade e origem seguem a tabela fechada abaixo.
      PERFORM app.assert_luxtory_selection_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
      IF NEW.authorization_ref IS NULL OR length(btrim(NEW.authorization_ref)) NOT BETWEEN 1 AND 255 THEN
        RAISE EXCEPTION 'a Luxtory selection carries its registered basis'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'luxtory_selection_basis';
      END IF;
      PERFORM app.assert_luxtory_capacity_available(NEW.second_home_id, NEW.stay_date);
    ELSE
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
  END IF;
  -- Transição atômica: a mãe (mesma noite, pela FK composta) foi fechada pela operação que abre a filha.
  IF NOT v_found OR v_parent.closed_by_operation IS DISTINCT FROM NEW.opened_by_operation THEN
    RAISE EXCEPTION 'a successor custody is opened by the operation that closed its parent'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_atomic';
  END IF;
  IF v_parent.parent_custody_id IS NOT NULL THEN
    SELECT * INTO v_grand FROM app.date_custody WHERE id = v_parent.parent_custody_id;
  END IF;
  IF NOT app.custody_transition_valid(v_parent, NEW, v_grand) THEN
    RAISE EXCEPTION 'custody transition outside the closed TECH-022 table'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_transition_closed_table';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE b app.booking; t app.booking_state_transition; a app.booking_authorization;
BEGIN
  IF NOT app.acts_as_schema_owner() THEN
    IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.closed_by_operation) = 'deposit_capacity' THEN
      -- W20 (ADR-0036 §3): a operação de depósito só fecha `owner` livre da holding vigente ou `reserved_right` da
      -- reserva que ela cedeu.
      PERFORM app.luxchange_deposit_close(NEW.closed_by_operation, OLD);
    ELSIF OLD.holder_kind = 'spe_pool'
       AND (SELECT o.command FROM app.operation o WHERE o.id = NEW.closed_by_operation) = 'select_luxtory_capacity' THEN
      -- W14: a seleção Luxtory fecha `spe_pool`; a abertura da sucessora confere finalidade, base e capacidade.
      PERFORM app.assert_luxtory_selection_write(NEW.closed_by_operation, OLD.second_home_id, OLD.stay_date);
    ELSIF OLD.holder_kind = 'spe_pool' THEN
      b := app.assert_own_use_write(NEW.closed_by_operation, OLD.second_home_id, OLD.stay_date);
      IF b.stake_id IS NULL THEN
        RAISE EXCEPTION 'an Owner booking never closes a custody'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
      END IF;
    ELSIF OLD.holder_kind = 'use_right' AND OLD.basis = 'reserved_right' THEN
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = OLD.opened_by_operation;
      IF NOT FOUND OR b.stake_id IS DISTINCT FROM OLD.stake_id THEN
        RAISE EXCEPTION 'a reserved right moves only with the booking that opened it'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.closed_by_operation, b.id, OLD.stay_date);
    ELSIF OLD.holder_kind = 'use_right' AND OLD.basis = 'forfeited_right' THEN
      SELECT * INTO a FROM app.own_use_recovery_write(NEW.closed_by_operation, OLD.id);
    ELSE
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    -- ADR-0024 §3: o instante do fechamento é carimbado pelo banco; o valor enviado nunca prevalece.
    IF NEW.closed_at IS NOT NULL THEN
      NEW.closed_at := clock_timestamp();
    END IF;
  END IF;
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'a closed custody never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_closed_once';
  END IF;
  IF (NEW.id, NEW.second_home_id, NEW.stay_date, NEW.holder_kind, NEW.stake_id, NEW.basis, NEW.purpose,
      NEW.inventory_origin, NEW.authorization_ref, NEW.parent_custody_id, NEW.opened_by_operation)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.stay_date, OLD.holder_kind, OLD.stake_id, OLD.basis, OLD.purpose,
      OLD.inventory_origin, OLD.authorization_ref, OLD.parent_custody_id, OLD.opened_by_operation)
     OR NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'only the closing of an active custody is recorded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_history_immutable';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.closed_by_operation);
  RETURN NEW;
END $$;

DROP TRIGGER date_custody_consume_complement ON app.date_custody;
DROP FUNCTION app.luxchange_request_consume_complement();
DROP FUNCTION app.assert_luxchange_request_accept_complete(uuid, boolean);
DROP FUNCTION app.luxchange_request_accept_rescan(uuid, uuid[]);
DROP FUNCTION app.luxchange_request_pending_conflicts(uuid);
DROP FUNCTION app.assert_luxchange_request_cession_complete(uuid, uuid, boolean);
DROP FUNCTION app.luxchange_request_cession_ref(uuid, app.date_custody);
DROP FUNCTION app.luxchange_request_cession_nights(uuid);
DROP FUNCTION app.luxchange_request_accepted_write(uuid);

CREATE OR REPLACE FUNCTION app.booking_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  op app.operation;
  h app.holding;
  v_nights integer;
  v_sealed integer;
  v_first_checkin timestamptz;
BEGIN
  PERFORM app.assert_own_use_booking_active();
  IF NEW.channel <> 'own_use' THEN
    RAISE EXCEPTION 'only own use bookings are enabled in W12'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'booking_channel_not_enabled';
  END IF;
  IF NEW.state <> 'confirmed' THEN
    RAISE EXCEPTION 'a booking opens confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_opens_confirmed';
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.opened_by_operation;
  IF op.command <> 'create_own_use_booking' OR op.role <> 'titular' OR op.acting_party_id IS NULL
     OR op.second_home_id IS DISTINCT FROM NEW.second_home_id THEN
    RAISE EXCEPTION 'only create_own_use_booking opens an own use booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_representation(op.actor_user_id, op.acting_party_id, v_at);
  SELECT * INTO h FROM app.holding WHERE id = NEW.holding_id;
  IF NOT FOUND OR h.party_id <> op.acting_party_id OR h.second_home_id <> NEW.second_home_id
     OR h.valid_from > v_at OR (h.valid_until IS NOT NULL AND h.valid_until <= v_at)
     OR NEW.stake_id IS DISTINCT FROM h.stake_id THEN
    RAISE EXCEPTION 'the booking holding is the current holding of the represented party'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  -- TECH-053 classe 4: reservas concorrentes da mesma Ação se serializam no banco (saldo e permanência), mesmo num
  -- caminho que pule a trava da aplicação. Reentrante: o command já a tomou.
  IF h.role = 'co_owner' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('app.stake:' || h.stake_id::text, 0));
  END IF;
  v_nights := NEW.checkout_date - NEW.checkin_date;
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'a booking has at least one night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_minimum_one_night';
  END IF;
  -- BR-111, TECH-045: no máximo 14 noites consecutivas no uso próprio do Co-Owner; o Owner não tem esse limite (REQ-035).
  IF h.role = 'co_owner' AND v_nights > 14 THEN
    RAISE EXCEPTION 'a Co-Owner stay never exceeds 14 consecutive nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_length_maximum';
  END IF;
  SELECT count(*), max(d.checkin_at) FILTER (WHERE d.stay_date = NEW.checkin_date)
    INTO v_sealed, v_first_checkin
    FROM app.second_home_date d
   WHERE d.second_home_id = NEW.second_home_id
     AND d.stay_date >= NEW.checkin_date AND d.stay_date < NEW.checkout_date;
  IF v_sealed <> v_nights THEN
    RAISE EXCEPTION 'every night of an own use booking is sealed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_booking_night_sealed';
  END IF;
  -- TECH-043: noite futura = `now < checkin_at`, aqui no instante da validação.
  IF v_first_checkin <= v_at THEN
    RAISE EXCEPTION 'an own use booking starts at a future night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_booking_night_future';
  END IF;
  -- REQ-034, TECH-042: janela aberta para cada exercício e para o 29/02 das noites (período que cruza exercício ou
  -- categoria é validado noite a noite).
  IF h.role = 'co_owner' AND EXISTS (
       SELECT 1
         FROM (SELECT DISTINCT d.exercise_year, d.is_leap_day
                 FROM app.second_home_date d
                WHERE d.second_home_id = NEW.second_home_id
                  AND d.stay_date >= NEW.checkin_date AND d.stay_date < NEW.checkout_date) n
        WHERE NOT coalesce(
          app.use_window_opens_at(NEW.second_home_id, h.stake_id, n.exercise_year, n.is_leap_day) <= v_at, false)) THEN
    RAISE EXCEPTION 'the use window of the stake is not open'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'window_not_open';
  END IF;
  NEW.confirmed_at := v_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_occupancy_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_custody app.date_custody; b app.booking; v_app boolean := NOT app.acts_as_schema_owner();
BEGIN
  IF NEW.released_at IS NOT NULL OR NEW.release_reason IS NOT NULL OR NEW.released_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'an occupancy opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_opens_active';
  END IF;
  IF v_app THEN
    -- W12: a aplicação só grava a ocupação `own_use` da reserva da mesma operação, da mesma Ação e dentro do período.
    IF NEW.channel <> 'own_use' THEN
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    b := app.assert_own_use_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
    IF b.id <> NEW.booking_id OR b.stake_id IS DISTINCT FROM NEW.stake_id THEN
      RAISE EXCEPTION 'an own use occupancy belongs to the booking of the same operation and stake'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_occupancy_binding';
    END IF;
  END IF;
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  -- TECH-053: o command já travou a noite (classe 5); aqui só a custódia (classe 6), contra o fechamento concorrente.
  SELECT * INTO v_custody FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR v_custody.closed_at IS NOT NULL
     OR v_custody.second_home_id <> NEW.second_home_id OR v_custody.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'an occupancy references the active custody of the same night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_active';
  END IF;
  -- D4 (ADR-0026): `reserved_right` devolvido — aberto por outra operação — só recebe nova ocupação na wave que produzir
  -- validamente esse estado (W21/W22), com o teste da TECH-023.
  IF v_app AND v_custody.holder_kind = 'use_right'
     AND v_custody.opened_by_operation <> NEW.opened_by_operation THEN
    RAISE EXCEPTION 'own use over a returned reserved right is not enabled before its wave'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_reserved_right_reuse';
  END IF;
  IF NOT app.occupancy_pair_valid(NEW, v_custody) THEN
    RAISE EXCEPTION 'occupancy and custody pair outside the TECH-023 matrix'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_matrix';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.assert_booking_complete(p_booking uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE b app.booking; v_nights integer; v_longest integer;
BEGIN
  SELECT * INTO STRICT b FROM app.booking WHERE id = p_booking;
  v_nights := b.checkout_date - b.checkin_date;
  IF (SELECT count(*) FROM app.date_occupancy o
       WHERE o.booking_id = b.id AND o.channel = 'own_use' AND o.opened_by_operation = b.opened_by_operation
         AND o.stay_date >= b.checkin_date AND o.stay_date < b.checkout_date) <> v_nights
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.booking_id = b.id
                   AND (o.channel <> 'own_use' OR o.opened_by_operation <> b.opened_by_operation
                        OR o.stay_date < b.checkin_date OR o.stay_date >= b.checkout_date)) THEN
    RAISE EXCEPTION 'every night of a booking has exactly one occupancy of it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_occupancy_complete';
  END IF;
  IF b.stake_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = b.opened_by_operation)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.opened_by_operation = b.opened_by_operation)
       OR EXISTS (SELECT 1 FROM app.date_custody c WHERE c.closed_by_operation = b.opened_by_operation) THEN
      RAISE EXCEPTION 'an Owner booking moves neither custody nor use right'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_owner_effects';
    END IF;
    RETURN;
  END IF;
  IF (SELECT count(*) FROM app.use_right_ledger l WHERE l.operation_id = b.opened_by_operation) <> v_nights
     OR (SELECT count(*) FROM app.use_right_ledger l
          WHERE l.operation_id = b.opened_by_operation AND l.movement = 'consume' AND l.stake_id = b.stake_id
            AND l.stay_date >= b.checkin_date AND l.stay_date < b.checkout_date) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = b.opened_by_operation) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c
          WHERE c.opened_by_operation = b.opened_by_operation AND c.holder_kind = 'use_right'
            AND c.basis = 'reserved_right' AND c.stake_id = b.stake_id
            AND c.stay_date >= b.checkin_date AND c.stay_date < b.checkout_date) <> v_nights
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = b.opened_by_operation) <> v_nights THEN
    RAISE EXCEPTION 'every night of a Co-Owner booking has its reserved right and one consumption'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_consumption_complete';
  END IF;
  WITH n AS (
    SELECT o.stay_date FROM app.date_occupancy o
     WHERE o.second_home_id = b.second_home_id AND o.stake_id = b.stake_id AND o.channel = 'own_use'
       AND o.released_at IS NULL
       AND o.stay_date >= b.checkin_date - 15 AND o.stay_date < b.checkout_date + 15
  ), g AS (
    SELECT n.stay_date, n.stay_date - (row_number() OVER (ORDER BY n.stay_date))::integer AS island FROM n
  )
  SELECT max(s.nights) INTO v_longest
    FROM (SELECT count(*) AS nights FROM g GROUP BY g.island
           HAVING bool_or(g.stay_date >= b.checkin_date AND g.stay_date < b.checkout_date)) s;
  -- BR-111, TECH-045.
  IF v_longest > 14 THEN
    RAISE EXCEPTION 'consecutive or adjacent Co-Owner bookings form one stay of at most 14 nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stay_length_maximum';
  END IF;
END $$;

DROP FUNCTION app.assert_luxchange_request_destination_complete(uuid, boolean);

CREATE OR REPLACE FUNCTION app.booking_state_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.booking_state_transition;
BEGIN
  IF (NEW.id, NEW.second_home_id, NEW.channel, NEW.holding_id, NEW.stake_id, NEW.checkin_date, NEW.checkout_date,
      NEW.opened_by_operation, NEW.confirmed_at)
     IS DISTINCT FROM
     (OLD.id, OLD.second_home_id, OLD.channel, OLD.holding_id, OLD.stake_id, OLD.checkin_date, OLD.checkout_date,
      OLD.opened_by_operation, OLD.confirmed_at) THEN
    RAISE EXCEPTION 'only the projected state of a booking changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_history_immutable';
  END IF;
  SELECT * INTO t FROM app.booking_state_transition WHERE id = NEW.last_transition_id;
  IF NOT FOUND OR t.booking_id <> NEW.id OR t.previous_transition_id IS DISTINCT FROM OLD.last_transition_id
     OR t.from_state <> OLD.state OR t.to_state <> NEW.state
     OR (OLD.cancellation_class IS NOT NULL AND t.cancellation_class IS NOT NULL)
     OR NEW.cancellation_class IS DISTINCT FROM coalesce(OLD.cancellation_class, t.cancellation_class) THEN
    RAISE EXCEPTION 'the booking state follows its last transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_projection';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.luxchange_complement_occupancy_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF app.acts_as_schema_owner() OR NEW.channel <> 'own_use' THEN
    RETURN NEW;
  END IF;
  PERFORM app.lock_night(NEW.second_home_id, NEW.stay_date, true);
  IF app.luxchange_complement_effective(NEW.second_home_id, NEW.stay_date) IS NOT NULL THEN
    RAISE EXCEPTION 'the night is committed to a pending Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_committed_to_request';
  END IF;
  RETURN NEW;
END $$;

DROP POLICY booking_requester_read ON app.booking;
ALTER TABLE app.booking
  DROP CONSTRAINT booking_requester_channel,
  DROP CONSTRAINT booking_holding_channel,
  ALTER COLUMN holding_id SET NOT NULL,
  DROP COLUMN party_id;

CREATE OR REPLACE FUNCTION app.credit_lot_originate() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; v_resolved_at timestamptz; v_months text;
BEGIN
  PERFORM app.assert_credits_active();
  PERFORM app.assert_operation_in_transaction(NEW.origin_operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.origin_operation_id;
  IF op.command NOT IN ('deposit_capacity', 'accept_request') OR op.acting_party_id IS DISTINCT FROM NEW.party_id
     OR op.actor_user_id IS NULL THEN
    RAISE EXCEPTION 'credits originate only from a deposit or an accepted Request, to the party that acts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_origin';
  END IF;
  PERFORM app.lock_own_use_representation(op.actor_user_id, NEW.party_id, clock_timestamp());
  SELECT s.resolved_at, p.value INTO v_resolved_at, v_months
    FROM app.economic_snapshot s
    JOIN app.economic_snapshot_parameter sp
      ON sp.operation_id = s.operation_id AND sp.parameter_key = 'credit_validity_months'
    JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE s.operation_id = NEW.origin_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the origination records the credit validity in the snapshot of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_snapshot_missing';
  END IF;
  IF op.command = 'accept_request' THEN
    -- W20 auditoria (ADR-0036 §7): o aceite só origina com a K7; as regras de lastro (cessão, Garantia) são da W22.
    PERFORM app.assert_luxchange_exchange_active();
  END IF;
  IF op.command = 'deposit_capacity' AND NOT app.luxchange_deposit_quantity_matches(op.id, NEW.quantity) THEN
    -- W20 (ADR-0036 §5; BR-201, `01` §20): Créditos = Σ PRL das noites do snapshot × multiplicador do snapshot.
    RAISE EXCEPTION 'deposit credits are the PRL of the snapshot nights times the snapshot multiplier'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_deposit_quantity';
  END IF;
  NEW.originated_at := v_resolved_at;
  NEW.expires_at := app.credit_expires_at(v_resolved_at, v_months::integer);
  NEW.held := 0;
  NEW.consumed := 0;
  NEW.expired := 0;
  NEW.origin_command := op.command;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.credit_invariant_breaches()
  RETURNS TABLE (invariant text, lot_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  -- Exatamente uma originação, com a quantidade e a operação do lote.
  SELECT 'INV-6/origination', l.id, count(e.id)::text
    FROM app.credit_lot l
    LEFT JOIN app.credit_entry e ON e.lot_id = l.id AND e.movement = 'originate'
   GROUP BY l.id, l.quantity, l.origin_operation_id
  HAVING count(e.id) <> 1 OR bool_or(e.quantity <> l.quantity OR e.operation_id <> l.origin_operation_id)
  UNION ALL
  -- Buckets iguais à soma do ledger.
  SELECT 'INV-6/buckets', l.id, concat_ws('/', l.held, l.consumed, l.expired)
    FROM app.credit_lot l
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(CASE WHEN e.to_bucket = 'held' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'held' THEN e.quantity END), 0) AS held,
             coalesce(sum(CASE WHEN e.to_bucket = 'consumed' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'consumed' THEN e.quantity END), 0) AS consumed,
             coalesce(sum(CASE WHEN e.to_bucket = 'expired' THEN e.quantity END), 0) AS expired
        FROM app.credit_entry e WHERE e.lot_id = l.id
    ) s ON true
   WHERE (l.held, l.consumed, l.expired) IS DISTINCT FROM (s.held, s.consumed, s.expired)
  UNION ALL
  -- Nenhum movimento-filho acima do pai.
  SELECT 'INV-6/parent', p.lot_id, p.id::text
    FROM app.credit_entry p
    JOIN app.credit_entry c ON c.parent_entry_id = p.id
   GROUP BY p.id, p.lot_id, p.quantity
  HAVING sum(c.quantity) > p.quantity
  UNION ALL
  -- Origem identificável: command de originação da party que age.
  SELECT 'INV-6/origin', l.id, o.command
    FROM app.credit_lot l JOIN app.operation o ON o.id = l.origin_operation_id
   WHERE o.command NOT IN ('deposit_capacity', 'accept_request') OR o.acting_party_id IS DISTINCT FROM l.party_id
      OR o.command <> l.origin_command
  UNION ALL
  -- TECH-044: validade igual à adição calendárica da versão registrada no snapshot.
  SELECT 'TECH-044/validity', l.id, l.expires_at::text
    FROM app.credit_lot l
    LEFT JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
    LEFT JOIN app.economic_snapshot_parameter sp
      ON sp.operation_id = s.operation_id AND sp.parameter_key = 'credit_validity_months'
    LEFT JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE p.id IS NULL OR l.originated_at <> s.resolved_at
      OR l.expires_at <> app.credit_expires_at(s.resolved_at, p.value::integer)
$$;

DROP FUNCTION app.luxchange_request_lot_quantity_matches(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION app.settlement_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; f app.fee_charge; fee_op text;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  NEW.created_at := clock_timestamp();
  IF app.acts_as_schema_owner() THEN
    RETURN NEW;
  END IF;
  IF NEW.kind <> 'luxchange_fee' THEN
    RAISE EXCEPTION 'settlement category % is not enabled', NEW.kind
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'settlement_kind_not_enabled';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO STRICT f FROM app.fee_charge WHERE id = NEW.fee_charge_id;
  SELECT o.command INTO fee_op FROM app.operation o WHERE o.id = f.operation_id;
  IF NOT ((op.command = 'create_direct' AND f.operation_id = NEW.operation_id)
          OR (op.command = 'accept_request' AND fee_op = 'send_request')) THEN
    RAISE EXCEPTION 'the Fee is settled when its Request is accepted or its Direct confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_origin';
  END IF;
  PERFORM 1 FROM app.payment WHERE id = f.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.fee_charge_reversal r WHERE r.fee_charge_id = f.id) THEN
    RAISE EXCEPTION 'a reversed Fee is not settled'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_reversed';
  END IF;
  IF NEW.amount_minor <> f.amount_minor OR NEW.currency <> f.currency THEN
    RAISE EXCEPTION 'the Fee is settled for its charged amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_fee_amount';
  END IF;
  RETURN NEW;
END $$;
