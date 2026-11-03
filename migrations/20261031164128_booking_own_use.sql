-- migrate:up
-- W12 (REQ-034, REQ-035, REQ-037, PD-002, INV-1; TECH-023, TECH-043, TECH-045, TECH-050, TECH-051, TECH-053, TECH-055):
-- reserva de uso próprio. Spec: docs/specs/booking.md; ADR-0026. O banco aceita uma reserva só com a ativação
-- privilegiada presente, pela operação do command `create_own_use_booking`, para a party que detém a holding vigente e
-- é representada por delegação ativa, sobre noites seladas e futuras e, no Co-Owner, com a janela aberta — tudo no
-- instante em que valida a linha (`clock_timestamp()`), gravado em `confirmed_at`. O instante físico do COMMIT não é
-- garantido: `SET CONSTRAINTS … IMMEDIATE` antecipa checagens diferidas (ADR-0026, semântica T3).

-- Precondição (falha fechada): nenhuma ocupação antes da reserva existir (W10: a aplicação não tinha INSERT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.date_occupancy) THEN
    RAISE EXCEPTION 'W12 cannot start over occupancies recorded before bookings existed';
  END IF;
END $$;

-- Dono do schema ou superusuário: o mesmo critério dos gates da W10/W11 (migrations e fixtures de teste).
CREATE FUNCTION app.acts_as_schema_owner() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
     WHERE r.rolname = current_user
       AND (r.rolsuper OR r.oid = (SELECT c.relowner FROM pg_catalog.pg_class c
                                    WHERE c.oid = 'app.date_custody'::regclass)))
$$;

-- Ativação privilegiada (ADR-0026): só o dono do schema escreve, por migration autorizada pelo fundador depois da W13.
-- A W12 cria a tabela vazia. A aplicação só lê.
CREATE TABLE app.capability_activation (
  capability text PRIMARY KEY,
  activated_at timestamptz NOT NULL,
  authorization_ref text NOT NULL,
  CONSTRAINT capability_activation_capability_check CHECK (capability IN ('own_use_booking')),
  CONSTRAINT capability_activation_authorization_ref_check
    CHECK (length(btrim(authorization_ref)) BETWEEN 1 AND 255)
);
ALTER TABLE app.capability_activation ENABLE ROW LEVEL SECURITY;
CREATE POLICY capability_activation_app_read ON app.capability_activation FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.capability_activation TO luxtory_app;

-- Toda escrita da reserva passa por aqui (reserva, custódia, consumo, ocupação): sem a linha, recusa — inclusive SQL
-- direto do papel da aplicação. A leitura da tabela a mantém travada em modo compartilhado até o fim da transação: a
-- desativação (`LOCK … ACCESS EXCLUSIVE` + DELETE) espera as reservas em curso e barra as novas.
CREATE FUNCTION app.assert_own_use_booking_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'own_use_booking') THEN
    RAISE EXCEPTION 'own use booking is not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'booking_not_activated';
  END IF;
END $$;

-- Instante de um horário local no fuso, ou NULL quando ele não existe ou é ambíguo (mudança de horário): a mesma recusa
-- do TypeScript (`disambiguation: 'reject'`), conferida por equivalência nos testes.
CREATE FUNCTION app.local_instant(p_local timestamp, p_timezone text) RETURNS timestamptz
  LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE
    WHEN (x.t AT TIME ZONE p_timezone) = p_local
     AND NOT EXISTS (
       SELECT 1 FROM unnest(ARRAY[interval '30 minutes', interval '1 hour', interval '2 hours']) AS s(shift)
        WHERE ((x.t - s.shift) AT TIME ZONE p_timezone) = p_local
           OR ((x.t + s.shift) AT TIME ZONE p_timezone) = p_local)
    THEN x.t END
  FROM (SELECT p_local AT TIME ZONE p_timezone AS t) AS x
$$;

-- TECH-042 (W11, spec calendar §6): abertura da janela de uso da Ação no exercício — gêmea SQL de `windowOpensAt` com a
-- posição ordinária da BR-101; o 29/02 abre na base para a Ação contemplada. NULL: sem sorteio revelado, exercício
-- anterior ao primeiro ou horário local inexistente/ambíguo (falha fechada, como no TypeScript).
CREATE FUNCTION app.use_window_opens_at(p_second_home_id uuid, p_stake_id uuid, p_exercise integer,
    p_leap_day boolean)
  RETURNS timestamptz
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  v_timezone text;
  v_initial integer;
  v_ordinary timestamptz;
  v_base timestamptz;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id = p_second_home_id AND modality = 'co_owner';
  IF NOT FOUND OR p_exercise < a.exercise_year THEN RETURN NULL; END IF;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = p_second_home_id;
  SELECT p.position INTO v_initial
    FROM app.initial_draw d
    JOIN app.initial_draw_reveal r ON r.draw_id = d.id
    JOIN app.initial_draw_position p ON p.draw_id = d.id AND p.stake_id = p_stake_id
   WHERE d.acquisition_id = a.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ordinary := app.local_instant(make_date(p_exercise - 1, 9, 15)::timestamp, v_timezone);
  IF v_ordinary IS NULL THEN RETURN NULL; END IF;
  v_base := greatest(v_ordinary, a.formalized_at);
  IF p_leap_day THEN RETURN v_base; END IF;
  RETURN app.local_instant(
    (v_base AT TIME ZONE v_timezone)
      + make_interval(days => (app.ordinary_position(v_initial, a.configuration_id, a.exercise_year, p_exercise) - 1) * 7),
    v_timezone);
END $$;

-- TECH-050 / ADR-0021: o usuário da operação representa a party por delegação ativa e vigente no instante, travada em
-- modo compartilhado contra a revogação concorrente (a revogação espera a reserva, ou a reserva relê a linha revogada).
CREATE FUNCTION app.lock_own_use_representation(p_user uuid, p_party uuid, p_at timestamptz) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM app.party_delegation d
   WHERE d.user_id = p_user AND d.party_id = p_party AND d.state = 'active'
     AND d.valid_from <= p_at AND (d.valid_until IS NULL OR p_at < d.valid_until)
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the acting user does not represent the party at this instant'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
END $$;

-- `03` §3.1: canal, Titular (holding da época, imutável), Ação, período `[check-in, check-out)` (ADR-003), estado
-- (TECH-055). Política e cancelamento chegam com a W13. Uma reserva por operação: o vínculo de custódia, consumo e
-- ocupação no banco é pela operação.
CREATE TABLE app.booking (
  id uuid PRIMARY KEY,
  second_home_id uuid NOT NULL,
  channel text NOT NULL,
  holding_id uuid NOT NULL REFERENCES app.holding(id),
  stake_id uuid,
  checkin_date date NOT NULL,
  checkout_date date NOT NULL,
  state text NOT NULL,
  opened_by_operation uuid NOT NULL REFERENCES app.operation(id),
  -- Instante de aceite pelo mecanismo de reserva (validação da linha, `clock_timestamp()`), carimbado pelo banco: não é
  -- o instante físico do COMMIT nem garantia de visibilidade.
  confirmed_at timestamptz NOT NULL,
  CONSTRAINT booking_stake_same_second_home FOREIGN KEY (stake_id, second_home_id)
    REFERENCES app.stake(id, second_home_id),
  CONSTRAINT booking_id_second_home_key UNIQUE (id, second_home_id),
  CONSTRAINT booking_one_per_operation UNIQUE (opened_by_operation),
  CONSTRAINT booking_channel_check CHECK (channel IN (
    'own_use', 'luxtory_use', 'luxchange_request', 'luxchange_direct', 'luxplus', 'rental_external'
  )),
  CONSTRAINT booking_state_check
    CHECK (state IN ('confirmed', 'in_use', 'completed', 'cancelled', 'no_show', 'in_exception')),
  -- TECH-110, BR-110: ao menos uma noite (mapeado a ERR_STAY_LENGTH).
  CONSTRAINT stay_minimum_one_night CHECK (checkout_date > checkin_date)
);
CREATE INDEX booking_stake_idx ON app.booking (stake_id, checkin_date);
CREATE INDEX booking_second_home_idx ON app.booking (second_home_id, checkin_date);

-- A ocupação aponta para a reserva da mesma Second Home (W10 deixou a FK para a W12).
ALTER TABLE app.date_occupancy
  ADD CONSTRAINT date_occupancy_booking_fk FOREIGN KEY (booking_id, second_home_id)
    REFERENCES app.booking(id, second_home_id);
CREATE INDEX date_occupancy_booking_idx ON app.date_occupancy (booking_id);
CREATE INDEX date_occupancy_stake_idx ON app.date_occupancy (stake_id, stay_date) WHERE released_at IS NULL;

-- Aceite da reserva no instante da validação (T3): uma única leitura de `clock_timestamp()` decide janela, representação
-- e noite futura, e vira `confirmed_at`. As escritas seguintes revalidam no próprio instante (migration seguinte).
CREATE FUNCTION app.booking_open() RETURNS trigger
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
REVOKE ALL ON FUNCTION app.booking_open() FROM PUBLIC;
CREATE TRIGGER booking_open BEFORE INSERT ON app.booking
  FOR EACH ROW EXECUTE FUNCTION app.booking_open();
-- Estados e cancelamento chegam com a W13: até lá, nada muda nem sai.
CREATE TRIGGER booking_no_change BEFORE UPDATE OR DELETE ON app.booking
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER booking_no_truncate BEFORE TRUNCATE ON app.booking
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.booking ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_app_read ON app.booking FOR SELECT TO luxtory_app USING (true);
CREATE POLICY booking_app_insert ON app.booking FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.booking TO luxtory_app;

REVOKE ALL ON FUNCTION app.acts_as_schema_owner(), app.assert_own_use_booking_active(),
  app.local_instant(timestamp, text), app.use_window_opens_at(uuid, uuid, integer, boolean),
  app.lock_own_use_representation(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.acts_as_schema_owner(), app.assert_own_use_booking_active(),
  app.local_instant(timestamp, text), app.use_window_opens_at(uuid, uuid, integer, boolean),
  app.lock_own_use_representation(uuid, uuid, timestamptz) TO luxtory_app;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.booking IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.booking) THEN
    RAISE EXCEPTION 'W12 rollback would discard facts in app.booking';
  END IF;
  IF EXISTS (SELECT 1 FROM app.capability_activation) THEN
    RAISE EXCEPTION 'W12 rollback would discard an activation decision in app.capability_activation';
  END IF;
END $$;
DROP INDEX app.date_occupancy_stake_idx;
DROP INDEX app.date_occupancy_booking_idx;
ALTER TABLE app.date_occupancy DROP CONSTRAINT date_occupancy_booking_fk;
DROP TABLE app.booking;
DROP FUNCTION app.booking_open();
DROP FUNCTION app.lock_own_use_representation(uuid, uuid, timestamptz);
DROP FUNCTION app.use_window_opens_at(uuid, uuid, integer, boolean);
DROP FUNCTION app.local_instant(timestamp, text);
DROP FUNCTION app.assert_own_use_booking_active();
DROP TABLE app.capability_activation;
DROP FUNCTION app.acts_as_schema_owner();
