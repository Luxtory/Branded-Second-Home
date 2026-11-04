-- migrate:up
-- W13 E1 (TECH-026, TECH-110; REQ-080, REQ-084; BR-163, BR-280; ADR-0025 §8, ADR-0027 §3, §8): `restore` e
-- `correction` do Direito de Uso presos ao evento da reserva. `restore` só no cancelamento tempestivo (Titular ou P-A),
-- sobre o consumo da criação da mesma noite; `correction` só na invalidação Co-Owner (`correct_use_right`), reversão do
-- consumo de noite não iniciada (`consumed − quantity`). No máximo uma reversão por consumo. A correção de expiração
-- continua fechada a todos (emenda de escopo da D2).

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
  t app.booking_state_transition;
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
    IF NEW.movement = 'restore' AND NOT app.acts_as_schema_owner() THEN
      -- W13 (ADR-0027 §3): a restauração pertence ao cancelamento tempestivo (Titular ou P-A) da reserva cujo consumo
      -- da criação ela desfaz, na mesma noite.
      PERFORM app.assert_own_use_lifecycle_active();
      SELECT * INTO v_target FROM app.use_right_ledger WHERE id = NEW.refers_to_id;
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = v_target.operation_id;
      IF v_target.id IS NULL OR b.id IS NULL OR v_target.movement <> 'consume' OR b.stake_id IS DISTINCT FROM NEW.stake_id THEN
        RAISE EXCEPTION 'a restoration undoes the consumption of the booking that consumed the night'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.operation_id, b.id, NEW.stay_date);
      IF t.kind NOT IN ('cancellation', 'exception_resolution') OR t.cancellation_class IS DISTINCT FROM 'timely' THEN
        RAISE EXCEPTION 'only a timely cancellation restores the use right'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_restore_binding';
      END IF;
    ELSIF NEW.movement = 'consume' AND NOT app.acts_as_schema_owner() THEN
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
    -- TECH-026, ADR-0027 §8: a correção de expiração continua fechada a todos, inclusive ao dono do schema.
    IF v_target.movement = 'expire' THEN
      RAISE EXCEPTION 'use right corrections of an expiration are not enabled'
        USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_correction_not_enabled';
    END IF;
    -- TECH-026: reversão exata do consumo (`quantity` igual; efeito `consumed − quantity` na projeção).
    IF NEW.quantity <> v_target.quantity THEN
      RAISE EXCEPTION 'a correction reverses exactly the quantity of the consumption'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_correction_quantity';
    END IF;
    PERFORM app.assert_operation_in_transaction(NEW.operation_id);
    IF NOT app.acts_as_schema_owner() THEN
      -- REQ-084: só `correct_use_right` da invalidação Co-Owner, sobre o consumo da criação de noite não iniciada.
      PERFORM app.assert_own_use_lifecycle_active();
      SELECT * INTO b FROM app.booking WHERE opened_by_operation = v_target.operation_id;
      IF NOT FOUND OR b.stake_id IS DISTINCT FROM NEW.stake_id THEN
        RAISE EXCEPTION 'a correction reverses the consumption of the invalidated booking'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
      END IF;
      SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.operation_id, b.id, v_target.stay_date);
      IF t.kind <> 'invalidation' OR NOT EXISTS (SELECT 1 FROM app.operation
                                                  WHERE id = NEW.operation_id AND command = 'correct_use_right') THEN
        RAISE EXCEPTION 'only correct_use_right corrects a consumption'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_correction_binding';
      END IF;
    END IF;
    IF now() >= app.use_right_effective_end(NEW.bucket, NEW.exercise_year, v_timezone) THEN
      RAISE EXCEPTION 'use right is not usable after its effective end'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_use_right_expired';
    END IF;
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

-- TECH-026: no máximo uma reversão por consumo, `restore` ou `correction` (o índice da W11 cobre só `restore`).
CREATE UNIQUE INDEX conflict_use_right_reversal ON app.use_right_ledger (refers_to_id)
  WHERE movement IN ('restore', 'correction');

-- Projeção: a correção desfaz o consumo que reverte (`consumed − quantity`). O resto é o da W11. CREATE OR REPLACE mantém
-- dono e privilégios (sem EXECUTE para ninguém).
CREATE OR REPLACE FUNCTION app.use_right_balance_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_remaining integer;
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'use_right_ledger' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'use right balance maintenance runs only after a ledger insert'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_balance_maintenance';
  END IF;
  IF NEW.movement = 'grant' THEN
    INSERT INTO app.use_right_balance (second_home_id, stake_id, exercise_year, bucket, granted)
    VALUES (NEW.second_home_id, NEW.stake_id, NEW.exercise_year, NEW.bucket, NEW.quantity);
    RETURN NULL;
  END IF;
  IF NEW.movement = 'consume' THEN
    UPDATE app.use_right_balance SET consumed = consumed + NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket;
  ELSIF NEW.movement = 'restore'
     OR (NEW.movement = 'correction'
         AND EXISTS (SELECT 1 FROM app.use_right_ledger t WHERE t.id = NEW.refers_to_id AND t.movement = 'consume')) THEN
    UPDATE app.use_right_balance SET consumed = consumed - NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket;
  ELSIF NEW.movement = 'expire' THEN
    UPDATE app.use_right_balance SET expired = expired + NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket
    RETURNING remaining INTO v_remaining;
  ELSE
    RAISE EXCEPTION 'no balance effect is defined for movement %', NEW.movement
      USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_movement_effect';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no use right was granted for this stake, exercise and category'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_not_granted';
  END IF;
  -- A expiração cobre exatamente o saldo restante: nem parte (prorrogação), nem mais (CHECK acima).
  IF NEW.movement = 'expire' AND v_remaining <> 0 THEN
    RAISE EXCEPTION 'an expiration covers exactly the remaining balance'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_expire_exact';
  END IF;
  RETURN NULL;
END $$;

-- Invariantes do Direito de Uso com a correção (W13): a projeção é o ledger (concessão; consumo − restauração −
-- correção; expiração); toda correção reverte exatamente um consumo, nunca expiração ou concessão.
CREATE OR REPLACE FUNCTION app.use_right_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH ledger AS (
    SELECT l.second_home_id, l.stake_id, l.exercise_year, l.bucket,
           sum(l.quantity) FILTER (WHERE l.movement = 'grant')::integer AS granted,
           (coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'consume'), 0)
            - coalesce(sum(l.quantity) FILTER (WHERE l.movement IN ('restore', 'correction')), 0))::integer AS consumed,
           coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'expire'), 0)::integer AS expired
      FROM app.use_right_ledger l
     GROUP BY l.second_home_id, l.stake_id, l.exercise_year, l.bucket
  ),
  grants AS (
    SELECT l.second_home_id, l.exercise_year, l.bucket, count(*) AS stakes,
           min(l.quantity) AS low, max(l.quantity) AS high
      FROM app.use_right_ledger l
     WHERE l.movement = 'grant' AND l.bucket IN ('alta', 'media')
     GROUP BY l.second_home_id, l.exercise_year, l.bucket
  )
  SELECT 'TECH-026', coalesce(b.second_home_id, g.second_home_id),
         concat_ws(':', coalesce(b.stake_id, g.stake_id), coalesce(b.exercise_year, g.exercise_year),
                   coalesce(b.bucket, g.bucket))
    FROM app.use_right_balance b
    FULL JOIN ledger g ON g.stake_id = b.stake_id AND g.exercise_year = b.exercise_year AND g.bucket = b.bucket
   WHERE (b.granted, b.consumed, b.expired) IS DISTINCT FROM (g.granted, g.consumed, g.expired)
  UNION ALL
  -- INV-4: todas as N Ações com o mesmo Direito de Uso (BR-071, BR-107); no exercício completo, exatamente o limite da
  -- configuração e N × limite + capacidade Luxtory = 103 Alta/Super Alta e 262 Média/Baixa (folga zero). O exercício
  -- parcial segue a alocação aprovada na W8 (D3).
  SELECT 'INV-4', a.second_home_id, concat_ws(':', g.exercise_year, g.bucket)
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN grants g ON g.second_home_id = a.second_home_id
   WHERE g.stakes <> c.id OR g.low <> g.high
      OR ((g.exercise_year > a.exercise_year
           OR (extract(month FROM a.operation_start_date) = 1 AND extract(day FROM a.operation_start_date) = 1))
          AND (g.low <> CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
               OR c.id * CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
                  + CASE g.bucket WHEN 'alta' THEN c.luxtory_alta ELSE c.luxtory_media END
                  <> CASE g.bucket WHEN 'alta' THEN 103 ELSE 262 END))
  UNION ALL
  -- TECH-026: exercício Co-Owner selado posterior ao primeiro carrega as 2N concessões.
  SELECT 'TECH-026', a.second_home_id, s.exercise_year::text
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN (SELECT DISTINCT d.second_home_id, d.exercise_year FROM app.second_home_date d) s
      ON s.second_home_id = a.second_home_id
   WHERE a.modality = 'co_owner' AND s.exercise_year > a.exercise_year
     AND (SELECT count(*) FROM app.use_right_ledger l
           WHERE l.second_home_id = a.second_home_id AND l.exercise_year = s.exercise_year
             AND l.movement = 'grant' AND l.bucket IN ('alta', 'media')) <> 2 * c.id
  UNION ALL
  -- INV-5 e REQ-030: consumo e restauração no bucket e no exercício da própria noite.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
    JOIN app.second_home_date d ON d.second_home_id = l.second_home_id AND d.stay_date = l.stay_date
   WHERE l.movement IN ('consume', 'restore')
     AND (l.exercise_year <> d.exercise_year OR l.bucket <> CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END)
  UNION ALL
  -- INV-5 e PD-004: expiração registrada no fim efetivo canônico, nunca no instante do job.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l JOIN app.second_home h ON h.id = l.second_home_id
   WHERE l.movement = 'expire'
     AND l.effective_at IS DISTINCT FROM app.use_right_effective_end(l.bucket, l.exercise_year, h.timezone)
  UNION ALL
  -- TECH-027: o 29/02 só para a Ação contemplada pela lista bissexta, sempre 1.
  SELECT 'TECH-027', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
   WHERE l.movement = 'grant' AND l.bucket = 'leap'
     AND (l.quantity <> 1 OR l.stake_id IS DISTINCT FROM app.leap_day_beneficiary(l.second_home_id, l.exercise_year))
  UNION ALL
  -- TECH-026, TECH-110: a correção reverte exatamente um consumo da mesma Ação, exercício e categoria — nunca
  -- expiração ou concessão.
  SELECT 'TECH-026', l.second_home_id, l.id::text
    FROM app.use_right_ledger l LEFT JOIN app.use_right_ledger t ON t.id = l.refers_to_id
   WHERE l.movement = 'correction'
     AND (t.id IS NULL OR t.movement <> 'consume' OR t.quantity <> l.quantity
          OR (t.stake_id, t.exercise_year, t.bucket) IS DISTINCT FROM (l.stake_id, l.exercise_year, l.bucket))
$$;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.use_right_ledger IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.use_right_ledger WHERE movement = 'correction') THEN
    RAISE EXCEPTION 'W13 rollback would discard use right corrections in app.use_right_ledger';
  END IF;
END $$;

-- Invariantes, projeção e gatilho voltam aos da W11/W12.
CREATE OR REPLACE FUNCTION app.use_right_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- TECH-026: a projeção é exatamente o ledger (concessão; consumo − restauração; expiração).
  WITH ledger AS (
    SELECT l.second_home_id, l.stake_id, l.exercise_year, l.bucket,
           sum(l.quantity) FILTER (WHERE l.movement = 'grant')::integer AS granted,
           (coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'consume'), 0)
            - coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'restore'), 0))::integer AS consumed,
           coalesce(sum(l.quantity) FILTER (WHERE l.movement = 'expire'), 0)::integer AS expired
      FROM app.use_right_ledger l
     GROUP BY l.second_home_id, l.stake_id, l.exercise_year, l.bucket
  ),
  grants AS (
    SELECT l.second_home_id, l.exercise_year, l.bucket, count(*) AS stakes,
           min(l.quantity) AS low, max(l.quantity) AS high
      FROM app.use_right_ledger l
     WHERE l.movement = 'grant' AND l.bucket IN ('alta', 'media')
     GROUP BY l.second_home_id, l.exercise_year, l.bucket
  )
  SELECT 'TECH-026', coalesce(b.second_home_id, g.second_home_id),
         concat_ws(':', coalesce(b.stake_id, g.stake_id), coalesce(b.exercise_year, g.exercise_year),
                   coalesce(b.bucket, g.bucket))
    FROM app.use_right_balance b
    FULL JOIN ledger g ON g.stake_id = b.stake_id AND g.exercise_year = b.exercise_year AND g.bucket = b.bucket
   WHERE (b.granted, b.consumed, b.expired) IS DISTINCT FROM (g.granted, g.consumed, g.expired)
  UNION ALL
  -- INV-4: todas as N Ações com o mesmo Direito de Uso (BR-071, BR-107); no exercício completo, exatamente o limite da
  -- configuração e N × limite + capacidade Luxtory = 103 Alta/Super Alta e 262 Média/Baixa (folga zero). O exercício
  -- parcial segue a alocação aprovada na W8 (D3).
  SELECT 'INV-4', a.second_home_id, concat_ws(':', g.exercise_year, g.bucket)
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN grants g ON g.second_home_id = a.second_home_id
   WHERE g.stakes <> c.id OR g.low <> g.high
      OR ((g.exercise_year > a.exercise_year
           OR (extract(month FROM a.operation_start_date) = 1 AND extract(day FROM a.operation_start_date) = 1))
          AND (g.low <> CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
               OR c.id * CASE g.bucket WHEN 'alta' THEN c.alta ELSE c.media END
                  + CASE g.bucket WHEN 'alta' THEN c.luxtory_alta ELSE c.luxtory_media END
                  <> CASE g.bucket WHEN 'alta' THEN 103 ELSE 262 END))
  UNION ALL
  -- TECH-026: exercício Co-Owner selado posterior ao primeiro carrega as 2N concessões.
  SELECT 'TECH-026', a.second_home_id, s.exercise_year::text
    FROM app.acquisition a
    JOIN app.second_home_configuration c ON c.id = a.configuration_id
    JOIN (SELECT DISTINCT d.second_home_id, d.exercise_year FROM app.second_home_date d) s
      ON s.second_home_id = a.second_home_id
   WHERE a.modality = 'co_owner' AND s.exercise_year > a.exercise_year
     AND (SELECT count(*) FROM app.use_right_ledger l
           WHERE l.second_home_id = a.second_home_id AND l.exercise_year = s.exercise_year
             AND l.movement = 'grant' AND l.bucket IN ('alta', 'media')) <> 2 * c.id
  UNION ALL
  -- INV-5 e REQ-030: consumo e restauração no bucket e no exercício da própria noite.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
    JOIN app.second_home_date d ON d.second_home_id = l.second_home_id AND d.stay_date = l.stay_date
   WHERE l.movement IN ('consume', 'restore')
     AND (l.exercise_year <> d.exercise_year OR l.bucket <> CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END)
  UNION ALL
  -- INV-5 e PD-004: expiração registrada no fim efetivo canônico, nunca no instante do job.
  SELECT 'INV-5', l.second_home_id, l.id::text
    FROM app.use_right_ledger l JOIN app.second_home h ON h.id = l.second_home_id
   WHERE l.movement = 'expire'
     AND l.effective_at IS DISTINCT FROM app.use_right_effective_end(l.bucket, l.exercise_year, h.timezone)
  UNION ALL
  -- TECH-027: o 29/02 só para a Ação contemplada pela lista bissexta, sempre 1.
  SELECT 'TECH-027', l.second_home_id, l.id::text
    FROM app.use_right_ledger l
   WHERE l.movement = 'grant' AND l.bucket = 'leap'
     AND (l.quantity <> 1 OR l.stake_id IS DISTINCT FROM app.leap_day_beneficiary(l.second_home_id, l.exercise_year))
  UNION ALL
  -- TECH-026: correção nunca existe antes da W13 (nem altera concessão depois).
  SELECT 'TECH-026', l.second_home_id, l.id::text
    FROM app.use_right_ledger l WHERE l.movement = 'correction'
$$;

CREATE OR REPLACE FUNCTION app.use_right_balance_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_remaining integer;
BEGIN
  IF TG_TABLE_SCHEMA <> 'app' OR TG_TABLE_NAME <> 'use_right_ledger' OR TG_WHEN <> 'AFTER'
     OR TG_OP <> 'INSERT' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'use right balance maintenance runs only after a ledger insert'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_balance_maintenance';
  END IF;
  IF NEW.movement = 'grant' THEN
    INSERT INTO app.use_right_balance (second_home_id, stake_id, exercise_year, bucket, granted)
    VALUES (NEW.second_home_id, NEW.stake_id, NEW.exercise_year, NEW.bucket, NEW.quantity);
    RETURN NULL;
  END IF;
  IF NEW.movement = 'consume' THEN
    UPDATE app.use_right_balance SET consumed = consumed + NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket;
  ELSIF NEW.movement = 'restore' THEN
    UPDATE app.use_right_balance SET consumed = consumed - NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket;
  ELSIF NEW.movement = 'expire' THEN
    UPDATE app.use_right_balance SET expired = expired + NEW.quantity
     WHERE stake_id = NEW.stake_id AND exercise_year = NEW.exercise_year AND bucket = NEW.bucket
    RETURNING remaining INTO v_remaining;
  ELSE
    RAISE EXCEPTION 'no balance effect is defined for movement %', NEW.movement
      USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_movement_effect';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no use right was granted for this stake, exercise and category'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_not_granted';
  END IF;
  -- A expiração cobre exatamente o saldo restante: nem parte (prorrogação), nem mais (CHECK acima).
  IF NEW.movement = 'expire' AND v_remaining <> 0 THEN
    RAISE EXCEPTION 'an expiration covers exactly the remaining balance'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_expire_exact';
  END IF;
  RETURN NULL;
END $$;

DROP INDEX app.conflict_use_right_reversal;

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
