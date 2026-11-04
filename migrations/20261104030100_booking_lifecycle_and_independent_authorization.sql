-- migrate:up
-- W13 E1 (REQ-080, REQ-081, REQ-083, REQ-084, PD-010; TECH-022, TECH-043, TECH-046, TECH-051, TECH-053, TECH-055;
-- 01 BR-123, BR-163, BR-280–BR-284): ciclo da reserva de uso próprio no banco. Spec: docs/specs/booking.md §10;
-- ADR-0027. Estados só-inserção com cadeia provada e projeção controlada (§2), exceção e resolução, candidatos a
-- no-show, solicitação/autorização/revogação/uso da autorização independente e o papel `luxtory_booking_authorizer`
-- (§4), regras por transição (§1, §3) e a chave K2 `own_use_lifecycle` no `CHECK` (§5) — a tabela de ativação continua
-- vazia. Condições temporais no instante de cada escrita (`clock_timestamp()`, T3).

-- K2 (ADR-0027 §5): a W13 só amplia o CHECK. Nenhuma linha.
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle'));

-- Toda escrita do papel da aplicação nos seis commands da W13 passa por aqui: sem a linha, recusa — inclusive SQL direto.
-- A leitura mantém a tabela travada em modo compartilhado até o fim da transação (mesma contenção da K1).
CREATE FUNCTION app.assert_own_use_lifecycle_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'own_use_lifecycle') THEN
    RAISE EXCEPTION 'own use booking lifecycle is not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'booking_lifecycle_not_activated';
  END IF;
END $$;

-- Instantes puros (o instante entra como parâmetro: as fronteiras são testáveis ao microssegundo e a gêmea TypeScript
-- da E2 é comparada com estas funções).
-- Check-out: 10:00 locais do `checkout_date` no fuso da Second Home (03 §3.1; `checkOutAt` da spec calendar). NULL
-- quando o horário local não existe ou é ambíguo — quem chama falha fechado.
CREATE FUNCTION app.booking_checkout_at(p_checkout_date date, p_timezone text) RETURNS timestamptz
  LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT app.local_instant(p_checkout_date + time '10:00', p_timezone) $$;

-- TECH-043, D11: tempestivo ⇔ `cancelled_at ≤ checkin_at − 360 h`, sobre instantes (nunca `'15 days'`, que usa o fuso
-- da sessão; precedente TECH-044).
CREATE FUNCTION app.own_use_cancellation_timely(p_first_checkin timestamptz, p_at timestamptz) RETURNS boolean
  LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT p_at <= p_first_checkin - interval '360 hours' $$;

-- TECH-046, D8: janela estrita do no-show `[1º checkin_at, checkout_at)`.
CREATE FUNCTION app.booking_no_show_window_open(p_first_checkin timestamptz, p_checkout_at timestamptz,
    p_at timestamptz) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT p_first_checkin <= p_at AND p_at < p_checkout_at $$;

-- TECH-044 (precedente): uso exige `now < valid_until`.
CREATE FUNCTION app.booking_authorization_usable(p_valid_until timestamptz, p_at timestamptz) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT p_at < p_valid_until $$;

-- Primeiro e último check-in das noites da reserva e o check-out, ou falha fechada.
CREATE FUNCTION app.booking_period_instants(p_booking uuid, OUT first_checkin_at timestamptz,
    OUT last_checkin_at timestamptz, OUT checkout_at timestamptz)
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE b app.booking; v_timezone text;
BEGIN
  SELECT * INTO STRICT b FROM app.booking WHERE id = p_booking;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = b.second_home_id;
  SELECT min(d.checkin_at), max(d.checkin_at) INTO first_checkin_at, last_checkin_at
    FROM app.second_home_date d
   WHERE d.second_home_id = b.second_home_id AND d.stay_date >= b.checkin_date AND d.stay_date < b.checkout_date;
  checkout_at := app.booking_checkout_at(b.checkout_date, v_timezone);
  IF first_checkin_at IS NULL OR checkout_at IS NULL THEN
    RAISE EXCEPTION 'the booking period has no well-defined instants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_period_instants';
  END IF;
END $$;

-- TECH-043: noites da reserva ainda não iniciadas no instante (`at < checkin_at`), em ordem crescente.
CREATE FUNCTION app.booking_unstarted_nights(p_booking uuid, p_at timestamptz) RETURNS date[]
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT coalesce(array_agg(d.stay_date ORDER BY d.stay_date), '{}')
    FROM app.booking b
    JOIN app.second_home_date d
      ON d.second_home_id = b.second_home_id AND d.stay_date >= b.checkin_date AND d.stay_date < b.checkout_date
   WHERE b.id = p_booking AND p_at < d.checkin_at
$$;

-- Motivo de liberação da ocupação por evento (spec booking §10.6).
CREATE FUNCTION app.booking_release_reason(p_kind text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE p_kind WHEN 'cancellation' THEN 'cancelled' WHEN 'no_show' THEN 'no_show'
    WHEN 'exception_resolution' THEN 'exception' WHEN 'invalidation' THEN 'invalidation' END
$$;

-- ADR-0021, padrão W8: a atribuição Admin exata da operação (`authorization_ref = staff_role:<uuid>`), travada em modo
-- compartilhado contra a revogação concorrente (mesma chave de `app.revoke_staff_role`) e ativa no instante.
-- Consistência, não autenticidade: o `luxtory_app` lê `staff_role` e grava `operation` (ADR-0027 §1, §4).
CREATE FUNCTION app.lock_own_use_admin_authority(p_operation app.operation) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_role uuid;
BEGIN
  IF p_operation.role <> 'admin' OR p_operation.actor_user_id IS NULL
     OR p_operation.authorization_ref !~* '^staff_role:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'the operation is not authorized by an Admin assignment'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_staff_role';
  END IF;
  v_role := lower(substr(p_operation.authorization_ref, 12))::uuid;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('app.staff_role:' || v_role::text, 0));
  IF NOT EXISTS (SELECT 1 FROM app.staff_role
                  WHERE id = v_role AND user_id = p_operation.actor_user_id AND role = 'admin' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'the Admin assignment of the operation is not active'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_staff_role';
  END IF;
END $$;

-- TECH-050: o Titular da operação representa, por delegação ativa travada, a party da holding vigente da reserva.
CREATE FUNCTION app.lock_own_use_titular(p_operation app.operation, p_booking app.booking, p_at timestamptz)
  RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF p_operation.role <> 'titular' OR p_operation.acting_party_id IS NULL THEN
    RAISE EXCEPTION 'only the Titular of the booking cancels it'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  PERFORM app.lock_own_use_representation(p_operation.actor_user_id, p_operation.acting_party_id, p_at);
  IF NOT EXISTS (SELECT 1 FROM app.holding h
                  WHERE h.id = p_booking.holding_id AND h.party_id = p_operation.acting_party_id
                    AND h.valid_from <= p_at AND (h.valid_until IS NULL OR p_at < h.valid_until)) THEN
    RAISE EXCEPTION 'the booking holding is the current holding of the represented party'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
END $$;

-- Trava da reserva (ADR-0027 §2), depois da classe 4 (Ação, reentrante) e das noites do command: transições, uso de
-- autorização, autorização e revogação se serializam por reserva. Consultiva: o `luxtory_app` não tem `UPDATE` em
-- `app.booking`, que o `FOR NO KEY UPDATE` exigiria; a projeção trava a linha nessa mesma posição da ordem.
CREATE FUNCTION app.lock_own_use_booking(p_booking app.booking) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF p_booking.stake_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('app.stake:' || p_booking.stake_id::text, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.booking:' || p_booking.id::text, 0));
END $$;

-- Estado projetado e classificação gravada uma vez (TECH-043). `last_transition_id` aponta a folha da cadeia.
ALTER TABLE app.booking
  ADD COLUMN last_transition_id uuid,
  ADD COLUMN cancellation_class text,
  ADD CONSTRAINT booking_cancellation_class_check CHECK (cancellation_class IN ('timely', 'late'));

-- Histórico só-inserção (ADR-0027 §2). `kind` é a natureza econômica do evento; `recorded_at`, o instante do banco na
-- escrita (T3). Classe e primeira noite afetada: os termos do cancelamento (D7).
CREATE TABLE app.booking_state_transition (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES app.booking(id),
  previous_transition_id uuid,
  from_state text NOT NULL,
  to_state text NOT NULL,
  kind text NOT NULL,
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  recorded_at timestamptz NOT NULL,
  cancellation_class text,
  first_affected_date date,
  basis text,
  CONSTRAINT booking_state_transition_id_booking_key UNIQUE (id, booking_id),
  -- Cadeia linear: anterior da mesma reserva, sem bifurcação, uma raiz que parte de `confirmed` (índice abaixo).
  CONSTRAINT conflict_booking_transition_previous FOREIGN KEY (previous_transition_id, booking_id)
    REFERENCES app.booking_state_transition(id, booking_id),
  CONSTRAINT conflict_booking_transition_fork UNIQUE (previous_transition_id),
  CONSTRAINT conflict_booking_transition_root CHECK (previous_transition_id IS NOT NULL OR from_state = 'confirmed'),
  CONSTRAINT booking_state_transition_kind_check CHECK (kind IN (
    'advance', 'cancellation', 'no_show', 'exception_opening', 'exception_resolution', 'invalidation'
  )),
  -- TECH-055, por natureza do evento (todo par é da TECH-055).
  CONSTRAINT conflict_booking_transition_pair CHECK (CASE kind
    WHEN 'advance' THEN (from_state, to_state) IN (('confirmed', 'in_use'), ('in_use', 'completed'))
    WHEN 'cancellation' THEN from_state IN ('confirmed', 'in_use', 'in_exception') AND to_state = 'cancelled'
    WHEN 'no_show' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'no_show'
    WHEN 'exception_opening' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'in_exception'
    WHEN 'exception_resolution' THEN from_state = 'in_exception' AND to_state IN ('confirmed', 'completed', 'cancelled')
    WHEN 'invalidation' THEN from_state = 'in_exception' AND to_state = 'cancelled'
  END),
  CONSTRAINT booking_state_transition_class_check CHECK (cancellation_class IN ('timely', 'late')),
  CONSTRAINT booking_state_transition_class_shape
    CHECK (cancellation_class IS NULL OR (to_state = 'cancelled' AND kind IN ('cancellation', 'exception_resolution'))),
  CONSTRAINT booking_state_transition_affected_shape
    CHECK (first_affected_date IS NULL OR to_state IN ('cancelled', 'no_show')),
  -- Base registrada dos atos Admin; nunca no do sistema nem no do Titular.
  CONSTRAINT booking_state_transition_basis_shape
    CHECK ((kind IN ('advance', 'cancellation')) = (basis IS NULL)),
  CONSTRAINT booking_state_transition_basis_format CHECK (basis IS NULL OR length(btrim(basis)) BETWEEN 1 AND 255)
);
CREATE UNIQUE INDEX conflict_booking_transition_single_root ON app.booking_state_transition (booking_id)
  WHERE previous_transition_id IS NULL;
-- Um evento por operação e reserva fora do avanço do sistema (o job atrasado grava dois avanços na mesma operação):
-- as escritas de noite encontram a transição da própria operação sem ambiguidade.
CREATE UNIQUE INDEX booking_transition_one_event_per_operation ON app.booking_state_transition (operation_id)
  WHERE kind <> 'advance';
CREATE INDEX booking_state_transition_booking_idx ON app.booking_state_transition (booking_id, recorded_at);

ALTER TABLE app.booking
  ADD CONSTRAINT booking_last_transition_fk FOREIGN KEY (last_transition_id, id)
    REFERENCES app.booking_state_transition(id, booking_id);

-- PD-010 (P-A, lista fechada da BR-123) ou REQ-084 (P-B, apuração com referência do incidente). Aberta pela transição
-- de abertura; `in_exception` ⇔ exatamente uma aberta (sem resolução).
CREATE TABLE app.booking_exception (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  exception_type text NOT NULL,
  reason text,
  incident_ref text,
  opened_by_transition_id uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  CONSTRAINT booking_exception_id_booking_key UNIQUE (id, booking_id),
  CONSTRAINT booking_exception_opening_fk FOREIGN KEY (opened_by_transition_id, booking_id)
    REFERENCES app.booking_state_transition(id, booking_id),
  CONSTRAINT booking_exception_one_per_opening UNIQUE (opened_by_transition_id),
  CONSTRAINT booking_exception_type_check CHECK (exception_type IN ('operational', 'unauthorized_booking')),
  CONSTRAINT booking_exception_reason_check CHECK (reason IN (
    'emergency_maintenance', 'security', 'casualty', 'fortuitous_event', 'force_majeure'
  )),
  CONSTRAINT booking_exception_shape CHECK (
    (exception_type = 'operational') = (reason IS NOT NULL)
    AND (exception_type = 'unauthorized_booking') = (incident_ref IS NOT NULL)
  ),
  -- Referência opaca (ticket), sem dado pessoal.
  CONSTRAINT booking_exception_incident_ref_format
    CHECK (incident_ref IS NULL OR incident_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$')
);

-- Resolução única por exceção, pela transição que sai de `in_exception`.
CREATE TABLE app.booking_exception_resolution (
  exception_id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  transition_id uuid NOT NULL,
  outcome text NOT NULL,
  resolution_source text NOT NULL,
  resolved_at timestamptz NOT NULL,
  CONSTRAINT booking_exception_resolution_exception_fk FOREIGN KEY (exception_id, booking_id)
    REFERENCES app.booking_exception(id, booking_id),
  CONSTRAINT booking_exception_resolution_transition_fk FOREIGN KEY (transition_id, booking_id)
    REFERENCES app.booking_state_transition(id, booking_id),
  CONSTRAINT booking_exception_resolution_transition_key UNIQUE (transition_id),
  CONSTRAINT booking_exception_resolution_outcome_check CHECK (outcome IN ('confirmed', 'completed', 'cancelled')),
  CONSTRAINT booking_exception_resolution_source_check
    CHECK (resolution_source IN ('admin', 'titular_cancellation'))
);

-- D8: o job só registra a identificação, uma vez por reserva; a lista "A verificar comparecimento" é calculada na hora.
CREATE TABLE app.booking_no_show_candidate (
  booking_id uuid PRIMARY KEY REFERENCES app.booking(id),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  flagged_at timestamptz NOT NULL
);

-- Solicitação opaca (ADR-0027 §4, A4): gravada pelo Admin, sem efeito econômico. O workflow público recebe só o id.
CREATE TABLE app.booking_authorization_request (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES app.booking(id),
  purpose text NOT NULL,
  exception_id uuid,
  expected_dates date[] NOT NULL DEFAULT '{}',
  expected_custody_ids uuid[] NOT NULL DEFAULT '{}',
  expected_cancellation_class text,
  availability_attested boolean NOT NULL DEFAULT false,
  basis text NOT NULL,
  requested_by_operation uuid NOT NULL REFERENCES app.operation(id),
  requested_at timestamptz NOT NULL,
  CONSTRAINT booking_authorization_request_one_per_operation UNIQUE (requested_by_operation),
  CONSTRAINT booking_authorization_request_exception_fk FOREIGN KEY (exception_id, booking_id)
    REFERENCES app.booking_exception(id, booking_id),
  CONSTRAINT booking_authorization_request_purpose_check
    CHECK (purpose IN ('no_show', 'recovery', 'exception_cancellation', 'invalidation')),
  CONSTRAINT booking_authorization_request_shape CHECK (
    (purpose IN ('exception_cancellation', 'invalidation')) = (exception_id IS NOT NULL)
    AND (purpose = 'recovery' OR cardinality(expected_custody_ids) = 0)
    AND (purpose <> 'recovery' OR cardinality(expected_dates) = 0)
    AND (purpose = 'exception_cancellation' OR expected_cancellation_class IS NULL)
    AND (purpose = 'recovery' OR NOT availability_attested)
  ),
  CONSTRAINT booking_authorization_request_class_check CHECK (expected_cancellation_class IN ('timely', 'late')),
  CONSTRAINT booking_authorization_request_basis_format CHECK (length(btrim(basis)) BETWEEN 1 AND 255)
);

-- Autorização independente: só pelas funções do papel autorizador (abaixo). Escopo derivado dos fatos.
CREATE TABLE app.booking_authorization (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES app.booking_authorization_request(id),
  booking_id uuid NOT NULL REFERENCES app.booking(id),
  purpose text NOT NULL,
  exception_id uuid,
  scope_dates date[] NOT NULL,
  scope_custody_ids uuid[] NOT NULL,
  expected_cancellation_class text,
  valid_until timestamptz NOT NULL,
  approval_ref text NOT NULL,
  authorized_at timestamptz NOT NULL,
  CONSTRAINT booking_authorization_one_per_request UNIQUE (request_id),
  CONSTRAINT booking_authorization_id_booking_key UNIQUE (id, booking_id),
  CONSTRAINT booking_authorization_exception_fk FOREIGN KEY (exception_id, booking_id)
    REFERENCES app.booking_exception(id, booking_id),
  CONSTRAINT booking_authorization_purpose_check
    CHECK (purpose IN ('no_show', 'recovery', 'exception_cancellation', 'invalidation')),
  CONSTRAINT booking_authorization_shape CHECK (
    (purpose IN ('exception_cancellation', 'invalidation')) = (exception_id IS NOT NULL)
    AND (purpose = 'recovery') = (cardinality(scope_custody_ids) > 0)
    AND (purpose IN ('no_show', 'recovery') OR cardinality(scope_dates) > 0)
    AND (purpose <> 'recovery' OR cardinality(scope_dates) = 0)
    AND (purpose = 'exception_cancellation' OR expected_cancellation_class IS NULL)
  ),
  CONSTRAINT booking_authorization_class_check CHECK (expected_cancellation_class IN ('timely', 'late')),
  CONSTRAINT booking_authorization_validity CHECK (valid_until > authorized_at),
  -- Referência do run aprovado no GitHub Environment (id e tentativa), sem dado da reserva.
  CONSTRAINT booking_authorization_approval_ref_format
    CHECK (approval_ref ~ '^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$')
);
CREATE INDEX booking_authorization_booking_idx ON app.booking_authorization (booking_id, purpose);

CREATE TABLE app.booking_authorization_revocation (
  authorization_id uuid PRIMARY KEY REFERENCES app.booking_authorization(id),
  approval_ref text NOT NULL,
  revoked_at timestamptz NOT NULL,
  CONSTRAINT booking_authorization_revocation_approval_ref_format
    CHECK (approval_ref ~ '^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$')
);

-- Uso único (PK) pela operação do command dono; a FK composta prende o uso à reserva da autorização.
CREATE TABLE app.booking_authorization_use (
  authorization_id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  used_at timestamptz NOT NULL,
  CONSTRAINT booking_authorization_use_authorization_fk FOREIGN KEY (authorization_id, booking_id)
    REFERENCES app.booking_authorization(id, booking_id),
  CONSTRAINT booking_authorization_use_one_per_operation UNIQUE (operation_id)
);

-- Autorização usada pela operação para a reserva (ou nenhuma).
CREATE FUNCTION app.booking_authorization_of_operation(p_operation uuid, p_booking uuid)
  RETURNS app.booking_authorization
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT a.* FROM app.booking_authorization_use u JOIN app.booking_authorization a ON a.id = u.authorization_id
   WHERE u.operation_id = p_operation AND u.booking_id = p_booking
$$;

-- Regras por transição (ADR-0027 §1, §3; spec booking §10.2). INVOKER: os gates enxergam o papel real.
CREATE FUNCTION app.booking_state_transition_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
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
  IF NEW.kind = 'cancellation' THEN
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
REVOKE ALL ON FUNCTION app.booking_state_transition_check() FROM PUBLIC;
CREATE TRIGGER booking_state_transition_check BEFORE INSERT ON app.booking_state_transition
  FOR EACH ROW EXECUTE FUNCTION app.booking_state_transition_check();
CREATE TRIGGER booking_state_transition_no_change BEFORE UPDATE OR DELETE ON app.booking_state_transition
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER booking_state_transition_no_truncate BEFORE TRUNCATE ON app.booking_state_transition
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Projeção (molde de `app.use_right_balance_apply`, W11). SECURITY DEFINER só aqui: o `luxtory_app` não tem UPDATE em
-- `app.booking`. Só como gatilho AFTER INSERT da transição (conferido abaixo), efeito derivado apenas de NEW — linha já
-- validada pelo gatilho INVOKER —, sem parâmetro, sem SQL dinâmico, `search_path` vazio e sem EXECUTE para ninguém.
CREATE FUNCTION app.booking_state_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'booking_state_transition' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'booking state projection runs only after a transition insert'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'booking_state_projection';
  END IF;
  UPDATE app.booking
     SET state = NEW.to_state, last_transition_id = NEW.id,
         cancellation_class = coalesce(cancellation_class, NEW.cancellation_class)
   WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the transition booking does not exist'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_projection';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.booking_state_apply() FROM PUBLIC;
CREATE TRIGGER booking_state_apply AFTER INSERT ON app.booking_state_transition
  FOR EACH ROW EXECUTE FUNCTION app.booking_state_apply();

-- Guarda de UPDATE em `app.booking` para todos os papéis (ADR-0027 §2): só estado, folha e classe mudam, coerentes com a
-- transição referenciada; a classe é gravada uma vez. A W12 proibia todo UPDATE; DELETE e TRUNCATE seguem proibidos.
CREATE FUNCTION app.booking_state_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
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
REVOKE ALL ON FUNCTION app.booking_state_guard() FROM PUBLIC;
DROP TRIGGER booking_no_change ON app.booking;
CREATE TRIGGER booking_no_delete BEFORE DELETE ON app.booking
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER booking_state_guard BEFORE UPDATE ON app.booking
  FOR EACH ROW EXECUTE FUNCTION app.booking_state_guard();

-- Abertura: presa à transição de abertura da mesma operação.
CREATE FUNCTION app.booking_exception_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE t app.booking_state_transition;
BEGIN
  SELECT * INTO t FROM app.booking_state_transition WHERE id = NEW.opened_by_transition_id;
  IF NOT FOUND OR t.kind <> 'exception_opening' OR t.booking_id <> NEW.booking_id THEN
    RAISE EXCEPTION 'an exception is opened by its opening transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_binding';
  END IF;
  PERFORM app.assert_operation_in_transaction(t.operation_id);
  NEW.opened_at := t.recorded_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.booking_exception_open() FROM PUBLIC;
CREATE TRIGGER booking_exception_open BEFORE INSERT ON app.booking_exception
  FOR EACH ROW EXECUTE FUNCTION app.booking_exception_open();

-- Resolução: presa à transição da mesma operação que sai de `in_exception`, sobre a exceção aberta da reserva.
CREATE FUNCTION app.booking_exception_resolve() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE t app.booking_state_transition; e app.booking_exception;
BEGIN
  SELECT * INTO t FROM app.booking_state_transition WHERE id = NEW.transition_id;
  IF NOT FOUND OR t.from_state <> 'in_exception' OR t.booking_id <> NEW.booking_id THEN
    RAISE EXCEPTION 'an exception is resolved by the transition that leaves the exception'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_binding';
  END IF;
  PERFORM app.assert_operation_in_transaction(t.operation_id);
  SELECT * INTO e FROM app.booking_exception WHERE id = NEW.exception_id;
  IF NOT FOUND OR e.booking_id <> t.booking_id OR e.opened_at > t.recorded_at THEN
    RAISE EXCEPTION 'the resolved exception is the open exception of the booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_binding';
  END IF;
  IF NEW.outcome <> t.to_state
     OR NEW.resolution_source <> (CASE WHEN t.kind = 'cancellation' THEN 'titular_cancellation' ELSE 'admin' END) THEN
    RAISE EXCEPTION 'the resolution records the outcome and source of its transition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_binding';
  END IF;
  NEW.resolved_at := t.recorded_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.booking_exception_resolve() FROM PUBLIC;
CREATE TRIGGER booking_exception_resolve BEFORE INSERT ON app.booking_exception_resolution
  FOR EACH ROW EXECUTE FUNCTION app.booking_exception_resolve();

-- Candidato: o job de sistema, só na janela do no-show e uma vez por reserva.
CREATE FUNCTION app.booking_no_show_candidate_flag() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_at timestamptz := clock_timestamp(); b app.booking; i record;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  IF NOT EXISTS (SELECT 1 FROM app.operation
                  WHERE id = NEW.operation_id AND command = 'flag_no_show_candidates' AND role = 'system') THEN
    RAISE EXCEPTION 'only flag_no_show_candidates flags a no-show candidate'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = NEW.booking_id;
  SELECT * INTO i FROM app.booking_period_instants(b.id);
  IF b.state NOT IN ('confirmed', 'in_use')
     OR NOT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, v_at) THEN
    RAISE EXCEPTION 'a no-show candidate is flagged only inside the no-show window'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_no_show_window';
  END IF;
  NEW.flagged_at := v_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.booking_no_show_candidate_flag() FROM PUBLIC;
CREATE TRIGGER booking_no_show_candidate_flag BEFORE INSERT ON app.booking_no_show_candidate
  FOR EACH ROW EXECUTE FUNCTION app.booking_no_show_candidate_flag();

-- Solicitação: operação Admin não crítica (`request_booking_authorization`), sem efeito econômico.
CREATE FUNCTION app.booking_authorization_request_record() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE op app.operation;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.requested_by_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.requested_by_operation;
  IF op.command <> 'request_booking_authorization' THEN
    RAISE EXCEPTION 'only request_booking_authorization records an authorization request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  NEW.requested_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.booking_authorization_request_record() FROM PUBLIC;
CREATE TRIGGER booking_authorization_request_record BEFORE INSERT ON app.booking_authorization_request
  FOR EACH ROW EXECUTE FUNCTION app.booking_authorization_request_record();

-- Uso: K2, Admin ativo, command da finalidade, trava da reserva, não revogada, não usada, dentro da validade.
CREATE FUNCTION app.booking_authorization_use_record() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_at timestamptz; op app.operation; a app.booking_authorization; b app.booking;
BEGIN
  PERFORM app.assert_own_use_lifecycle_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO a FROM app.booking_authorization WHERE id = NEW.authorization_id;
  IF NOT FOUND OR a.booking_id <> NEW.booking_id THEN
    RAISE EXCEPTION 'the authorization belongs to another booking'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
  END IF;
  SELECT * INTO STRICT b FROM app.booking WHERE id = a.booking_id;
  IF op.command <> (CASE a.purpose
       WHEN 'no_show' THEN 'declare_no_show'
       WHEN 'recovery' THEN 'recover_future_capacity'
       WHEN 'exception_cancellation' THEN 'resolve_exception'
       ELSE (CASE WHEN b.stake_id IS NULL THEN 'resolve_exception' ELSE 'correct_use_right' END)
     END)
     OR (op.second_home_id IS NOT NULL AND op.second_home_id <> b.second_home_id) THEN
    RAISE EXCEPTION 'the authorization is for another act'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  PERFORM app.lock_own_use_booking(b);
  v_at := clock_timestamp();
  IF EXISTS (SELECT 1 FROM app.booking_authorization_revocation WHERE authorization_id = a.id) THEN
    RAISE EXCEPTION 'the authorization was revoked'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_revoked';
  END IF;
  IF EXISTS (SELECT 1 FROM app.booking_authorization_use WHERE authorization_id = a.id) THEN
    RAISE EXCEPTION 'the authorization was already used'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_used';
  END IF;
  IF NOT app.booking_authorization_usable(a.valid_until, v_at) THEN
    RAISE EXCEPTION 'the authorization expired'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_expired';
  END IF;
  NEW.used_at := v_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.booking_authorization_use_record() FROM PUBLIC;
CREATE TRIGGER booking_authorization_use_record BEFORE INSERT ON app.booking_authorization_use
  FOR EACH ROW EXECUTE FUNCTION app.booking_authorization_use_record();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['booking_exception', 'booking_exception_resolution', 'booking_no_show_candidate',
      'booking_authorization_request', 'booking_authorization', 'booking_authorization_revocation',
      'booking_authorization_use'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.forbid_change()',
      v_table || '_no_change', v_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change()',
      v_table || '_no_truncate', v_table);
  END LOOP;
END $$;

-- Papel autorizador (ADR-0027 §4): LOGIN sem senha (o fundador define pelo runbook; só num GitHub Environment), sem
-- herança, uma conexão, nenhum privilégio em tabela — só EXECUTE nas duas funções abaixo. Papéis são do cluster: outro
-- banco do servidor (clones de teste) pode já tê-lo criado; os atributos são reafirmados.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'luxtory_booking_authorizer') THEN
    CREATE ROLE luxtory_booking_authorizer LOGIN NOINHERIT CONNECTION LIMIT 1;
  END IF;
END $$;
ALTER ROLE luxtory_booking_authorizer
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 1;
GRANT USAGE ON SCHEMA app TO luxtory_booking_authorizer;

-- Escopo derivado dos fatos no instante, conferido contra o esperado da solicitação (ADR-0027 §4, tabela por finalidade).
-- SECURITY DEFINER: o papel autorizador não lê nem grava tabela; a função grava a autorização como o dono. Recusa por
-- exceção nomeada (o workflow devolve só o código).
CREATE FUNCTION app.authorize_booking_action(p_request_id uuid, p_approval_ref text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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

-- Revogação de autorização ainda não usada; corrida com o uso: exatamente um vence (trava da reserva + FOR UPDATE).
CREATE FUNCTION app.revoke_booking_authorization(p_authorization_id uuid, p_approval_ref text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_booking uuid;
BEGIN
  IF p_authorization_id IS NULL OR p_approval_ref IS NULL
     OR p_approval_ref !~ '^github-run:[1-9][0-9]{0,19}:[1-9][0-9]{0,3}$' THEN
    RAISE EXCEPTION 'revocation input outside the closed schema'
      USING ERRCODE = 'invalid_parameter_value', CONSTRAINT = 'authorization_input';
  END IF;
  SELECT booking_id INTO v_booking FROM app.booking_authorization WHERE id = p_authorization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown authorization'
      USING ERRCODE = 'no_data_found', CONSTRAINT = 'authorization_unknown';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('app.booking:' || v_booking::text, 0));
  PERFORM 1 FROM app.booking_authorization WHERE id = p_authorization_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.booking_authorization_use WHERE authorization_id = p_authorization_id) THEN
    RAISE EXCEPTION 'a used authorization is never revoked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'authorization_already_used';
  END IF;
  IF EXISTS (SELECT 1 FROM app.booking_authorization_revocation WHERE authorization_id = p_authorization_id) THEN
    RAISE EXCEPTION 'the authorization was already revoked'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'authorization_already_revoked';
  END IF;
  INSERT INTO app.booking_authorization_revocation (authorization_id, approval_ref, revoked_at)
  VALUES (p_authorization_id, p_approval_ref, clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION app.authorize_booking_action(uuid, text), app.revoke_booking_authorization(uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.authorize_booking_action(uuid, text), app.revoke_booking_authorization(uuid, text)
  TO luxtory_booking_authorizer;

-- Escrita de noite do papel da aplicação num evento que libera noites (liberação, custódia, `restore`, `correction`):
-- K2, operação da transação, transição `cancelled`/`no_show` da mesma operação para a reserva, noite do período ainda não
-- iniciada no instante da escrita, autoridade revalidada e, nos atos com autorização, noite no escopo gravado.
CREATE FUNCTION app.own_use_lifecycle_write(p_operation uuid, p_booking uuid, p_stay_date date)
  RETURNS app.booking_state_transition
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  t app.booking_state_transition;
  b app.booking;
  op app.operation;
  a app.booking_authorization;
  v_checkin timestamptz;
BEGIN
  PERFORM app.assert_own_use_lifecycle_active();
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT * INTO t FROM app.booking_state_transition
   WHERE operation_id = p_operation AND booking_id = p_booking AND to_state IN ('cancelled', 'no_show');
  SELECT * INTO b FROM app.booking WHERE id = p_booking;
  IF t.id IS NULL OR b.id IS NULL OR p_stay_date < b.checkin_date OR p_stay_date >= b.checkout_date THEN
    RAISE EXCEPTION 'lifecycle writes belong to the closing transition of the same operation and booking night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = p_operation;
  IF t.kind = 'cancellation' THEN
    PERFORM app.lock_own_use_titular(op, b, v_at);
  ELSE
    PERFORM app.lock_own_use_admin_authority(op);
  END IF;
  SELECT checkin_at INTO STRICT v_checkin
    FROM app.second_home_date WHERE second_home_id = b.second_home_id AND stay_date = p_stay_date;
  IF v_checkin <= v_at THEN
    RAISE EXCEPTION 'a started night never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_night_started';
  END IF;
  IF t.kind <> 'cancellation' THEN
    SELECT * INTO a FROM app.booking_authorization_of_operation(p_operation, b.id);
    IF a.id IS NULL OR NOT (p_stay_date = ANY (a.scope_dates)) THEN
      RAISE EXCEPTION 'the night is outside the scope of the authorization'
        USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
    END IF;
  END IF;
  RETURN t;
END $$;

-- Escrita da recuperação (BR-283): K2, Admin ativo, command `recover_future_capacity`, uso da autorização `recovery` da
-- mesma operação, custódia gravada no escopo e noite ainda futura.
CREATE FUNCTION app.own_use_recovery_write(p_operation uuid, p_custody uuid) RETURNS app.booking_authorization
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  op app.operation;
  a app.booking_authorization;
  v_checkin timestamptz;
BEGIN
  PERFORM app.assert_own_use_lifecycle_active();
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = p_operation;
  IF op.command <> 'recover_future_capacity' THEN
    RAISE EXCEPTION 'only recover_future_capacity moves forfeited capacity'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  SELECT x.* INTO a FROM app.booking_authorization_use u JOIN app.booking_authorization x ON x.id = u.authorization_id
   WHERE u.operation_id = p_operation;
  IF NOT FOUND OR a.purpose <> 'recovery' THEN
    RAISE EXCEPTION 'recovery requires the independent authorization of the same operation'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_missing';
  END IF;
  IF NOT (p_custody = ANY (a.scope_custody_ids)) THEN
    RAISE EXCEPTION 'the custody is outside the scope of the authorization'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_authorization_scope';
  END IF;
  SELECT d.checkin_at INTO STRICT v_checkin
    FROM app.date_custody c JOIN app.second_home_date d ON d.second_home_id = c.second_home_id AND d.stay_date = c.stay_date
   WHERE c.id = p_custody;
  IF v_checkin <= v_at THEN
    RAISE EXCEPTION 'only future capacity is recovered'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_booking_night_started';
  END IF;
  RETURN a;
END $$;

-- Efeitos completos do evento que libera noites (ADR-0027 §3, spec booking §10.3), no COMMIT: as noites não iniciadas
-- no instante da transição — e só elas — liberadas com o motivo do evento; no Co-Owner, cada `reserved_right` aberta
-- pela criação da reserva sucedida conforme o evento, com `restore` (tempestivo) ou `correction` (invalidação) do consumo
-- da criação; no Owner, nenhum movimento de custódia ou de Direito de Uso (REQ-081).
CREATE FUNCTION app.assert_booking_closure_complete(p_transition uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
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

-- Recuperação completa, no COMMIT: exatamente as custódias gravadas ainda futuras no instante do uso, cada uma sucedida
-- por `luxtory/inventory/recovered_future_capacity` com a referência da autorização; nada mais pela operação.
CREATE FUNCTION app.assert_booking_recovery_complete(p_authorization uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE u app.booking_authorization_use; a app.booking_authorization; v_n integer;
BEGIN
  SELECT * INTO STRICT u FROM app.booking_authorization_use WHERE authorization_id = p_authorization;
  SELECT * INTO STRICT a FROM app.booking_authorization WHERE id = p_authorization;
  SELECT count(*) INTO v_n
    FROM app.date_custody c JOIN app.second_home_date d ON d.second_home_id = c.second_home_id AND d.stay_date = c.stay_date
   WHERE c.id = ANY (a.scope_custody_ids) AND u.used_at < d.checkin_at;
  IF v_n = 0
     OR (SELECT count(*) FROM app.date_custody p JOIN app.date_custody n ON n.parent_custody_id = p.id
          JOIN app.second_home_date d ON d.second_home_id = p.second_home_id AND d.stay_date = p.stay_date
          WHERE p.id = ANY (a.scope_custody_ids) AND u.used_at < d.checkin_at
            AND p.closed_by_operation = u.operation_id AND n.opened_by_operation = u.operation_id
            AND n.holder_kind = 'luxtory' AND n.purpose = 'inventory'
            AND n.inventory_origin = 'recovered_future_capacity'
            AND n.authorization_ref = 'booking_authorization:' || a.id::text) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = u.operation_id) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = u.operation_id) <> v_n
     OR EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = u.operation_id)
     OR EXISTS (SELECT 1 FROM app.date_occupancy o WHERE o.released_by_operation = u.operation_id)
     OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.operation_id = u.operation_id) THEN
    RAISE EXCEPTION 'recovery moves exactly the authorized future forfeited capacity'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_recovery_complete';
  END IF;
END $$;

-- No COMMIT (`SET CONSTRAINTS … IMMEDIATE` só antecipa e falha diante do estado incompleto): projeção na folha,
-- exceção registrada na abertura, resolução registrada na saída, efeitos completos do fechamento.
CREATE FUNCTION app.booking_state_transition_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE b app.booking;
BEGIN
  SELECT * INTO STRICT b FROM app.booking WHERE id = NEW.booking_id;
  IF b.last_transition_id IS NULL
     OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.previous_transition_id = b.last_transition_id)
     OR b.state IS DISTINCT FROM (SELECT t.to_state FROM app.booking_state_transition t WHERE t.id = b.last_transition_id) THEN
    RAISE EXCEPTION 'the booking state is the last transition of its chain'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_state_projection';
  END IF;
  IF NEW.kind = 'exception_opening'
     AND NOT EXISTS (SELECT 1 FROM app.booking_exception e WHERE e.opened_by_transition_id = NEW.id) THEN
    RAISE EXCEPTION 'an exception opening records its exception'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_recorded';
  END IF;
  IF NEW.from_state = 'in_exception'
     AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.transition_id = NEW.id) THEN
    RAISE EXCEPTION 'leaving an exception records its resolution'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_exception_recorded';
  END IF;
  IF NEW.to_state IN ('cancelled', 'no_show') THEN
    PERFORM app.assert_booking_closure_complete(NEW.id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.booking_state_transition_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER booking_state_transition_constraint AFTER INSERT ON app.booking_state_transition
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.booking_state_transition_constraint();

-- Uso único ⇔ ato: o uso de no-show, cancelamento P-A ou invalidação acompanha a transição da mesma operação; o de
-- recuperação, a recuperação completa.
CREATE FUNCTION app.booking_authorization_use_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.booking_authorization;
BEGIN
  SELECT * INTO STRICT a FROM app.booking_authorization WHERE id = NEW.authorization_id;
  IF a.purpose = 'recovery' THEN
    PERFORM app.assert_booking_recovery_complete(a.id);
  ELSIF NOT EXISTS (
      SELECT 1 FROM app.booking_state_transition t
       WHERE t.operation_id = NEW.operation_id AND t.booking_id = NEW.booking_id AND t.to_state IN ('no_show', 'cancelled')
         AND t.kind = CASE a.purpose WHEN 'no_show' THEN 'no_show'
                       WHEN 'exception_cancellation' THEN 'exception_resolution' ELSE 'invalidation' END) THEN
    RAISE EXCEPTION 'an authorization is used only by the act it authorizes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_authorization_use_effect';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.booking_authorization_use_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER booking_authorization_use_constraint AFTER INSERT ON app.booking_authorization_use
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.booking_authorization_use_constraint();

-- Consultas de invariantes da reserva (W12 + W13), após todo teste db e para a reconciliação da W30.
CREATE OR REPLACE FUNCTION app.booking_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH own AS (
    SELECT b.* FROM app.booking b JOIN app.operation o ON o.id = b.opened_by_operation
     WHERE b.channel = 'own_use' AND o.command = 'create_own_use_booking'
  ), occupied AS (
    SELECT b.id, count(o.id) AS nights FROM own b LEFT JOIN app.date_occupancy o ON o.booking_id = b.id GROUP BY b.id
  ), consumed AS (
    SELECT b.id, count(l.id) AS nights
      FROM own b LEFT JOIN app.use_right_ledger l
        ON l.operation_id = b.opened_by_operation AND l.movement = 'consume'
     GROUP BY b.id
  ), runs AS (
    SELECT o.second_home_id, o.stake_id,
           o.stay_date - (row_number() OVER (PARTITION BY o.stake_id ORDER BY o.stay_date))::integer AS island
      FROM app.date_occupancy o
     WHERE o.channel = 'own_use' AND o.released_at IS NULL AND o.stake_id IS NOT NULL
  ), leaf AS (
    SELECT t.* FROM app.booking_state_transition t
     WHERE NOT EXISTS (SELECT 1 FROM app.booking_state_transition n WHERE n.previous_transition_id = t.id)
  ), open_exception AS (
    SELECT e.booking_id, count(*) AS n FROM app.booking_exception e
     WHERE NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = e.id)
     GROUP BY e.booking_id
  ), closing AS (
    SELECT t.* FROM app.booking_state_transition t WHERE t.to_state IN ('cancelled', 'no_show')
  )
  SELECT 'booking_occupancy_complete', b.second_home_id, b.id::text
    FROM own b JOIN occupied USING (id) WHERE occupied.nights <> b.checkout_date - b.checkin_date
  UNION ALL
  SELECT 'booking_consumption_complete', b.second_home_id, b.id::text
    FROM own b JOIN consumed USING (id)
   WHERE consumed.nights <> CASE WHEN b.stake_id IS NULL THEN 0 ELSE b.checkout_date - b.checkin_date END
  UNION ALL
  SELECT 'stay_length_maximum', r.second_home_id, r.stake_id::text || ':' || r.island::text
    FROM runs r GROUP BY r.second_home_id, r.stake_id, r.island HAVING count(*) > 14
  UNION ALL
  -- TECH-055 e projeção: estado = destino da única folha (ou `confirmed` sem transições); folha = `last_transition_id`.
  SELECT 'booking_state_projection', b.second_home_id, b.id::text
    FROM app.booking b
   WHERE (SELECT count(*) FROM leaf l WHERE l.booking_id = b.id) > 1
      OR b.last_transition_id IS DISTINCT FROM (SELECT l.id FROM leaf l WHERE l.booking_id = b.id LIMIT 1)
      OR b.state <> coalesce((SELECT l.to_state FROM leaf l WHERE l.booking_id = b.id LIMIT 1), 'confirmed')
  UNION ALL
  -- ADR-0027 §2: `in_exception` ⇔ exatamente uma exceção aberta.
  SELECT 'booking_exception_open', b.second_home_id, b.id::text
    FROM app.booking b LEFT JOIN open_exception x ON x.booking_id = b.id
   WHERE (b.state = 'in_exception') <> (coalesce(x.n, 0) = 1) OR coalesce(x.n, 0) > 1
  UNION ALL
  -- Fechamento: nenhuma ocupação ativa numa noite não iniciada no instante do cancelamento ou do no-show.
  SELECT 'booking_closure_occupancy', b.second_home_id, b.id::text
    FROM closing t JOIN app.booking b ON b.id = t.booking_id
   WHERE EXISTS (SELECT 1 FROM app.date_occupancy o
                   JOIN app.second_home_date d ON d.second_home_id = o.second_home_id AND d.stay_date = o.stay_date
                  WHERE o.booking_id = b.id AND o.released_at IS NULL AND t.recorded_at < d.checkin_at)
$$;

-- Privilégios da W13 no papel da aplicação: só inserção nos fatos dos commands, leitura da autorização (área Admin) e
-- nenhuma escrita em autorização ou revogação; sem UPDATE em `app.booking`.
ALTER TABLE app.booking_state_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_exception ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_exception_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_no_show_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_authorization_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_authorization ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_authorization_revocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.booking_authorization_use ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_state_transition_app_read ON app.booking_state_transition FOR SELECT TO luxtory_app USING (true);
CREATE POLICY booking_state_transition_app_insert ON app.booking_state_transition FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY booking_exception_app_read ON app.booking_exception FOR SELECT TO luxtory_app USING (true);
CREATE POLICY booking_exception_app_insert ON app.booking_exception FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY booking_exception_resolution_app_read ON app.booking_exception_resolution FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY booking_exception_resolution_app_insert ON app.booking_exception_resolution FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY booking_no_show_candidate_app_read ON app.booking_no_show_candidate FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY booking_no_show_candidate_app_insert ON app.booking_no_show_candidate FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY booking_authorization_request_app_read ON app.booking_authorization_request FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY booking_authorization_request_app_insert ON app.booking_authorization_request FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY booking_authorization_app_read ON app.booking_authorization FOR SELECT TO luxtory_app USING (true);
CREATE POLICY booking_authorization_revocation_app_read ON app.booking_authorization_revocation FOR SELECT
  TO luxtory_app USING (true);
CREATE POLICY booking_authorization_use_app_read ON app.booking_authorization_use FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY booking_authorization_use_app_insert ON app.booking_authorization_use FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.booking_state_transition, app.booking_exception, app.booking_exception_resolution,
  app.booking_no_show_candidate, app.booking_authorization_request, app.booking_authorization_use TO luxtory_app;
GRANT SELECT ON app.booking_authorization, app.booking_authorization_revocation TO luxtory_app;

REVOKE ALL ON FUNCTION app.assert_own_use_lifecycle_active(), app.booking_checkout_at(date, text),
  app.own_use_cancellation_timely(timestamptz, timestamptz),
  app.booking_no_show_window_open(timestamptz, timestamptz, timestamptz),
  app.booking_authorization_usable(timestamptz, timestamptz), app.booking_period_instants(uuid),
  app.booking_unstarted_nights(uuid, timestamptz), app.booking_release_reason(text),
  app.lock_own_use_admin_authority(app.operation), app.lock_own_use_titular(app.operation, app.booking, timestamptz),
  app.lock_own_use_booking(app.booking), app.booking_authorization_of_operation(uuid, uuid),
  app.own_use_lifecycle_write(uuid, uuid, date), app.own_use_recovery_write(uuid, uuid),
  app.assert_booking_closure_complete(uuid), app.assert_booking_recovery_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_own_use_lifecycle_active(), app.booking_checkout_at(date, text),
  app.own_use_cancellation_timely(timestamptz, timestamptz),
  app.booking_no_show_window_open(timestamptz, timestamptz, timestamptz),
  app.booking_authorization_usable(timestamptz, timestamptz), app.booking_period_instants(uuid),
  app.booking_unstarted_nights(uuid, timestamptz), app.booking_release_reason(text),
  app.lock_own_use_admin_authority(app.operation), app.lock_own_use_titular(app.operation, app.booking, timestamptz),
  app.lock_own_use_booking(app.booking), app.booking_authorization_of_operation(uuid, uuid),
  app.own_use_lifecycle_write(uuid, uuid, date), app.own_use_recovery_write(uuid, uuid),
  app.assert_booking_closure_complete(uuid), app.assert_booking_recovery_complete(uuid) TO luxtory_app;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.booking_state_transition, app.booking_authorization_request, app.capability_activation
    IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.booking_state_transition) OR EXISTS (SELECT 1 FROM app.booking_exception)
     OR EXISTS (SELECT 1 FROM app.booking_no_show_candidate) OR EXISTS (SELECT 1 FROM app.booking_authorization_request)
     OR EXISTS (SELECT 1 FROM app.booking_authorization) THEN
    RAISE EXCEPTION 'W13 rollback would discard booking lifecycle facts';
  END IF;
  IF EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'own_use_lifecycle') THEN
    RAISE EXCEPTION 'W13 rollback would discard an activation decision in app.capability_activation';
  END IF;
END $$;

REVOKE ALL ON app.booking_state_transition, app.booking_exception, app.booking_exception_resolution,
  app.booking_no_show_candidate, app.booking_authorization_request, app.booking_authorization,
  app.booking_authorization_revocation, app.booking_authorization_use FROM luxtory_app;

-- A consulta de invariantes volta à da W12.
CREATE OR REPLACE FUNCTION app.booking_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH own AS (
    SELECT b.* FROM app.booking b JOIN app.operation o ON o.id = b.opened_by_operation
     WHERE b.channel = 'own_use' AND o.command = 'create_own_use_booking'
  ), occupied AS (
    SELECT b.id, count(o.id) AS nights FROM own b LEFT JOIN app.date_occupancy o ON o.booking_id = b.id GROUP BY b.id
  ), consumed AS (
    SELECT b.id, count(l.id) AS nights
      FROM own b LEFT JOIN app.use_right_ledger l
        ON l.operation_id = b.opened_by_operation AND l.movement = 'consume'
     GROUP BY b.id
  ), runs AS (
    SELECT o.second_home_id, o.stake_id,
           o.stay_date - (row_number() OVER (PARTITION BY o.stake_id ORDER BY o.stay_date))::integer AS island
      FROM app.date_occupancy o
     WHERE o.channel = 'own_use' AND o.released_at IS NULL AND o.stake_id IS NOT NULL
  )
  SELECT 'booking_occupancy_complete', b.second_home_id, b.id::text
    FROM own b JOIN occupied USING (id) WHERE occupied.nights <> b.checkout_date - b.checkin_date
  UNION ALL
  SELECT 'booking_consumption_complete', b.second_home_id, b.id::text
    FROM own b JOIN consumed USING (id)
   WHERE consumed.nights <> CASE WHEN b.stake_id IS NULL THEN 0 ELSE b.checkout_date - b.checkin_date END
  UNION ALL
  SELECT 'stay_length_maximum', r.second_home_id, r.stake_id::text || ':' || r.island::text
    FROM runs r GROUP BY r.second_home_id, r.stake_id, r.island HAVING count(*) > 14
$$;

DROP TRIGGER booking_authorization_use_constraint ON app.booking_authorization_use;
DROP FUNCTION app.booking_authorization_use_constraint();
DROP TRIGGER booking_state_transition_constraint ON app.booking_state_transition;
DROP FUNCTION app.booking_state_transition_constraint();
DROP FUNCTION app.assert_booking_recovery_complete(uuid);
DROP FUNCTION app.assert_booking_closure_complete(uuid);
DROP FUNCTION app.own_use_recovery_write(uuid, uuid);
DROP FUNCTION app.own_use_lifecycle_write(uuid, uuid, date);
DROP FUNCTION app.booking_authorization_of_operation(uuid, uuid);
DROP FUNCTION app.revoke_booking_authorization(uuid, text);
DROP FUNCTION app.authorize_booking_action(uuid, text);

DROP TRIGGER booking_state_guard ON app.booking;
DROP TRIGGER booking_no_delete ON app.booking;
CREATE TRIGGER booking_no_change BEFORE UPDATE OR DELETE ON app.booking
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
DROP FUNCTION app.booking_state_guard();
ALTER TABLE app.booking DROP CONSTRAINT booking_last_transition_fk;

DROP TABLE app.booking_authorization_use;
DROP TABLE app.booking_authorization_revocation;
DROP TABLE app.booking_authorization;
DROP TABLE app.booking_authorization_request;
DROP TABLE app.booking_no_show_candidate;
DROP TABLE app.booking_exception_resolution;
DROP TABLE app.booking_exception;
DROP TABLE app.booking_state_transition;
DROP FUNCTION app.booking_authorization_use_record();
DROP FUNCTION app.booking_authorization_request_record();
DROP FUNCTION app.booking_no_show_candidate_flag();
DROP FUNCTION app.booking_exception_resolve();
DROP FUNCTION app.booking_exception_open();
DROP FUNCTION app.booking_state_apply();
DROP FUNCTION app.booking_state_transition_check();

ALTER TABLE app.booking
  DROP CONSTRAINT booking_cancellation_class_check,
  DROP COLUMN cancellation_class,
  DROP COLUMN last_transition_id;

DROP FUNCTION app.lock_own_use_booking(app.booking);
DROP FUNCTION app.lock_own_use_titular(app.operation, app.booking, timestamptz);
DROP FUNCTION app.lock_own_use_admin_authority(app.operation);
DROP FUNCTION app.booking_release_reason(text);
DROP FUNCTION app.booking_unstarted_nights(uuid, timestamptz);
DROP FUNCTION app.booking_period_instants(uuid);
DROP FUNCTION app.booking_authorization_usable(timestamptz, timestamptz);
DROP FUNCTION app.booking_no_show_window_open(timestamptz, timestamptz, timestamptz);
DROP FUNCTION app.own_use_cancellation_timely(timestamptz, timestamptz);
DROP FUNCTION app.booking_checkout_at(date, text);
DROP FUNCTION app.assert_own_use_lifecycle_active();

ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check CHECK (capability IN ('own_use_booking'));

REVOKE USAGE ON SCHEMA app FROM luxtory_booking_authorizer;
DO $$
BEGIN
  DROP ROLE IF EXISTS luxtory_booking_authorizer;
EXCEPTION WHEN dependent_objects_still_exist THEN
  -- Outro banco do cluster ainda concede privilégios ao papel (clones de teste): ele continua existindo lá.
  NULL;
END $$;
