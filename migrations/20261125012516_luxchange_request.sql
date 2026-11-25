-- migrate:up
-- W21 (REQ-062, PD-005, PD-007, PD-012; TECH-022, TECH-024, TECH-031, TECH-043, TECH-044, TECH-053, TECH-055, TECH-070,
-- TECH-071, TECH-073, TECH-082, TECH-090; ADR-0037; spec luxchange §13): lastro da Request no banco.
-- Envio: snapshot com as noites solicitadas (só elas), parâmetros e política aceita; Request com N conferido pelo banco,
-- complemento por datas comprometido sob a condição do aceite (P conferido por noite), Garantia por FEFO vinculada à
-- Request (G = max(0, N − P); C e E gerados), Fee sobre as noites solicitadas, consentimento igual ao que o banco recompõe
-- e completude no COMMIT. Encerramento pré-aceite (retirada, expiração, perda de elegibilidade provada desde o envio):
-- libera a Garantia inteira e os compromissos e reverte o Fee com estorno integral, na mesma transação. Compromisso
-- efetivo pelo relógio do banco e pela prova de inelegibilidade (nada fica preso por job); ramos de recusa nos atos do
-- Titular das W12/W13/W20. Chaves fechadas só impedem compromisso novo (ADR-0037 §10). Nenhum ramo de escrita do aceite ou
-- da recusa (W22). `search_path = pg_catalog, pg_temp` em toda função nova.

-- 1. Tabelas -------------------------------------------------------------------------------------------------------------

-- Política aceita no envio (obrigação da W18): a versão `luxchange_request` vigente no instante da resolução.
CREATE TABLE app.economic_snapshot_policy (
  operation_id uuid PRIMARY KEY REFERENCES app.economic_snapshot(operation_id),
  policy_id uuid NOT NULL REFERENCES app.commercial_policy(id)
);

CREATE TABLE app.luxchange_request (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  requester_party_id uuid NOT NULL REFERENCES app.party(id),
  holder_party_id uuid NOT NULL REFERENCES app.party(id),
  holder_holding_id uuid NOT NULL REFERENCES app.holding(id),
  second_home_id uuid NOT NULL,
  checkin date NOT NULL,
  checkout date NOT NULL,
  -- N, G e P (TECH-073): N conferido na inserção; P e G no COMMIT; C e E derivados.
  credits_required numeric NOT NULL,
  guarantee_credits numeric NOT NULL,
  complement_credits numeric NOT NULL,
  complement_consumption numeric GENERATED ALWAYS AS (credits_required - guarantee_credits) STORED,
  complement_excess numeric GENERATED ALWAYS AS (complement_credits - (credits_required - guarantee_credits)) STORED,
  sent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL,
  closure_reason text,
  last_transition_id uuid,
  closed_by_operation uuid REFERENCES app.operation(id),
  closed_at timestamptz,
  CONSTRAINT luxchange_request_operation_unique UNIQUE (operation_id),
  CONSTRAINT luxchange_request_first_night FOREIGN KEY (second_home_id, checkin)
    REFERENCES app.second_home_date(second_home_id, stay_date),
  CONSTRAINT luxchange_request_parties CHECK (requester_party_id <> holder_party_id),
  CONSTRAINT luxchange_request_period CHECK (checkout > checkin AND checkout - checkin <= 366),
  CONSTRAINT luxchange_request_credits CHECK (
    credits_required > 0 AND guarantee_credits >= 0 AND complement_credits >= 0),
  CONSTRAINT luxchange_request_guarantee CHECK (
    guarantee_credits = greatest(credits_required - complement_credits, 0)),
  CONSTRAINT luxchange_request_deadline CHECK (expires_at > sent_at),
  CONSTRAINT luxchange_request_state CHECK (state IN ('pending', 'expired', 'cancelled_pre_accept')),
  CONSTRAINT luxchange_request_closure CHECK (
    (state = 'pending') = (closure_reason IS NULL AND last_transition_id IS NULL AND closed_by_operation IS NULL
                           AND closed_at IS NULL))
);
CREATE INDEX luxchange_request_pending_idx ON app.luxchange_request (expires_at) WHERE state = 'pending';
CREATE INDEX luxchange_request_requester_idx ON app.luxchange_request (requester_party_id);
CREATE INDEX luxchange_request_holder_idx ON app.luxchange_request (holder_party_id);

-- Único evento de estado da Request na W21 (todo encerramento é terminal); o banco decide estado, motivo e prova.
CREATE TABLE app.luxchange_request_transition (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES app.luxchange_request(id),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text NOT NULL,
  evidence_kind text NOT NULL,
  evidence_id uuid,
  created_at timestamptz NOT NULL,
  CONSTRAINT conflict_luxchange_request_closed UNIQUE (request_id),
  CONSTRAINT luxchange_request_transition_pair CHECK (from_state = 'pending' AND (
    (to_state = 'expired' AND reason = 'expired')
    OR (to_state = 'cancelled_pre_accept' AND reason IN ('withdrawn', 'period_started', 'requester_membership',
        'holder_membership', 'capacity_unavailable', 'complement_unavailable')))),
  CONSTRAINT luxchange_request_transition_evidence CHECK (evidence_kind IN ('clock', 'actor', 'membership_transition',
    'holding', 'custody', 'occupancy', 'booking_transition', 'complement_night'))
);
ALTER TABLE app.luxchange_request
  ADD CONSTRAINT luxchange_request_last_transition FOREIGN KEY (last_transition_id)
    REFERENCES app.luxchange_request_transition(id);

-- Noites solicitadas, com a custódia do detentor no envio (TECH-023) e a reserva Co-Owner.
CREATE TABLE app.luxchange_request_night (
  request_id uuid NOT NULL REFERENCES app.luxchange_request(id),
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  custody_id uuid NOT NULL,
  booking_id uuid REFERENCES app.booking(id),
  CONSTRAINT luxchange_request_night_pkey PRIMARY KEY (request_id, stay_date),
  CONSTRAINT luxchange_request_night_custody FOREIGN KEY (custody_id, second_home_id, stay_date)
    REFERENCES app.date_custody(id, second_home_id, stay_date)
);
CREATE INDEX luxchange_request_night_date_idx ON app.luxchange_request_night (second_home_id, stay_date);

-- Complemento por datas (PD-012): unidade = noite Owner livre ou reserva Co-Owner inteira; uma unidade ativa por noite e
-- por reserva (exclusividade física; a eficácia é o predicado `luxchange_complement_effective`).
CREATE TABLE app.luxchange_request_complement_unit (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES app.luxchange_request(id),
  kind text NOT NULL,
  holding_id uuid NOT NULL REFERENCES app.holding(id),
  booking_id uuid REFERENCES app.booking(id),
  potential_credits numeric NOT NULL,
  state text NOT NULL,
  closed_by_operation uuid REFERENCES app.operation(id),
  CONSTRAINT luxchange_complement_unit_request UNIQUE (id, request_id),
  CONSTRAINT luxchange_complement_unit_kind CHECK (
    kind IN ('owner_night', 'co_owner_booking') AND (kind = 'owner_night') = (booking_id IS NULL)),
  CONSTRAINT luxchange_complement_unit_potential CHECK (potential_credits > 0),
  CONSTRAINT luxchange_complement_unit_state CHECK (
    state IN ('active', 'released', 'consumed') AND (state = 'active') = (closed_by_operation IS NULL))
);
CREATE INDEX luxchange_complement_unit_request_idx ON app.luxchange_request_complement_unit (request_id);
CREATE UNIQUE INDEX luxchange_complement_booking_active
  ON app.luxchange_request_complement_unit (booking_id) WHERE state = 'active';

CREATE TABLE app.luxchange_request_complement_night (
  unit_id uuid NOT NULL,
  request_id uuid NOT NULL,
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  custody_id uuid NOT NULL,
  prl_id uuid NOT NULL REFERENCES app.prl(id),
  potential_credits numeric NOT NULL,
  state text NOT NULL,
  CONSTRAINT luxchange_complement_night_pkey PRIMARY KEY (unit_id, stay_date),
  CONSTRAINT luxchange_complement_night_unit FOREIGN KEY (unit_id, request_id)
    REFERENCES app.luxchange_request_complement_unit(id, request_id),
  CONSTRAINT luxchange_complement_night_custody FOREIGN KEY (custody_id, second_home_id, stay_date)
    REFERENCES app.date_custody(id, second_home_id, stay_date),
  CONSTRAINT luxchange_complement_night_potential CHECK (potential_credits > 0),
  CONSTRAINT luxchange_complement_night_state CHECK (state IN ('active', 'released', 'consumed'))
);
CREATE INDEX luxchange_complement_night_request_idx ON app.luxchange_request_complement_night (request_id);
CREATE UNIQUE INDEX luxchange_complement_night_active
  ON app.luxchange_request_complement_night (second_home_id, stay_date) WHERE state = 'active';

-- Consentimento (PD-012 item 4): versão do texto e o que foi apresentado; o `expires_at` fica na Request (resultado do
-- envio), nunca no consentimento.
CREATE TABLE app.luxchange_request_consent (
  request_id uuid PRIMARY KEY REFERENCES app.luxchange_request(id),
  text_version text NOT NULL,
  terms jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT luxchange_request_consent_version CHECK (text_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CONSTRAINT luxchange_request_consent_terms CHECK (
    jsonb_typeof(terms) = 'object' AND octet_length(terms::text) <= 131072)
);

-- 2. Funções de leitura --------------------------------------------------------------------------------------------------

-- Valor de um parâmetro registrado no snapshot da operação (texto canônico de `app.parameter`).
CREATE FUNCTION app.luxchange_snapshot_parameter(p_operation uuid, p_key text) RETURNS text
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p.value FROM app.economic_snapshot_parameter sp JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE sp.operation_id = p_operation AND sp.parameter_key = p_key
$$;

-- Créditos exatos de uma noite pelo PRL (unidade mínima, BRL com 2 casas) e pelo multiplicador (`01` §20, TECH-033).
CREATE FUNCTION app.luxchange_night_credits(p_amount_minor bigint, p_multiplier text) RETURNS numeric
  LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp
AS $$
  SELECT trim_scale(p_amount_minor::numeric * p_multiplier::numeric / 100)
$$;

-- Termos da Request recompostos pelo banco, na forma canônica do consentimento (decimais sem zeros à direita). O
-- consentimento gravado precisa ser exatamente este documento (TECH-073).
CREATE FUNCTION app.luxchange_request_terms(p_request uuid) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'credits_required', trim_scale(r.credits_required)::text,
    'guarantee_credits', trim_scale(r.guarantee_credits)::text,
    'complement_credits', trim_scale(r.complement_credits)::text,
    'complement_consumption', trim_scale(r.complement_consumption)::text,
    'complement_excess', trim_scale(r.complement_excess)::text,
    'fee_amount_minor', (SELECT f.amount_minor::text FROM app.fee_charge f WHERE f.operation_id = r.operation_id),
    'fee_currency', (SELECT f.currency FROM app.fee_charge f WHERE f.operation_id = r.operation_id),
    'deadline_hours', app.luxchange_snapshot_parameter(r.operation_id, 'request_deadline_hours'),
    'credit_validity_months', app.luxchange_snapshot_parameter(r.operation_id, 'credit_validity_months'),
    'policy_id', (SELECT p.policy_id::text FROM app.economic_snapshot_policy p WHERE p.operation_id = r.operation_id),
    'requested_nights', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'date', n.stay_date::text,
               'credits', app.luxchange_night_credits(l.amount_minor,
                            app.luxchange_snapshot_parameter(r.operation_id, 'credit_multiplier'))::text)
             ORDER BY n.stay_date)
        FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
       WHERE n.operation_id = r.operation_id), '[]'::jsonb),
    'complement_nights', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'second_home_id', c.second_home_id::text, 'date', c.stay_date::text,
               'credits', trim_scale(c.potential_credits)::text)
             ORDER BY c.second_home_id, c.stay_date)
        FROM app.luxchange_request_complement_night c WHERE c.request_id = r.id), '[]'::jsonb))
    FROM app.luxchange_request r WHERE r.id = p_request
$$;

-- Por que a Request não pode mais ser aceita (TECH-024, TECH-044): vencida pelo relógio do banco, período iniciado, ou
-- inelegibilidade provada por fato registrado desde o envio. NULL = ainda pode ser aceita. Ordem fixa (determinística).
CREATE FUNCTION app.luxchange_request_closure_reason(p_request uuid,
  OUT reason text, OUT evidence_kind text, OUT evidence_id uuid)
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; v_now timestamptz := clock_timestamp(); v_id uuid;
BEGIN
  SELECT * INTO r FROM app.luxchange_request WHERE id = p_request;
  IF NOT FOUND OR r.state <> 'pending' THEN
    RETURN;
  END IF;
  IF v_now >= r.expires_at THEN
    reason := 'expired'; evidence_kind := 'clock'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM app.second_home_date d
              WHERE d.second_home_id = r.second_home_id AND d.stay_date = r.checkin AND d.checkin_at <= v_now) THEN
    reason := 'period_started'; evidence_kind := 'clock'; RETURN;
  END IF;
  SELECT t.operation_id INTO v_id FROM app.membership_transition t
   WHERE t.party_id = r.requester_party_id AND t.to_state <> 'active' AND t.recorded_at >= r.sent_at
   ORDER BY t.recorded_at, t.operation_id LIMIT 1;
  IF FOUND THEN
    reason := 'requester_membership'; evidence_kind := 'membership_transition'; evidence_id := v_id; RETURN;
  END IF;
  SELECT t.operation_id INTO v_id FROM app.membership_transition t
   WHERE t.party_id = r.holder_party_id AND t.to_state <> 'active' AND t.recorded_at >= r.sent_at
   ORDER BY t.recorded_at, t.operation_id LIMIT 1;
  IF FOUND THEN
    reason := 'holder_membership'; evidence_kind := 'membership_transition'; evidence_id := v_id; RETURN;
  END IF;
  -- Capacidade solicitada.
  SELECT h.id INTO v_id FROM app.holding h
   WHERE h.id = r.holder_holding_id AND h.valid_until IS NOT NULL AND h.valid_until <= v_now;
  IF FOUND THEN
    reason := 'capacity_unavailable'; evidence_kind := 'holding'; evidence_id := v_id; RETURN;
  END IF;
  SELECT n.custody_id INTO v_id FROM app.luxchange_request_night n JOIN app.date_custody c ON c.id = n.custody_id
   WHERE n.request_id = r.id AND c.closed_at IS NOT NULL ORDER BY n.stay_date LIMIT 1;
  IF FOUND THEN
    reason := 'capacity_unavailable'; evidence_kind := 'custody'; evidence_id := v_id; RETURN;
  END IF;
  SELECT o.id INTO v_id FROM app.luxchange_request_night n
    JOIN app.date_occupancy o ON o.second_home_id = n.second_home_id AND o.stay_date = n.stay_date
    JOIN app.booking b ON b.id = o.booking_id
   WHERE n.request_id = r.id AND n.booking_id IS NULL AND b.confirmed_at >= r.sent_at ORDER BY n.stay_date LIMIT 1;
  IF FOUND THEN
    reason := 'capacity_unavailable'; evidence_kind := 'occupancy'; evidence_id := v_id; RETURN;
  END IF;
  SELECT t.id INTO v_id FROM app.booking_state_transition t
   WHERE t.booking_id IN (SELECT n.booking_id FROM app.luxchange_request_night n
                           WHERE n.request_id = r.id AND n.booking_id IS NOT NULL)
     AND t.recorded_at >= r.sent_at ORDER BY t.recorded_at, t.id LIMIT 1;
  IF FOUND THEN
    reason := 'capacity_unavailable'; evidence_kind := 'booking_transition'; evidence_id := v_id; RETURN;
  END IF;
  SELECT u.id INTO v_id FROM app.luxchange_request_night n
    JOIN app.luxchange_request_complement_night c ON c.second_home_id = n.second_home_id AND c.stay_date = n.stay_date
    JOIN app.luxchange_request_complement_unit u ON u.id = c.unit_id
    JOIN app.luxchange_request q ON q.id = c.request_id
   WHERE n.request_id = r.id AND q.id <> r.id AND q.sent_at >= r.sent_at ORDER BY n.stay_date, u.id LIMIT 1;
  IF FOUND THEN
    reason := 'capacity_unavailable'; evidence_kind := 'complement_night'; evidence_id := v_id; RETURN;
  END IF;
  -- Complemento por datas.
  SELECT h.id INTO v_id FROM app.luxchange_request_complement_unit u JOIN app.holding h ON h.id = u.holding_id
   WHERE u.request_id = r.id AND h.valid_until IS NOT NULL AND h.valid_until <= v_now ORDER BY u.id LIMIT 1;
  IF FOUND THEN
    reason := 'complement_unavailable'; evidence_kind := 'holding'; evidence_id := v_id; RETURN;
  END IF;
  SELECT c.custody_id INTO v_id FROM app.luxchange_request_complement_night c JOIN app.date_custody d ON d.id = c.custody_id
   WHERE c.request_id = r.id AND d.closed_at IS NOT NULL ORDER BY c.second_home_id, c.stay_date LIMIT 1;
  IF FOUND THEN
    reason := 'complement_unavailable'; evidence_kind := 'custody'; evidence_id := v_id; RETURN;
  END IF;
  SELECT o.id INTO v_id FROM app.luxchange_request_complement_unit u
    JOIN app.luxchange_request_complement_night c ON c.unit_id = u.id
    JOIN app.date_occupancy o ON o.second_home_id = c.second_home_id AND o.stay_date = c.stay_date
    JOIN app.booking b ON b.id = o.booking_id
   WHERE u.request_id = r.id AND u.kind = 'owner_night' AND b.confirmed_at >= r.sent_at ORDER BY c.stay_date LIMIT 1;
  IF FOUND THEN
    reason := 'complement_unavailable'; evidence_kind := 'occupancy'; evidence_id := v_id; RETURN;
  END IF;
  SELECT t.id INTO v_id FROM app.booking_state_transition t
   WHERE t.booking_id IN (SELECT u.booking_id FROM app.luxchange_request_complement_unit u
                           WHERE u.request_id = r.id AND u.booking_id IS NOT NULL)
     AND t.recorded_at >= r.sent_at ORDER BY t.recorded_at, t.id LIMIT 1;
  IF FOUND THEN
    reason := 'complement_unavailable'; evidence_kind := 'booking_transition'; evidence_id := v_id; RETURN;
  END IF;
END $$;

-- Compromisso efetivo (TECH-024): ativo, da Request pendente que ainda pode ser aceita. Só lê (nenhuma trava).
CREATE FUNCTION app.luxchange_complement_effective(p_second_home_id uuid, p_stay_date date) RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.request_id FROM app.luxchange_request_complement_night c
    JOIN app.luxchange_request r ON r.id = c.request_id
   WHERE c.second_home_id = p_second_home_id AND c.stay_date = p_stay_date AND c.state = 'active'
     AND r.state = 'pending' AND (app.luxchange_request_closure_reason(r.id)).reason IS NULL
   LIMIT 1
$$;

CREATE FUNCTION app.luxchange_complement_effective_booking(p_booking uuid) RETURNS uuid
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.request_id FROM app.luxchange_request_complement_unit u
    JOIN app.luxchange_request r ON r.id = u.request_id
   WHERE u.booking_id = p_booking AND u.state = 'active'
     AND r.state = 'pending' AND (app.luxchange_request_closure_reason(r.id)).reason IS NULL
   LIMIT 1
$$;

-- Operação de envio da Request: pendente, da transação do snapshot (identidade pelo `xmin`, ADR-0036 §3).
CREATE FUNCTION app.luxchange_request_send_write(p_request uuid) RETURNS app.luxchange_request
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request;
BEGIN
  SELECT * INTO r FROM app.luxchange_request WHERE id = p_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the fact belongs to an existing Request'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'luxchange_request_reference';
  END IF;
  PERFORM app.assert_operation_in_transaction(r.operation_id);
  IF NOT app.economic_snapshot_in_current_transaction(r.operation_id) THEN
    RAISE EXCEPTION 'Request facts are recorded in the transaction of its snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_transaction';
  END IF;
  RETURN r;
END $$;

-- Travas consultivas com as chaves do `LockSequence` (TECH-053; `advisory-locks.ts`): reentrantes para o command, que
-- já as tomou na ordem total; serializam qualquer escrita que não as tenha tomado.
CREATE FUNCTION app.lock_night(p_second_home_id uuid, p_stay_date date, p_shared boolean) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_key bigint := hashtextextended('app.second_home_date:' || lower(p_second_home_id::text) || ':'
                                         || to_char(p_stay_date, 'YYYY-MM-DD'), 0);
BEGIN
  IF p_shared THEN
    PERFORM pg_advisory_xact_lock_shared(v_key);
  ELSE
    PERFORM pg_advisory_xact_lock(v_key);
  END IF;
END $$;

CREATE FUNCTION app.lock_booking(p_booking uuid, p_shared boolean) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_key bigint := hashtextextended('app.booking:' || lower(p_booking::text), 0);
BEGIN
  IF p_shared THEN
    PERFORM pg_advisory_xact_lock_shared(v_key);
  ELSE
    PERFORM pg_advisory_xact_lock(v_key);
  END IF;
END $$;

-- 3. Gatilhos do envio ---------------------------------------------------------------------------------------------------

CREATE FUNCTION app.economic_snapshot_policy_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; v_resolved timestamptz; v_policy uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'send_request' THEN
    RAISE EXCEPTION 'only a Request records its accepted policy in the snapshot (W21)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_policy_mechanism';
  END IF;
  IF NOT app.economic_snapshot_in_current_transaction(NEW.operation_id) THEN
    RAISE EXCEPTION 'the accepted policy is recorded in the transaction of the snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_policy_transaction';
  END IF;
  SELECT s.resolved_at INTO STRICT v_resolved FROM app.economic_snapshot s WHERE s.operation_id = NEW.operation_id;
  SELECT p.id INTO v_policy FROM app.commercial_policy_at('luxchange_request', v_resolved) p;
  IF v_policy IS DISTINCT FROM NEW.policy_id THEN
    RAISE EXCEPTION 'the snapshot records the Request policy in force when the terms were resolved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_policy_version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER economic_snapshot_policy_write BEFORE INSERT ON app.economic_snapshot_policy
  FOR EACH ROW EXECUTE FUNCTION app.economic_snapshot_policy_write();

CREATE FUNCTION app.luxchange_request_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; h app.holding; v_at timestamptz; v_state text; v_checkin timestamptz; v_hours text;
BEGIN
  -- Compromisso novo: K4 (Garantia), K5 (Fee) e K7 (intercâmbio); o complemento exige também a K6 (ADR-0037 §10).
  PERFORM app.assert_credits_active();
  PERFORM app.assert_payments_active();
  PERFORM app.assert_luxchange_exchange_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'send_request' OR op.role <> 'titular' OR op.actor_user_id IS NULL
     OR op.acting_party_id IS DISTINCT FROM NEW.requester_party_id
     OR op.second_home_id IS DISTINCT FROM NEW.second_home_id THEN
    RAISE EXCEPTION 'a Request is sent by a send_request operation of the requester for the requested Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_binding';
  END IF;
  IF NOT app.economic_snapshot_in_current_transaction(op.id) THEN
    RAISE EXCEPTION 'Request facts are recorded in the transaction of its snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_transaction';
  END IF;
  v_at := clock_timestamp();
  PERFORM app.lock_own_use_representation(op.actor_user_id, NEW.requester_party_id, v_at);
  -- TECH-050/051: o solicitante é Titular (holding vigente em qualquer Second Home) com Membership elegível.
  IF NOT EXISTS (SELECT 1 FROM app.holding x WHERE x.party_id = NEW.requester_party_id AND x.valid_from <= v_at
                    AND (x.valid_until IS NULL OR v_at < x.valid_until)) THEN
    RAISE EXCEPTION 'the requester is a Titular with a current holding'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  PERFORM app.assert_credit_membership(NEW.requester_party_id);
  -- BR-211 aplicada no envio: quem age não representa o detentor.
  IF EXISTS (SELECT 1 FROM app.party_delegation d
              WHERE d.user_id = op.actor_user_id AND d.party_id = NEW.holder_party_id AND d.state = 'active'
                AND d.valid_from <= v_at AND (d.valid_until IS NULL OR v_at < d.valid_until)) THEN
    RAISE EXCEPTION 'the acting user also represents the holder'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_self_dealing';
  END IF;
  SELECT m.state INTO v_state FROM app.membership m WHERE m.party_id = NEW.holder_party_id FOR SHARE;
  IF v_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'the requested capacity belongs to a holder with an eligible Membership'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_holder_ineligible';
  END IF;
  SELECT * INTO h FROM app.holding WHERE id = NEW.holder_holding_id;
  IF NOT FOUND OR h.party_id <> NEW.holder_party_id OR h.second_home_id <> NEW.second_home_id OR h.valid_from > v_at
     OR (h.valid_until IS NOT NULL AND v_at >= h.valid_until) THEN
    RAISE EXCEPTION 'the requested capacity belongs to a current holding of the holder in the Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_holder_holding';
  END IF;
  -- Noites do snapshot = exatamente as noites solicitadas (as do complemento nunca entram nele).
  IF (SELECT count(*) FROM app.economic_snapshot_night n WHERE n.operation_id = op.id) <> NEW.checkout - NEW.checkin
     OR EXISTS (SELECT 1 FROM app.economic_snapshot_night n
                 WHERE n.operation_id = op.id AND (n.second_home_id <> NEW.second_home_id
                       OR n.stay_date < NEW.checkin OR n.stay_date >= NEW.checkout)) THEN
    RAISE EXCEPTION 'the snapshot nights are exactly the requested nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_snapshot_nights';
  END IF;
  IF (SELECT count(*) FROM app.economic_snapshot_parameter sp
       WHERE sp.operation_id = op.id AND sp.parameter_key IN ('credit_multiplier', 'credit_validity_months',
             'luxchange_fee_rate', 'luxchange_fee_minimum', 'request_deadline_hours')) <> 5
     OR NOT EXISTS (SELECT 1 FROM app.economic_snapshot_policy p WHERE p.operation_id = op.id) THEN
    RAISE EXCEPTION 'the snapshot records every binding term of the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_snapshot_terms';
  END IF;
  -- N = Σ PRL das noites solicitadas × multiplicador, ambos do snapshot (`01` §20), exato.
  IF NOT app.luxchange_deposit_quantity_matches(op.id, NEW.credits_required) THEN
    RAISE EXCEPTION 'the required credits are the PRL of the requested nights times the snapshot multiplier'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_credits_required';
  END IF;
  SELECT d.checkin_at INTO v_checkin FROM app.second_home_date d
   WHERE d.second_home_id = NEW.second_home_id AND d.stay_date = NEW.checkin;
  IF v_checkin IS NULL OR v_checkin <= v_at THEN
    RAISE EXCEPTION 'a Request asks for nights that have not started'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_period_started';
  END IF;
  -- TECH-044: o prazo nasce no envio, pelo relógio do banco, com a duração vinculada no snapshot.
  v_hours := app.luxchange_snapshot_parameter(op.id, 'request_deadline_hours');
  NEW.sent_at := v_at;
  NEW.expires_at := v_at + make_interval(hours => v_hours::integer);
  NEW.state := 'pending';
  NEW.closure_reason := NULL;
  NEW.last_transition_id := NULL;
  NEW.closed_by_operation := NULL;
  NEW.closed_at := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_request_open BEFORE INSERT ON app.luxchange_request
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_open();

CREATE FUNCTION app.luxchange_request_night_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; h app.holding; c app.date_custody; o app.date_occupancy; b app.booking;
BEGIN
  r := app.luxchange_request_send_write(NEW.request_id);
  IF NEW.second_home_id <> r.second_home_id OR NEW.stay_date < r.checkin OR NEW.stay_date >= r.checkout
     OR NOT EXISTS (SELECT 1 FROM app.economic_snapshot_night n
                     WHERE n.operation_id = r.operation_id AND n.stay_date = NEW.stay_date) THEN
    RAISE EXCEPTION 'a requested night is a night of the period priced in the snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_night_period';
  END IF;
  SELECT * INTO STRICT h FROM app.holding WHERE id = r.holder_holding_id;
  -- TECH-053: a noite solicitada (classe 5, compartilhada: Requests coexistem) e a custódia, antes de ler o estado.
  PERFORM app.lock_night(NEW.second_home_id, NEW.stay_date, true);
  IF NEW.booking_id IS NOT NULL THEN
    PERFORM app.lock_booking(NEW.booking_id, true);
  END IF;
  SELECT * INTO c FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR c.closed_at IS NOT NULL OR c.second_home_id <> NEW.second_home_id OR c.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'a requested night references its active custody'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_request_active';
  END IF;
  SELECT * INTO o FROM app.date_occupancy
   WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date AND released_at IS NULL;
  IF h.role = 'owner' THEN
    IF c.holder_kind <> 'owner' OR o.id IS NOT NULL OR NEW.booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'Owner capacity is requested only when free'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_request_source';
    END IF;
  ELSE
    SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id;
    IF c.holder_kind <> 'use_right' OR c.basis IS DISTINCT FROM 'reserved_right' OR c.stake_id IS DISTINCT FROM h.stake_id
       OR o.id IS NULL OR o.channel <> 'own_use' OR o.booking_id IS DISTINCT FROM NEW.booking_id
       OR b.id IS NULL OR b.state <> 'confirmed' OR b.stake_id IS DISTINCT FROM h.stake_id THEN
      RAISE EXCEPTION 'Co-Owner capacity is requested only as a confirmed booking of the holder'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_request_source';
    END IF;
  END IF;
  IF app.luxchange_complement_effective(NEW.second_home_id, NEW.stay_date) IS NOT NULL THEN
    RAISE EXCEPTION 'the night is committed to a pending Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_committed_to_request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_request_night_write BEFORE INSERT ON app.luxchange_request_night
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_night_write();

CREATE FUNCTION app.luxchange_complement_unit_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; h app.holding; b app.booking; v_at timestamptz := clock_timestamp();
BEGIN
  -- Cessão ao Inventário sob condição: a K6 também (ADR-0037 §10).
  PERFORM app.assert_luxchange_deposit_active();
  r := app.luxchange_request_send_write(NEW.request_id);
  SELECT * INTO h FROM app.holding WHERE id = NEW.holding_id;
  IF NOT FOUND OR h.party_id <> r.requester_party_id OR h.valid_from > v_at
     OR (h.valid_until IS NOT NULL AND v_at >= h.valid_until) OR (NEW.kind = 'owner_night') <> (h.role = 'owner') THEN
    RAISE EXCEPTION 'a complement unit belongs to a current holding of the requester'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  IF NEW.kind = 'co_owner_booking' THEN
    SELECT * INTO b FROM app.booking WHERE id = NEW.booking_id;
    IF NOT FOUND OR b.channel <> 'own_use' OR b.state <> 'confirmed' OR b.stake_id IS DISTINCT FROM h.stake_id THEN
      RAISE EXCEPTION 'a Co-Owner complement is a confirmed own use booking of the requester stake'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_booking';
    END IF;
  END IF;
  NEW.state := 'active';
  NEW.closed_by_operation := NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_complement_unit_write BEFORE INSERT ON app.luxchange_request_complement_unit
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_unit_write();

CREATE FUNCTION app.luxchange_complement_night_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  u app.luxchange_request_complement_unit;
  r app.luxchange_request;
  h app.holding;
  c app.date_custody;
  o app.date_occupancy;
  v_checkin timestamptz;
  v_resolved timestamptz;
  v_prl app.prl;
BEGIN
  SELECT * INTO u FROM app.luxchange_request_complement_unit WHERE id = NEW.unit_id;
  IF NOT FOUND OR u.request_id <> NEW.request_id THEN
    RAISE EXCEPTION 'a complement night belongs to a unit of the same Request'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'luxchange_complement_night_unit';
  END IF;
  r := app.luxchange_request_send_write(u.request_id);
  SELECT * INTO STRICT h FROM app.holding WHERE id = u.holding_id;
  IF NEW.second_home_id <> h.second_home_id THEN
    RAISE EXCEPTION 'a complement night belongs to the Second Home of its holding'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_night_home';
  END IF;
  -- TECH-053: a noite comprometida (classe 5, exclusiva) e a reserva (classe 6) antes de ler custódia e ocupação; a
  -- reserva própria, o cancelamento e o depósito tomam as mesmas travas antes de consultar o compromisso.
  PERFORM app.lock_night(NEW.second_home_id, NEW.stay_date, false);
  IF u.booking_id IS NOT NULL THEN
    PERFORM app.lock_booking(u.booking_id, true);
    IF (SELECT b.state FROM app.booking b WHERE b.id = u.booking_id) IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION 'a Co-Owner complement is a confirmed own use booking of the requester stake'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_booking';
    END IF;
  END IF;
  SELECT * INTO c FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR c.closed_at IS NOT NULL OR c.second_home_id <> NEW.second_home_id OR c.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'a complement night references its active custody'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_complement_active';
  END IF;
  SELECT * INTO o FROM app.date_occupancy
   WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date AND released_at IS NULL;
  IF u.kind = 'owner_night' THEN
    IF c.holder_kind <> 'owner' OR o.id IS NOT NULL THEN
      RAISE EXCEPTION 'an Owner complement night is free capacity of the requester'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_complement_source';
    END IF;
  ELSIF c.holder_kind <> 'use_right' OR c.basis IS DISTINCT FROM 'reserved_right' OR c.stake_id IS DISTINCT FROM h.stake_id
        OR o.id IS NULL OR o.channel <> 'own_use' OR o.booking_id IS DISTINCT FROM u.booking_id THEN
    RAISE EXCEPTION 'a Co-Owner complement night is a night of the committed booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_complement_source';
  END IF;
  -- BR-200/TECH-043 no instante máximo de aceite: a antecedência do depósito cumprida em `expires_at`.
  SELECT d.checkin_at INTO STRICT v_checkin FROM app.second_home_date d
   WHERE d.second_home_id = NEW.second_home_id AND d.stay_date = NEW.stay_date;
  IF NOT app.luxchange_deposit_notice_met(v_checkin, r.expires_at) THEN
    RAISE EXCEPTION 'a complement night meets the deposit notice at the latest acceptance instant'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_notice';
  END IF;
  -- PRL vigente no instante da resolução e Créditos potenciais exatos (PD-007, TECH-073).
  SELECT s.resolved_at INTO STRICT v_resolved FROM app.economic_snapshot s WHERE s.operation_id = r.operation_id;
  SELECT * INTO v_prl FROM app.prl_at(NEW.second_home_id, NEW.stay_date, v_resolved);
  IF v_prl.id IS DISTINCT FROM NEW.prl_id OR v_prl.currency IS DISTINCT FROM 'BRL' THEN
    RAISE EXCEPTION 'the complement night records the PRL version in force when the terms were resolved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_prl';
  END IF;
  IF NEW.potential_credits IS DISTINCT FROM app.luxchange_night_credits(v_prl.amount_minor,
       app.luxchange_snapshot_parameter(r.operation_id, 'credit_multiplier')) THEN
    RAISE EXCEPTION 'the potential credits are the PRL of the night times the snapshot multiplier'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_potential';
  END IF;
  NEW.state := 'active';
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_complement_night_write BEFORE INSERT ON app.luxchange_request_complement_night
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_night_write();

CREATE FUNCTION app.luxchange_request_consent_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.luxchange_request_send_write(NEW.request_id);
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_request_consent_write BEFORE INSERT ON app.luxchange_request_consent
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_consent_write();

-- Completude do envio no COMMIT (ADR-0037 §4): noites, reserva inteira, complemento e seleção, Garantia exata, um Fee,
-- consentimento igual aos termos recompostos, prazo derivado do envio e nenhum efeito sobre capacidade ou Direito de Uso.
CREATE FUNCTION app.assert_luxchange_request_sent_complete(p_request uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE r app.luxchange_request; v_terms jsonb;
BEGIN
  SELECT * INTO STRICT r FROM app.luxchange_request WHERE id = p_request;
  IF (SELECT count(*) FROM app.luxchange_request_night n WHERE n.request_id = r.id) <> r.checkout - r.checkin
     OR EXISTS (SELECT 1 FROM app.economic_snapshot_night s
                 WHERE s.operation_id = r.operation_id
                   AND NOT EXISTS (SELECT 1 FROM app.luxchange_request_night n
                                    WHERE n.request_id = r.id AND n.stay_date = s.stay_date)) THEN
    RAISE EXCEPTION 'every requested night is recorded with its custody'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_nights_complete';
  END IF;
  IF EXISTS (SELECT 1 FROM app.booking b
              WHERE b.id IN (SELECT n.booking_id FROM app.luxchange_request_night n
                              WHERE n.request_id = r.id AND n.booking_id IS NOT NULL)
                AND (b.checkin_date < r.checkin OR b.checkout_date > r.checkout
                     OR b.checkout_date - b.checkin_date <> (SELECT count(*) FROM app.luxchange_request_night n
                                                              WHERE n.request_id = r.id AND n.booking_id = b.id))) THEN
    RAISE EXCEPTION 'a Co-Owner booking is requested whole'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_whole_booking';
  END IF;
  IF EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
              WHERE u.request_id = r.id
                AND (u.potential_credits IS DISTINCT FROM (SELECT sum(c.potential_credits)
                                                            FROM app.luxchange_request_complement_night c
                                                           WHERE c.unit_id = u.id)
                     OR (u.kind = 'owner_night'
                         AND (SELECT count(*) FROM app.luxchange_request_complement_night c WHERE c.unit_id = u.id) <> 1)
                     OR (u.kind = 'co_owner_booking' AND EXISTS (
                           SELECT 1 FROM app.booking b
                            WHERE b.id = u.booking_id
                              AND (b.checkout_date - b.checkin_date <> (SELECT count(*)
                                     FROM app.luxchange_request_complement_night c WHERE c.unit_id = u.id)
                                   OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_night c
                                               WHERE c.unit_id = u.id
                                                 AND (c.stay_date < b.checkin_date OR c.stay_date >= b.checkout_date)))))))
  THEN
    RAISE EXCEPTION 'each complement unit is whole and worth the sum of its nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_unit_complete';
  END IF;
  IF r.complement_credits IS DISTINCT FROM coalesce((SELECT sum(u.potential_credits)
                                                      FROM app.luxchange_request_complement_unit u
                                                     WHERE u.request_id = r.id), 0) THEN
    RAISE EXCEPTION 'the complement credits are the potential credits of the committed units'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_complement_total';
  END IF;
  -- Seleção sem sobra evitável (TECH-073): se P alcança N, nenhuma unidade é dispensável.
  IF r.complement_credits >= r.credits_required
     AND r.complement_credits - (SELECT min(u.potential_credits) FROM app.luxchange_request_complement_unit u
                                  WHERE u.request_id = r.id) >= r.credits_required THEN
    RAISE EXCEPTION 'a complement unit is dispensable: the others already cover the required credits'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_complement_selection';
  END IF;
  IF coalesce((SELECT sum(e.quantity) FROM app.credit_entry e
                WHERE e.operation_id = r.operation_id AND e.movement = 'hold'), 0) <> r.guarantee_credits THEN
    RAISE EXCEPTION 'the hold of the Request is exactly its guarantee credits'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_guarantee_total';
  END IF;
  IF (SELECT count(*) FROM app.fee_charge f WHERE f.operation_id = r.operation_id) <> 1 THEN
    RAISE EXCEPTION 'a Request is sent with its Fee paid'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_fee';
  END IF;
  IF r.expires_at IS DISTINCT FROM r.sent_at
       + make_interval(hours => app.luxchange_snapshot_parameter(r.operation_id, 'request_deadline_hours')::integer) THEN
    RAISE EXCEPTION 'the deadline is the sending instant plus the binding duration'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_deadline_binding';
  END IF;
  SELECT c.terms INTO v_terms FROM app.luxchange_request_consent c WHERE c.request_id = r.id;
  IF NOT FOUND OR v_terms IS DISTINCT FROM app.luxchange_request_terms(r.id) THEN
    RAISE EXCEPTION 'the recorded consent is exactly the terms bound to the Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_consent_terms';
  END IF;
  IF EXISTS (SELECT 1 FROM app.date_custody c
              WHERE c.opened_by_operation = r.operation_id OR c.closed_by_operation = r.operation_id)
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.opened_by_operation = r.operation_id OR o.released_by_operation = r.operation_id)
     OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.operation_id = r.operation_id)
     OR EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = r.operation_id)
     OR EXISTS (SELECT 1 FROM app.credit_lot l WHERE l.origin_operation_id = r.operation_id)
     OR EXISTS (SELECT 1 FROM app.settlement s WHERE s.operation_id = r.operation_id) THEN
    RAISE EXCEPTION 'sending a Request never touches capacity, use right, credit lots or settlement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_side_effect';
  END IF;
END $$;

CREATE FUNCTION app.luxchange_request_send_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_luxchange_request_sent_complete(NEW.id);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER luxchange_request_send_constraint AFTER INSERT ON app.luxchange_request
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_send_constraint();

-- 4. Encerramento pré-aceite ---------------------------------------------------------------------------------------------

-- O banco decide estado, motivo e prova (TECH-024, TECH-044): retirada pelo solicitante (ou expiração, se já vencida);
-- expiração e inelegibilidade pelo sistema; materialização pelo envio do mesmo solicitante (TECH-053).
CREATE FUNCTION app.luxchange_request_transition_check() RETURNS trigger
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
CREATE TRIGGER luxchange_request_transition_check BEFORE INSERT ON app.luxchange_request_transition
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_transition_check();

-- Projeção do estado e liberação dos compromissos, só depois do evento (padrão da W13).
CREATE FUNCTION app.luxchange_request_transition_apply() RETURNS trigger
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
CREATE TRIGGER luxchange_request_transition_apply AFTER INSERT ON app.luxchange_request_transition
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_transition_apply();

-- Completude do encerramento no COMMIT: Garantia inteira liberada, Fee revertido com estorno integral, compromissos
-- liberados e, nos commands de encerramento, nenhum efeito sobre capacidade ou Direito de Uso.
CREATE FUNCTION app.assert_luxchange_request_closing_complete(p_transition uuid) RETURNS void
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

CREATE FUNCTION app.luxchange_request_transition_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_luxchange_request_closing_complete(NEW.id);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER luxchange_request_transition_constraint AFTER INSERT ON app.luxchange_request_transition
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_transition_constraint();

-- 5. Guardas de mudança --------------------------------------------------------------------------------------------------

CREATE FUNCTION app.luxchange_request_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE t app.luxchange_request_transition;
BEGIN
  IF (NEW.id, NEW.operation_id, NEW.requester_party_id, NEW.holder_party_id, NEW.holder_holding_id, NEW.second_home_id,
      NEW.checkin, NEW.checkout, NEW.credits_required, NEW.guarantee_credits, NEW.complement_credits, NEW.sent_at,
      NEW.expires_at)
     IS DISTINCT FROM
     (OLD.id, OLD.operation_id, OLD.requester_party_id, OLD.holder_party_id, OLD.holder_holding_id, OLD.second_home_id,
      OLD.checkin, OLD.checkout, OLD.credits_required, OLD.guarantee_credits, OLD.complement_credits, OLD.sent_at,
      OLD.expires_at) THEN
    RAISE EXCEPTION 'only the projected state of a Request changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_history_immutable';
  END IF;
  IF (NEW.state, NEW.closure_reason, NEW.last_transition_id, NEW.closed_by_operation, NEW.closed_at)
     IS NOT DISTINCT FROM (OLD.state, OLD.closure_reason, OLD.last_transition_id, OLD.closed_by_operation, OLD.closed_at)
  THEN
    RETURN NEW;
  END IF;
  SELECT * INTO t FROM app.luxchange_request_transition WHERE id = NEW.last_transition_id;
  IF NOT FOUND OR OLD.state <> 'pending' OR t.request_id <> NEW.id OR NEW.state <> t.to_state
     OR NEW.closure_reason <> t.reason OR NEW.closed_by_operation <> t.operation_id OR NEW.closed_at <> t.created_at THEN
    RAISE EXCEPTION 'the Request state follows its transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_request_projection';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER luxchange_request_guard BEFORE UPDATE ON app.luxchange_request
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_request_guard();

-- Compromisso: só `active → released`, pela operação que encerrou a Request (o `consumed` do aceite é da W22).
CREATE FUNCTION app.luxchange_complement_guard() RETURNS trigger
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
CREATE TRIGGER luxchange_complement_unit_guard BEFORE UPDATE ON app.luxchange_request_complement_unit
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_guard();
CREATE TRIGGER luxchange_complement_night_guard BEFORE UPDATE ON app.luxchange_request_complement_night
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_guard();

CREATE TRIGGER luxchange_request_no_delete BEFORE DELETE ON app.luxchange_request
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_no_truncate BEFORE TRUNCATE ON app.luxchange_request
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_transition_no_change BEFORE UPDATE OR DELETE ON app.luxchange_request_transition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_transition_no_truncate BEFORE TRUNCATE ON app.luxchange_request_transition
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_night_no_change BEFORE UPDATE OR DELETE ON app.luxchange_request_night
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_night_no_truncate BEFORE TRUNCATE ON app.luxchange_request_night
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_complement_unit_no_delete BEFORE DELETE ON app.luxchange_request_complement_unit
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_complement_unit_no_truncate BEFORE TRUNCATE ON app.luxchange_request_complement_unit
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_complement_night_no_delete BEFORE DELETE ON app.luxchange_request_complement_night
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_complement_night_no_truncate BEFORE TRUNCATE ON app.luxchange_request_complement_night
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_consent_no_change BEFORE UPDATE OR DELETE ON app.luxchange_request_consent
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER luxchange_request_consent_no_truncate BEFORE TRUNCATE ON app.luxchange_request_consent
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_policy_no_change BEFORE UPDATE OR DELETE ON app.economic_snapshot_policy
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_policy_no_truncate BEFORE TRUNCATE ON app.economic_snapshot_policy
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- 6. Recusa dos atos do Titular sobre data comprometida (PD-012 item 5) --------------------------------------------------

CREATE FUNCTION app.luxchange_complement_occupancy_guard() RETURNS trigger
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
CREATE TRIGGER date_occupancy_complement_guard BEFORE INSERT ON app.date_occupancy
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_occupancy_guard();

CREATE FUNCTION app.luxchange_complement_transition_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF app.acts_as_schema_owner() OR NEW.kind NOT IN ('cancellation', 'cession') THEN
    RETURN NEW;
  END IF;
  PERFORM app.lock_booking(NEW.booking_id, false);
  IF app.luxchange_complement_effective_booking(NEW.booking_id) IS NOT NULL THEN
    RAISE EXCEPTION 'the booking is committed to a pending Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_committed_to_request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_state_transition_complement_guard BEFORE INSERT ON app.booking_state_transition
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_transition_guard();

CREATE FUNCTION app.luxchange_complement_custody_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF app.acts_as_schema_owner() OR OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL
     OR (SELECT o.command FROM app.operation o WHERE o.id = NEW.closed_by_operation) IS DISTINCT FROM 'deposit_capacity' THEN
    RETURN NEW;
  END IF;
  PERFORM app.lock_night(OLD.second_home_id, OLD.stay_date, true);
  IF app.luxchange_complement_effective(OLD.second_home_id, OLD.stay_date) IS NOT NULL THEN
    RAISE EXCEPTION 'the night is committed to a pending Request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_committed_to_request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER date_custody_complement_guard BEFORE UPDATE ON app.date_custody
  FOR EACH ROW EXECUTE FUNCTION app.luxchange_complement_custody_guard();

-- 7. Ledger de Créditos: Garantia vinculada à Request; liberação só pelo encerramento; chaves só para compromisso novo -----

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

-- 8. Fee e pagamentos: Fee da Request sobre as noites solicitadas; obrigações existentes nunca presas pela K5 ----------

-- Gatilho próprio, depois do da W19 (ordem alfabética: as recusas da W19 vêm primeiro): o Fee de `send_request` pertence
-- à Request da operação e usa o PRL total das noites solicitadas do snapshot (vínculo PRL total ↔ noites, ADR-0035).
CREATE FUNCTION app.fee_charge_write_request() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF (SELECT o.command FROM app.operation o WHERE o.id = NEW.operation_id) = 'send_request'
     AND (NOT EXISTS (SELECT 1 FROM app.luxchange_request r
                       WHERE r.operation_id = NEW.operation_id AND r.requester_party_id = NEW.payer_party_id)
          OR NEW.prl_total_minor IS DISTINCT FROM (SELECT sum(l.amount_minor) FROM app.economic_snapshot_night n
                                                     JOIN app.prl l ON l.id = n.prl_id
                                                    WHERE n.operation_id = NEW.operation_id)) THEN
    RAISE EXCEPTION 'the Fee of a Request is charged on the PRL of its requested nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_request_nights';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fee_charge_write_request BEFORE INSERT ON app.fee_charge
  FOR EACH ROW EXECUTE FUNCTION app.fee_charge_write_request();

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

-- Obrigações existentes nunca presas pela K5 (ADR-0037 §10): estorno (abertura pela reversão ou pela conciliação, avanço),
-- avanço monotônico de pagamento existente e inbox. Pagamento novo, Fee e settlement seguem exigindo a K5.

CREATE OR REPLACE FUNCTION app.refund_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE op app.operation; p app.payment; v_fee uuid; v_reversal_op uuid; v_active bigint;
BEGIN
  -- W21 (ADR-0037 §10): sem a K5 — objeto preexistente; nada novo é criado aqui.
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  IF NEW.state IS DISTINCT FROM 'pending' OR NEW.provider_refund_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a refund opens pending, before any provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_opening';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO p FROM app.payment WHERE id = NEW.payment_id FOR UPDATE;
  IF p.state IS DISTINCT FROM 'approved' OR p.currency <> NEW.currency THEN
    RAISE EXCEPTION 'only an approved payment is refunded, in its currency'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_payment';
  END IF;
  SELECT f.id, r.operation_id INTO v_fee, v_reversal_op
    FROM app.fee_charge f LEFT JOIN app.fee_charge_reversal r ON r.fee_charge_id = f.id
   WHERE f.payment_id = p.id;
  IF v_fee IS NOT NULL AND v_reversal_op IS NULL THEN
    RAISE EXCEPTION 'a payment bound to a Fee is refunded only through the Fee reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_bound_payment';
  END IF;
  IF NOT (op.command = 'reconciliation' OR (v_fee IS NOT NULL AND v_reversal_op = NEW.operation_id)) THEN
    RAISE EXCEPTION 'a refund comes from the Fee reversal or from the reconciliation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_origin';
  END IF;
  SELECT coalesce(sum(r.amount_minor), 0) INTO v_active
    FROM app.refund r WHERE r.payment_id = p.id AND r.state <> 'failed';
  IF v_active + NEW.amount_minor > p.amount_minor THEN
    RAISE EXCEPTION 'refunds never exceed the approved amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_exceeds_payment';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $function$
;

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

CREATE OR REPLACE FUNCTION app.payment_advance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- W21 (ADR-0037 §10): sem a K5 — objeto preexistente; nada novo é criado aqui.
  IF (NEW.id, NEW.payer_party_id, NEW.created_by_user_id, NEW.purpose, NEW.amount_minor, NEW.currency, NEW.provider,
      NEW.idempotency_key, NEW.request_hash, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.payer_party_id, OLD.created_by_user_id, OLD.purpose, OLD.amount_minor, OLD.currency, OLD.provider,
      OLD.idempotency_key, OLD.request_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'a payment keeps its payer, purpose, amount and provider'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_immutable';
  END IF;
  IF OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('approved', 'failed') THEN
      RAISE EXCEPTION 'payment states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  IF NEW.state = 'approved' AND NEW.provider_payment_id IS NULL THEN
    RAISE EXCEPTION 'an approved payment carries the provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_required';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION app.webhook_inbox_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- W21 (ADR-0037 §10): sem a K5 — objeto preexistente; nada novo é criado aqui.
  NEW.received_at := clock_timestamp();
  RETURN NEW;
END $function$
;


-- 9. Invariantes (após todo teste `db`; reconciliação futura) -------------------------------------------------------------

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

-- 10. Privilégios e leitura -----------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION app.economic_snapshot_policy_write(), app.luxchange_request_open(),
  app.luxchange_request_night_write(), app.luxchange_complement_unit_write(), app.luxchange_complement_night_write(),
  app.luxchange_request_consent_write(), app.luxchange_request_send_constraint(), app.luxchange_request_transition_check(),
  app.luxchange_request_transition_apply(), app.luxchange_request_transition_constraint(), app.luxchange_request_guard(),
  app.luxchange_complement_guard(), app.luxchange_complement_occupancy_guard(),
  app.luxchange_complement_transition_guard(), app.luxchange_complement_custody_guard(), app.fee_charge_write_request(),
  app.luxchange_invariant_breaches() FROM PUBLIC;
-- Funções auxiliares chamadas pelos gatilhos com o papel de quem escreve (`luxtory_app`); nenhum outro papel as executa.
REVOKE ALL ON FUNCTION app.luxchange_snapshot_parameter(uuid, text), app.luxchange_night_credits(bigint, text),
  app.luxchange_request_terms(uuid), app.luxchange_request_closure_reason(uuid),
  app.luxchange_complement_effective(uuid, date), app.luxchange_complement_effective_booking(uuid),
  app.luxchange_request_send_write(uuid), app.assert_luxchange_request_sent_complete(uuid),
  app.assert_luxchange_request_closing_complete(uuid), app.lock_night(uuid, date, boolean),
  app.lock_booking(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.luxchange_snapshot_parameter(uuid, text), app.luxchange_night_credits(bigint, text),
  app.luxchange_request_terms(uuid), app.luxchange_request_closure_reason(uuid),
  app.luxchange_complement_effective(uuid, date), app.luxchange_complement_effective_booking(uuid),
  app.luxchange_request_send_write(uuid), app.assert_luxchange_request_sent_complete(uuid),
  app.assert_luxchange_request_closing_complete(uuid), app.lock_night(uuid, date, boolean),
  app.lock_booking(uuid, boolean) TO luxtory_app;

ALTER TABLE app.economic_snapshot_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request_night ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request_complement_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request_complement_night ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.luxchange_request_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY economic_snapshot_policy_app_read ON app.economic_snapshot_policy FOR SELECT TO luxtory_app USING (true);
CREATE POLICY economic_snapshot_policy_app_insert ON app.economic_snapshot_policy FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY luxchange_request_app_read ON app.luxchange_request FOR SELECT TO luxtory_app USING (true);
CREATE POLICY luxchange_request_app_insert ON app.luxchange_request FOR INSERT TO luxtory_app WITH CHECK (true);
-- Trava da classe 1 (`FOR UPDATE`); toda mudança efetiva passa pela guarda.
CREATE POLICY luxchange_request_app_lock ON app.luxchange_request FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
CREATE POLICY luxchange_request_transition_app_read ON app.luxchange_request_transition FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY luxchange_request_transition_app_insert ON app.luxchange_request_transition FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY luxchange_request_night_app_read ON app.luxchange_request_night FOR SELECT TO luxtory_app USING (true);
CREATE POLICY luxchange_request_night_app_insert ON app.luxchange_request_night FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY luxchange_complement_unit_app_read ON app.luxchange_request_complement_unit FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY luxchange_complement_unit_app_insert ON app.luxchange_request_complement_unit FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY luxchange_complement_night_app_read ON app.luxchange_request_complement_night FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY luxchange_complement_night_app_insert ON app.luxchange_request_complement_night FOR INSERT
  TO luxtory_app WITH CHECK (true);
CREATE POLICY luxchange_request_consent_app_read ON app.luxchange_request_consent FOR SELECT TO luxtory_app USING (true);
CREATE POLICY luxchange_request_consent_app_insert ON app.luxchange_request_consent FOR INSERT TO luxtory_app
  WITH CHECK (true);

GRANT SELECT ON app.economic_snapshot_policy, app.luxchange_request, app.luxchange_request_transition,
  app.luxchange_request_night, app.luxchange_request_complement_unit, app.luxchange_request_complement_night,
  app.luxchange_request_consent TO luxtory_app;
GRANT INSERT (operation_id, policy_id) ON app.economic_snapshot_policy TO luxtory_app;
GRANT INSERT (id, operation_id, requester_party_id, holder_party_id, holder_holding_id, second_home_id, checkin, checkout,
              credits_required, guarantee_credits, complement_credits) ON app.luxchange_request TO luxtory_app;
GRANT UPDATE (last_transition_id) ON app.luxchange_request TO luxtory_app;
GRANT INSERT (id, request_id, operation_id, reason) ON app.luxchange_request_transition TO luxtory_app;
GRANT INSERT (request_id, second_home_id, stay_date, custody_id, booking_id) ON app.luxchange_request_night
  TO luxtory_app;
GRANT INSERT (id, request_id, kind, holding_id, booking_id, potential_credits) ON app.luxchange_request_complement_unit
  TO luxtory_app;
GRANT INSERT (unit_id, request_id, second_home_id, stay_date, custody_id, prl_id, potential_credits)
  ON app.luxchange_request_complement_night TO luxtory_app;
GRANT INSERT (request_id, text_version, terms) ON app.luxchange_request_consent TO luxtory_app;

-- Titular (RLS): o solicitante lê as próprias Requests, noites, complemento, consentimento e encerramento pelas parties
-- que representa; o detentor lê as recebidas só pela visão restrita (sem a party do solicitante nem o complemento).
GRANT SELECT ON app.luxchange_request, app.luxchange_request_transition, app.luxchange_request_night,
  app.luxchange_request_complement_unit, app.luxchange_request_complement_night, app.luxchange_request_consent
  TO authenticated;
CREATE POLICY luxchange_request_requester_read ON app.luxchange_request FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.party_delegation d
           WHERE d.party_id = luxchange_request.requester_party_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY luxchange_request_transition_requester_read ON app.luxchange_request_transition FOR SELECT
  TO authenticated USING (
  EXISTS (SELECT 1 FROM app.luxchange_request r JOIN app.party_delegation d ON d.party_id = r.requester_party_id
           WHERE r.id = luxchange_request_transition.request_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY luxchange_request_night_requester_read ON app.luxchange_request_night FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.luxchange_request r JOIN app.party_delegation d ON d.party_id = r.requester_party_id
           WHERE r.id = luxchange_request_night.request_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY luxchange_complement_unit_requester_read ON app.luxchange_request_complement_unit FOR SELECT
  TO authenticated USING (
  EXISTS (SELECT 1 FROM app.luxchange_request r JOIN app.party_delegation d ON d.party_id = r.requester_party_id
           WHERE r.id = luxchange_request_complement_unit.request_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY luxchange_complement_night_requester_read ON app.luxchange_request_complement_night FOR SELECT
  TO authenticated USING (
  EXISTS (SELECT 1 FROM app.luxchange_request r JOIN app.party_delegation d ON d.party_id = r.requester_party_id
           WHERE r.id = luxchange_request_complement_night.request_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY luxchange_request_consent_requester_read ON app.luxchange_request_consent FOR SELECT TO authenticated
  USING (
  EXISTS (SELECT 1 FROM app.luxchange_request r JOIN app.party_delegation d ON d.party_id = r.requester_party_id
           WHERE r.id = luxchange_request_consent.request_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);

CREATE VIEW app.luxchange_request_received WITH (security_barrier = true) AS
  SELECT r.id, r.holder_party_id, r.second_home_id, r.checkin, r.checkout, r.sent_at, r.expires_at, r.state,
         r.closure_reason, r.closed_at
    FROM app.luxchange_request r
   WHERE EXISTS (SELECT 1 FROM app.party_delegation d
                  WHERE d.party_id = r.holder_party_id AND d.user_id = auth.uid() AND d.state = 'active'
                    AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until));
REVOKE ALL ON app.luxchange_request_received FROM PUBLIC;
GRANT SELECT ON app.luxchange_request_received TO authenticated;

-- migrate:down
-- Fatos de Request nunca são descartados por rollback (TECH-052) nem a regra é removida sob uma ativação: com Request,
-- política no snapshot ou a K7 presente, a reversão é recusada. Sem linhas (banco vazio do `db:check`), restaura
-- exatamente a W20.
DO $$
BEGIN
  LOCK TABLE app.luxchange_request, app.economic_snapshot_policy, app.capability_activation IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.luxchange_request) OR EXISTS (SELECT 1 FROM app.economic_snapshot_policy)
     OR EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxchange_exchange') THEN
    RAISE EXCEPTION 'W21 rollback would discard Request facts or remove the rule under an activation decision';
  END IF;
END $$;

DROP VIEW app.luxchange_request_received;
DROP TRIGGER date_custody_complement_guard ON app.date_custody;
DROP TRIGGER booking_state_transition_complement_guard ON app.booking_state_transition;
DROP TRIGGER date_occupancy_complement_guard ON app.date_occupancy;
DROP TRIGGER fee_charge_write_request ON app.fee_charge;
ALTER TABLE app.luxchange_request DROP CONSTRAINT luxchange_request_last_transition;
-- Devolve o tipo da linha da Request: sai antes da tabela.
DROP FUNCTION app.luxchange_request_send_write(uuid);
DROP TABLE app.luxchange_request_consent;
DROP TABLE app.luxchange_request_complement_night;
DROP TABLE app.luxchange_request_complement_unit;
DROP TABLE app.luxchange_request_night;
DROP TABLE app.luxchange_request_transition;
DROP TABLE app.luxchange_request;
DROP TABLE app.economic_snapshot_policy;

DROP FUNCTION app.luxchange_complement_custody_guard();
DROP FUNCTION app.luxchange_complement_transition_guard();
DROP FUNCTION app.luxchange_complement_occupancy_guard();
DROP FUNCTION app.luxchange_complement_guard();
DROP FUNCTION app.luxchange_request_guard();
DROP FUNCTION app.luxchange_request_transition_constraint();
DROP FUNCTION app.assert_luxchange_request_closing_complete(uuid);
DROP FUNCTION app.luxchange_request_transition_apply();
DROP FUNCTION app.luxchange_request_transition_check();
DROP FUNCTION app.luxchange_request_send_constraint();
DROP FUNCTION app.assert_luxchange_request_sent_complete(uuid);
DROP FUNCTION app.luxchange_request_consent_write();
DROP FUNCTION app.luxchange_complement_night_write();
DROP FUNCTION app.luxchange_complement_unit_write();
DROP FUNCTION app.luxchange_request_night_write();
DROP FUNCTION app.luxchange_request_open();
DROP FUNCTION app.economic_snapshot_policy_write();
DROP FUNCTION app.luxchange_complement_effective_booking(uuid);
DROP FUNCTION app.luxchange_complement_effective(uuid, date);
DROP FUNCTION app.luxchange_request_closure_reason(uuid);
DROP FUNCTION app.luxchange_request_terms(uuid);
DROP FUNCTION app.luxchange_night_credits(bigint, text);
DROP FUNCTION app.luxchange_snapshot_parameter(uuid, text);
DROP FUNCTION app.fee_charge_write_request();
DROP FUNCTION app.lock_booking(uuid, boolean);
DROP FUNCTION app.lock_night(uuid, date, boolean);

-- Definições da W20 (W17/W19) restauradas como estavam.

CREATE OR REPLACE FUNCTION app.credit_entry_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  op app.operation;
  lot app.credit_lot;
  parent app.credit_entry;
  v_now timestamptz;
  v_valid boolean;
  v_left numeric;
BEGIN
  PERFORM app.assert_credits_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command IN ('send_request', 'accept_request', 'create_direct', 'withdraw_request', 'reject_request') THEN
    -- W20 auditoria (ADR-0036 §7): Garantia, consumo e liberação de Request/Direct só com a K7 (W21–W23).
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
  ELSIF NEW.movement = 'consume' THEN
    -- Aceite: consome a Garantia da Request (o detentor age; a party do lote é a solicitante).
    IF op.command <> 'accept_request' THEN
      RAISE EXCEPTION 'a hold is consumed only by the acceptance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_entry_mechanism';
    END IF;
  ELSIF NEW.movement = 'release' THEN
    IF op.command NOT IN ('withdraw_request', 'reject_request') THEN
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
END $function$
;

CREATE OR REPLACE FUNCTION app.fee_charge_reversal_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE op app.operation; fee_op text; v_payment uuid;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- Desfechos pré-aceite do PD-006 nomeados na TECH-051/TECH-090; perda de elegibilidade entra com a W21.
  IF op.command NOT IN ('withdraw_request', 'reject_request', 'accept_request', 'expire_requests') THEN
    RAISE EXCEPTION 'the Fee is reversed only by a pre-acceptance outcome'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
  END IF;
  SELECT o.command, f.payment_id INTO fee_op, v_payment
    FROM app.fee_charge f JOIN app.operation o ON o.id = f.operation_id WHERE f.id = NEW.fee_charge_id;
  IF fee_op IS DISTINCT FROM 'send_request' THEN
    RAISE EXCEPTION 'only the Fee of a Request has pre-acceptance outcomes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_mechanism';
  END IF;
  PERFORM 1 FROM app.payment WHERE id = v_payment FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.settlement s WHERE s.fee_charge_id = NEW.fee_charge_id) THEN
    RAISE EXCEPTION 'a settled Fee is not reversed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_settled';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION app.refund_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE op app.operation; p app.payment; v_fee uuid; v_reversal_op uuid; v_active bigint;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  IF NEW.state IS DISTINCT FROM 'pending' OR NEW.provider_refund_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a refund opens pending, before any provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_opening';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO p FROM app.payment WHERE id = NEW.payment_id FOR UPDATE;
  IF p.state IS DISTINCT FROM 'approved' OR p.currency <> NEW.currency THEN
    RAISE EXCEPTION 'only an approved payment is refunded, in its currency'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_payment';
  END IF;
  SELECT f.id, r.operation_id INTO v_fee, v_reversal_op
    FROM app.fee_charge f LEFT JOIN app.fee_charge_reversal r ON r.fee_charge_id = f.id
   WHERE f.payment_id = p.id;
  IF v_fee IS NOT NULL AND v_reversal_op IS NULL THEN
    RAISE EXCEPTION 'a payment bound to a Fee is refunded only through the Fee reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_bound_payment';
  END IF;
  IF NOT (op.command = 'reconciliation' OR (v_fee IS NOT NULL AND v_reversal_op = NEW.operation_id)) THEN
    RAISE EXCEPTION 'a refund comes from the Fee reversal or from the reconciliation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_origin';
  END IF;
  SELECT coalesce(sum(r.amount_minor), 0) INTO v_active
    FROM app.refund r WHERE r.payment_id = p.id AND r.state <> 'failed';
  IF v_active + NEW.amount_minor > p.amount_minor THEN
    RAISE EXCEPTION 'refunds never exceed the approved amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_exceeds_payment';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION app.refund_advance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.assert_payments_active();
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

CREATE OR REPLACE FUNCTION app.payment_advance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.assert_payments_active();
  IF (NEW.id, NEW.payer_party_id, NEW.created_by_user_id, NEW.purpose, NEW.amount_minor, NEW.currency, NEW.provider,
      NEW.idempotency_key, NEW.request_hash, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.payer_party_id, OLD.created_by_user_id, OLD.purpose, OLD.amount_minor, OLD.currency, OLD.provider,
      OLD.idempotency_key, OLD.request_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'a payment keeps its payer, purpose, amount and provider'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_immutable';
  END IF;
  IF OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('approved', 'failed') THEN
      RAISE EXCEPTION 'payment states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  IF NEW.state = 'approved' AND NEW.provider_payment_id IS NULL THEN
    RAISE EXCEPTION 'an approved payment carries the provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_required';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION app.webhook_inbox_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.assert_payments_active();
  NEW.received_at := clock_timestamp();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION app.luxchange_invariant_breaches()
 RETURNS TABLE(invariant text, operation_id uuid, detail text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE v_operation uuid;
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
END $function$
;
