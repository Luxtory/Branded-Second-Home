-- migrate:up
-- W12 (TECH-026, TECH-045, TECH-052; ADR-0025 §8, ADR-0026): consumo do Direito de Uso preso à reserva, completude da
-- reserva e permanência conferidas pelo banco, e as leituras do Titular — linhas por RLS (a holding vigente representada
-- por delegação ativa, política da W8) e campos por privilégio de coluna.

-- O consumo deixa o gate da W11 para o papel da aplicação só quando preso à reserva; restauração e correção continuam
-- fechadas (W13). O resto do gatilho é o da W11, sem mudança.
CREATE OR REPLACE FUNCTION app.use_right_ledger_movement() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  c app.second_home_configuration;
  v_timezone text;
  v_night app.second_home_date;
  v_target app.use_right_ledger;
  v_end timestamptz;
  b app.booking;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE id = NEW.acquisition_id AND second_home_id = NEW.second_home_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'use right movements belong to a formalized acquisition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_acquisition';
  END IF;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = NEW.second_home_id;

  IF NEW.movement = 'grant' THEN
    IF NEW.operation_id = a.operation_id THEN
      -- Concessão da formalização (W8): conferida pela constraint diferida da W8. O 29/02 nunca nasce nela.
      IF NEW.bucket = 'leap' THEN
        RAISE EXCEPTION 'February 29 is never granted by the formalization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_grant_source';
      END IF;
      RETURN NEW;
    END IF;
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.operation_id AND command = 'open_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only open_exercise grants use rights after the formalization'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_operation';
    END IF;
    IF a.modality <> 'co_owner' OR NEW.source IS DISTINCT FROM 'configuration' THEN
      RAISE EXCEPTION 'operational grants come only from the Co-Owner configuration'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_source';
    END IF;
    IF NEW.bucket IN ('alta', 'media') THEN
      -- BR-107/BR-108: o primeiro exercício é da formalização; a partir do seguinte, os limites da configuração.
      IF NEW.exercise_year <= a.exercise_year THEN
        RAISE EXCEPTION 'the first exercise is granted only by the formalization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_source';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM app.second_home_date d
                      WHERE d.second_home_id = NEW.second_home_id AND d.exercise_year = NEW.exercise_year) THEN
        RAISE EXCEPTION 'use rights are granted only for a sealed exercise'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_exercise_sealed';
      END IF;
      SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id = a.configuration_id;
      IF NEW.quantity <> (CASE NEW.bucket WHEN 'alta' THEN c.alta ELSE c.media END) THEN
        RAISE EXCEPTION 'a grant equals the configuration limit of its category'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_quantity';
      END IF;
    ELSE
      -- TECH-027: o 29/02 selado da operação, só para a Ação contemplada e nunca depois do vencimento (D5: sem
      -- concessão retroativa de direito vencido; a lista avança pelo calendário, sem compensação).
      IF NOT EXISTS (SELECT 1 FROM app.second_home_date d
                      WHERE d.second_home_id = NEW.second_home_id AND d.exercise_year = NEW.exercise_year
                        AND d.is_leap_day) THEN
        RAISE EXCEPTION 'February 29 is granted only when the night is sealed'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_night_sealed';
      END IF;
      IF NEW.stake_id IS DISTINCT FROM app.leap_day_beneficiary(NEW.second_home_id, NEW.exercise_year) THEN
        RAISE EXCEPTION 'only the stake in the leap-day rotation receives February 29'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_beneficiary';
      END IF;
      IF now() >= app.use_right_effective_end('leap', NEW.exercise_year, v_timezone) THEN
        RAISE EXCEPTION 'an expired February 29 right is never granted'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_expired';
      END IF;
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.movement IN ('consume', 'restore') THEN
    IF NEW.movement = 'restore' THEN
      -- A restauração chega com o cancelamento da W13: até lá, só o dono do schema (gate da W11).
      PERFORM app.assert_use_right_consumption_enabled();
    ELSIF NOT app.acts_as_schema_owner() THEN
      -- W12 (ADR-0026): o consumo pertence à reserva da mesma operação e segue a `reserved_right` da Ação que ela abriu
      -- na noite; ativação, representação e noite futura revalidadas no instante da escrita.
      b := app.assert_own_use_write(NEW.operation_id, NEW.second_home_id, NEW.stay_date);
      IF b.stake_id IS DISTINCT FROM NEW.stake_id OR NOT EXISTS (
           SELECT 1 FROM app.date_custody dc
            WHERE dc.second_home_id = NEW.second_home_id AND dc.stay_date = NEW.stay_date AND dc.closed_at IS NULL
              AND dc.holder_kind = 'use_right' AND dc.basis = 'reserved_right' AND dc.stake_id = NEW.stake_id
              AND dc.opened_by_operation = NEW.operation_id) THEN
        RAISE EXCEPTION 'a consumption follows the reserved right opened by its own use booking'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_consumption_binding';
      END IF;
    END IF;
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    SELECT * INTO v_night FROM app.second_home_date
     WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'use right is consumed only on a sealed night'
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'custody_use_right_night_sealed';
    END IF;
    -- REQ-030, TECH-027, INV-5: a noite consome o bucket da própria categoria e do próprio exercício.
    IF NEW.exercise_year <> v_night.exercise_year
       OR NEW.bucket <> (CASE WHEN v_night.is_leap_day THEN 'leap' ELSE v_night.season END) THEN
      RAISE EXCEPTION 'a night consumes only its own exercise and category'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_night_bucket';
    END IF;
    IF now() >= app.use_right_effective_end(NEW.bucket, NEW.exercise_year, v_timezone) THEN
      RAISE EXCEPTION 'use right is not usable after its effective end'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_use_right_expired';
    END IF;
    IF NEW.movement = 'restore' THEN
      SELECT * INTO v_target FROM app.use_right_ledger WHERE id = NEW.refers_to_id;
      IF NOT FOUND OR v_target.movement <> 'consume'
         OR (v_target.stake_id, v_target.exercise_year, v_target.bucket, v_target.stay_date)
            IS DISTINCT FROM (NEW.stake_id, NEW.exercise_year, NEW.bucket, NEW.stay_date) THEN
        RAISE EXCEPTION 'a restoration undoes exactly one consumption of the same night'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_restore_target';
      END IF;
    END IF;
  ELSIF NEW.movement = 'expire' THEN
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.operation_id AND command = 'close_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only close_exercise records an expiration'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_expire_operation';
    END IF;
    v_end := app.use_right_effective_end(NEW.bucket, NEW.exercise_year, v_timezone);
    IF v_end IS NULL OR now() < v_end THEN
      RAISE EXCEPTION 'a use right expires only after its effective end'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_not_expired';
    END IF;
    -- O instante canônico, nunca o da execução do job: atraso não prorroga nem desloca o vencimento.
    NEW.effective_at := v_end;
  ELSE
    SELECT * INTO v_target FROM app.use_right_ledger WHERE id = NEW.refers_to_id;
    IF NOT FOUND OR v_target.movement NOT IN ('consume', 'expire')
       OR (v_target.stake_id, v_target.exercise_year, v_target.bucket)
          IS DISTINCT FROM (NEW.stake_id, NEW.exercise_year, NEW.bucket) THEN
      RAISE EXCEPTION 'a correction refers only to a consumption or expiration of the same stake, exercise and category'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_correction_target';
    END IF;
    -- TECH-026: nunca altera concessão. Direção, limites e prova chegam com o command da W13 (D2).
    RAISE EXCEPTION 'use right corrections are not enabled before W13'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_correction_not_enabled';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

-- Um consumo por noite da reserva: reaproveitar uma operação `pending` (gotcha da W10) não consome de novo.
CREATE UNIQUE INDEX booking_consumption_once ON app.use_right_ledger (operation_id, stake_id, stay_date)
  WHERE movement = 'consume';
CREATE INDEX date_custody_opened_by_idx ON app.date_custody (opened_by_operation);
CREATE INDEX date_custody_closed_by_idx ON app.date_custody (closed_by_operation) WHERE closed_by_operation IS NOT NULL;

-- Completude da reserva (ADR-0026): cada noite do período tem exatamente uma ocupação dela; no Co-Owner, também a
-- `spe_pool` fechada, a `reserved_right` da Ação aberta e um consumo, tudo pela mesma operação; no Owner, nenhum dos
-- dois (REQ-037). E a permanência (BR-111, BR-112, TECH-045): a sequência de noites consecutivas da Ação com ocupação
-- `own_use` ativa que contém a reserva não passa de 14 — uma reserva que preenche o intervalo entre duas soma as três. A
-- janela de ±15 dias basta: uma sequência maior que 14 que toque a reserva já mostra 15 noites dentro dela.
CREATE FUNCTION app.assert_booking_complete(p_booking uuid) RETURNS void
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

-- Disparada pela reserva, pela ocupação `own_use` e pelo consumo, no COMMIT. `SET CONSTRAINTS … IMMEDIATE` só antecipa:
-- a FK obriga a reserva a existir antes da ocupação, então a checagem antecipada vê o estado incompleto e falha; cada
-- inserção posterior dispara de novo. O dono do schema passa por cima, como nos gates (migrations e fixtures).
CREATE FUNCTION app.booking_complete_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_booking uuid;
BEGIN
  IF app.acts_as_schema_owner() THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'booking' THEN
    v_booking := NEW.id;
  ELSIF TG_TABLE_NAME = 'date_occupancy' THEN
    v_booking := NEW.booking_id;
  ELSE
    SELECT id INTO v_booking FROM app.booking WHERE opened_by_operation = NEW.operation_id;
  END IF;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'own use writes belong to a booking'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
  END IF;
  PERFORM app.assert_booking_complete(v_booking);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.booking_complete_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER booking_complete_constraint AFTER INSERT ON app.booking
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.booking_complete_constraint();
CREATE CONSTRAINT TRIGGER date_occupancy_booking_constraint AFTER INSERT ON app.date_occupancy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.channel = 'own_use')
  EXECUTE FUNCTION app.booking_complete_constraint();
CREATE CONSTRAINT TRIGGER use_right_ledger_booking_constraint AFTER INSERT ON app.use_right_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.movement = 'consume')
  EXECUTE FUNCTION app.booking_complete_constraint();

-- Consultas de invariantes da reserva, após todo teste db (como W10/W11) e para a reconciliação da W30: só reservas do
-- command (as fixtures de inventário da W10 gravam ocupações de teste sem ele).
CREATE FUNCTION app.booking_invariant_breaches()
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

REVOKE ALL ON FUNCTION app.assert_booking_complete(uuid), app.booking_invariant_breaches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_booking_complete(uuid), app.booking_invariant_breaches() TO luxtory_app;

-- Leituras do Titular (TECH-052): a RLS restringe linhas à holding vigente que o usuário representa (política da W8 em
-- `app.holding`); o privilégio de coluna restringe campos — nunca Ação, reserva, operação ou party de terceiros. A
-- disponibilidade de uma noite aparece só como fato (custódia e ocupação ativas), sem dizer de quem.
GRANT SELECT (id, second_home_id, checkin_date, checkout_date, state, confirmed_at) ON app.booking TO authenticated;
CREATE POLICY booking_holder_read ON app.booking FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h
           WHERE (booking.stake_id IS NOT NULL AND h.stake_id = booking.stake_id)
              OR (booking.stake_id IS NULL AND h.role = 'owner' AND h.second_home_id = booking.second_home_id))
);
GRANT SELECT (stake_id, exercise_year, bucket, granted, consumed, expired, remaining)
  ON app.use_right_balance TO authenticated;
CREATE POLICY use_right_balance_holder_read ON app.use_right_balance FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.stake_id = use_right_balance.stake_id)
);
GRANT SELECT (second_home_id, stay_date, exercise_year, season, is_leap_day, checkin_at)
  ON app.second_home_date TO authenticated;
CREATE POLICY second_home_date_holder_read ON app.second_home_date FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id = second_home_date.second_home_id)
);
GRANT SELECT (second_home_id, stay_date, holder_kind, closed_at) ON app.date_custody TO authenticated;
CREATE POLICY date_custody_holder_read ON app.date_custody FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id = date_custody.second_home_id)
);
GRANT SELECT (second_home_id, stay_date, released_at) ON app.date_occupancy TO authenticated;
CREATE POLICY date_occupancy_holder_read ON app.date_occupancy FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id = date_occupancy.second_home_id)
);

-- Central de notificações (REQ-097): cada party vê só as próprias, enquanto o usuário a representa. A tabela ganha RLS
-- com as mesmas permissões que o papel da aplicação já tinha.
ALTER TABLE app.notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_app_read ON app.notification FOR SELECT TO luxtory_app USING (true);
CREATE POLICY notification_app_insert ON app.notification FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY notification_app_update ON app.notification FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT (id, kind, data, created_at, read_at) ON app.notification TO authenticated;
CREATE POLICY notification_recipient_read ON app.notification FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.party_delegation d
           WHERE d.party_id = notification.recipient_party_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);


-- migrate:down
DROP POLICY notification_recipient_read ON app.notification;
REVOKE SELECT (id, kind, data, created_at, read_at) ON app.notification FROM authenticated;
DROP POLICY notification_app_update ON app.notification;
DROP POLICY notification_app_insert ON app.notification;
DROP POLICY notification_app_read ON app.notification;
ALTER TABLE app.notification DISABLE ROW LEVEL SECURITY;
DROP POLICY date_occupancy_holder_read ON app.date_occupancy;
REVOKE SELECT (second_home_id, stay_date, released_at) ON app.date_occupancy FROM authenticated;
DROP POLICY date_custody_holder_read ON app.date_custody;
REVOKE SELECT (second_home_id, stay_date, holder_kind, closed_at) ON app.date_custody FROM authenticated;
DROP POLICY second_home_date_holder_read ON app.second_home_date;
REVOKE SELECT (second_home_id, stay_date, exercise_year, season, is_leap_day, checkin_at)
  ON app.second_home_date FROM authenticated;
DROP POLICY use_right_balance_holder_read ON app.use_right_balance;
REVOKE SELECT (stake_id, exercise_year, bucket, granted, consumed, expired, remaining)
  ON app.use_right_balance FROM authenticated;
DROP POLICY booking_holder_read ON app.booking;
REVOKE SELECT (id, second_home_id, checkin_date, checkout_date, state, confirmed_at) ON app.booking FROM authenticated;

DROP FUNCTION app.booking_invariant_breaches();
DROP TRIGGER use_right_ledger_booking_constraint ON app.use_right_ledger;
DROP TRIGGER date_occupancy_booking_constraint ON app.date_occupancy;
DROP TRIGGER booking_complete_constraint ON app.booking;
DROP FUNCTION app.booking_complete_constraint();
DROP FUNCTION app.assert_booking_complete(uuid);
DROP INDEX app.date_custody_closed_by_idx;
DROP INDEX app.date_custody_opened_by_idx;
DROP INDEX app.booking_consumption_once;

-- O gatilho do ledger volta ao da W11.

CREATE OR REPLACE FUNCTION app.use_right_ledger_movement() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  c app.second_home_configuration;
  v_timezone text;
  v_night app.second_home_date;
  v_target app.use_right_ledger;
  v_end timestamptz;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE id = NEW.acquisition_id AND second_home_id = NEW.second_home_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'use right movements belong to a formalized acquisition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_acquisition';
  END IF;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = NEW.second_home_id;

  IF NEW.movement = 'grant' THEN
    IF NEW.operation_id = a.operation_id THEN
      -- Concessão da formalização (W8): conferida pela constraint diferida da W8. O 29/02 nunca nasce nela.
      IF NEW.bucket = 'leap' THEN
        RAISE EXCEPTION 'February 29 is never granted by the formalization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_grant_source';
      END IF;
      RETURN NEW;
    END IF;
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.operation_id AND command = 'open_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only open_exercise grants use rights after the formalization'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_operation';
    END IF;
    IF a.modality <> 'co_owner' OR NEW.source IS DISTINCT FROM 'configuration' THEN
      RAISE EXCEPTION 'operational grants come only from the Co-Owner configuration'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_source';
    END IF;
    IF NEW.bucket IN ('alta', 'media') THEN
      -- BR-107/BR-108: o primeiro exercício é da formalização; a partir do seguinte, os limites da configuração.
      IF NEW.exercise_year <= a.exercise_year THEN
        RAISE EXCEPTION 'the first exercise is granted only by the formalization'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_source';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM app.second_home_date d
                      WHERE d.second_home_id = NEW.second_home_id AND d.exercise_year = NEW.exercise_year) THEN
        RAISE EXCEPTION 'use rights are granted only for a sealed exercise'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_exercise_sealed';
      END IF;
      SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id = a.configuration_id;
      IF NEW.quantity <> (CASE NEW.bucket WHEN 'alta' THEN c.alta ELSE c.media END) THEN
        RAISE EXCEPTION 'a grant equals the configuration limit of its category'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_grant_quantity';
      END IF;
    ELSE
      -- TECH-027: o 29/02 selado da operação, só para a Ação contemplada e nunca depois do vencimento (D5: sem
      -- concessão retroativa de direito vencido; a lista avança pelo calendário, sem compensação).
      IF NOT EXISTS (SELECT 1 FROM app.second_home_date d
                      WHERE d.second_home_id = NEW.second_home_id AND d.exercise_year = NEW.exercise_year
                        AND d.is_leap_day) THEN
        RAISE EXCEPTION 'February 29 is granted only when the night is sealed'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_night_sealed';
      END IF;
      IF NEW.stake_id IS DISTINCT FROM app.leap_day_beneficiary(NEW.second_home_id, NEW.exercise_year) THEN
        RAISE EXCEPTION 'only the stake in the leap-day rotation receives February 29'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_beneficiary';
      END IF;
      IF now() >= app.use_right_effective_end('leap', NEW.exercise_year, v_timezone) THEN
        RAISE EXCEPTION 'an expired February 29 right is never granted'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_leap_expired';
      END IF;
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.movement IN ('consume', 'restore') THEN
    PERFORM app.assert_use_right_consumption_enabled();
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    SELECT * INTO v_night FROM app.second_home_date
     WHERE second_home_id = NEW.second_home_id AND stay_date = NEW.stay_date;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'use right is consumed only on a sealed night'
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'custody_use_right_night_sealed';
    END IF;
    -- REQ-030, TECH-027, INV-5: a noite consome o bucket da própria categoria e do próprio exercício.
    IF NEW.exercise_year <> v_night.exercise_year
       OR NEW.bucket <> (CASE WHEN v_night.is_leap_day THEN 'leap' ELSE v_night.season END) THEN
      RAISE EXCEPTION 'a night consumes only its own exercise and category'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_night_bucket';
    END IF;
    IF now() >= app.use_right_effective_end(NEW.bucket, NEW.exercise_year, v_timezone) THEN
      RAISE EXCEPTION 'use right is not usable after its effective end'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_use_right_expired';
    END IF;
    IF NEW.movement = 'restore' THEN
      SELECT * INTO v_target FROM app.use_right_ledger WHERE id = NEW.refers_to_id;
      IF NOT FOUND OR v_target.movement <> 'consume'
         OR (v_target.stake_id, v_target.exercise_year, v_target.bucket, v_target.stay_date)
            IS DISTINCT FROM (NEW.stake_id, NEW.exercise_year, NEW.bucket, NEW.stay_date) THEN
        RAISE EXCEPTION 'a restoration undoes exactly one consumption of the same night'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_restore_target';
      END IF;
    END IF;
  ELSIF NEW.movement = 'expire' THEN
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    IF NOT EXISTS (SELECT 1 FROM app.operation
                    WHERE id = NEW.operation_id AND command = 'close_exercise' AND role = 'system') THEN
      RAISE EXCEPTION 'only close_exercise records an expiration'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_expire_operation';
    END IF;
    v_end := app.use_right_effective_end(NEW.bucket, NEW.exercise_year, v_timezone);
    IF v_end IS NULL OR now() < v_end THEN
      RAISE EXCEPTION 'a use right expires only after its effective end'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_use_right_not_expired';
    END IF;
    -- O instante canônico, nunca o da execução do job: atraso não prorroga nem desloca o vencimento.
    NEW.effective_at := v_end;
  ELSE
    SELECT * INTO v_target FROM app.use_right_ledger WHERE id = NEW.refers_to_id;
    IF NOT FOUND OR v_target.movement NOT IN ('consume', 'expire')
       OR (v_target.stake_id, v_target.exercise_year, v_target.bucket)
          IS DISTINCT FROM (NEW.stake_id, NEW.exercise_year, NEW.bucket) THEN
      RAISE EXCEPTION 'a correction refers only to a consumption or expiration of the same stake, exercise and category'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_correction_target';
    END IF;
    -- TECH-026: nunca altera concessão. Direção, limites e prova chegam com o command da W13 (D2).
    RAISE EXCEPTION 'use right corrections are not enabled before W13'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_correction_not_enabled';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
