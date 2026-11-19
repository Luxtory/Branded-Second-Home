-- migrate:up
-- W14 (TECH-022, TECH-023, TECH-027, TECH-051, TECH-053; REQ-016, REQ-036, INV-4; BR-120 a BR-122; ADR-0024 §3,
-- ADR-0030 §1–§2): regra de autorização no banco da seleção Luxtory `spe_pool → luxtory/{finalidade}`. Só a custódia
-- (03 §7): seleção de capacidade não é ocupação. A transição já consta da tabela fechada da W10
-- (`app.custody_transition_valid`, com `inventory ⇔ annual_allocation`); a W14 só a libera para o papel da aplicação,
-- presa ao command `select_luxtory_capacity` da mesma operação, à Admin ativa da operação, à K3 `luxtory_selection`
-- (fechada: nenhuma linha), à janela N+1, à noite futura e não bissexta e à capacidade Luxtory da categoria. Toda outra
-- transição, fechamento ou ocupação continua exatamente como na W13. Finalidade ≠ inventory não tem saída na TECH-022
-- (P-12): a seleção é irreversível até nova versão do 03.

-- K3 (ADR-0030 §2): a W14 só amplia o CHECK. Nenhuma linha.
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection'));

-- Toda escrita da seleção pelo papel da aplicação passa por aqui: sem a linha, recusa — inclusive SQL direto. A leitura
-- mantém a tabela travada em modo compartilhado até o fim da transação (mesma contenção da K1 e da K2).
CREATE FUNCTION app.assert_luxtory_selection_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxtory_selection') THEN
    RAISE EXCEPTION 'Luxtory selection is not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'luxtory_selection_not_activated';
  END IF;
END $$;

-- BR-122, TECH-042: a janela da Luxtory é a posição N+1 — gêmea SQL de `windowOpensAt({ position: N + 1 })`, mesma base
-- de `app.use_window_opens_at` (15/09 local do ano anterior ou a formalização, se posterior) + N × 7 dias civis. NULL:
-- sem Co-Owner, exercício anterior ao primeiro, sorteio não revelado (a Luxtory é sempre a última; sem ordem Co-Owner
-- não há janela) ou horário local inexistente/ambíguo (falha fechada).
CREATE FUNCTION app.luxtory_window_opens_at(p_second_home_id uuid, p_exercise integer) RETURNS timestamptz
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE a app.acquisition; v_timezone text; v_stakes integer; v_ordinary timestamptz; v_base timestamptz;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id = p_second_home_id AND modality = 'co_owner';
  IF NOT FOUND OR p_exercise < a.exercise_year THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.initial_draw d JOIN app.initial_draw_reveal r ON r.draw_id = d.id
                  WHERE d.acquisition_id = a.id) THEN
    RETURN NULL;
  END IF;
  SELECT timezone INTO STRICT v_timezone FROM app.second_home WHERE id = p_second_home_id;
  SELECT count(*) INTO v_stakes FROM app.stake WHERE second_home_id = p_second_home_id;
  v_ordinary := app.local_instant(make_date(p_exercise - 1, 9, 15)::timestamp, v_timezone);
  IF v_ordinary IS NULL THEN RETURN NULL; END IF;
  v_base := greatest(v_ordinary, a.formalized_at);
  RETURN app.local_instant((v_base AT TIME ZONE v_timezone) + make_interval(days => v_stakes * 7), v_timezone);
END $$;

-- BR-120, TECH-020, TECH-026: capacidade anual Luxtory da categoria — a da alocação inicial no primeiro exercício
-- parcial, a da configuração nos demais. O 29/02 não integra a capacidade ordinária (TECH-027).
CREATE FUNCTION app.luxtory_capacity(p_second_home_id uuid, p_exercise integer, p_season text) RETURNS integer
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE a app.acquisition; v_alta integer; v_media integer;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id = p_second_home_id AND modality = 'co_owner';
  IF NOT FOUND OR p_exercise < a.exercise_year THEN RETURN 0; END IF;
  IF p_exercise = a.exercise_year AND a.initial_allocation_id IS NOT NULL THEN
    SELECT luxtory_alta, luxtory_media INTO STRICT v_alta, v_media
      FROM app.second_home_initial_allocation WHERE id = a.initial_allocation_id;
  ELSE
    SELECT luxtory_alta, luxtory_media INTO STRICT v_alta, v_media
      FROM app.second_home_configuration WHERE id = a.configuration_id;
  END IF;
  RETURN CASE p_season WHEN 'alta' THEN v_alta WHEN 'media' THEN v_media ELSE 0 END;
END $$;

-- Cada escrita da seleção revalida no próprio instante (`clock_timestamp()`, T3): K3, operação da transação, command e
-- Second Home da operação, atribuição Admin ativa (travada contra a revogação), noite futura, não bissexta e janela N+1
-- aberta. Recusas nomeadas pelos prefixos de `rejectionForConstraint` (custódia, janela, saldo/limite sazonal).
CREATE FUNCTION app.assert_luxtory_selection_write(p_operation uuid, p_second_home_id uuid, p_stay_date date)
  RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; d app.second_home_date; v_at timestamptz; v_opens timestamptz;
BEGIN
  PERFORM app.assert_luxtory_selection_active();
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = p_operation;
  IF op.command <> 'select_luxtory_capacity' OR op.second_home_id IS DISTINCT FROM p_second_home_id THEN
    RAISE EXCEPTION 'a Luxtory selection belongs to its select_luxtory_capacity operation and Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxtory_selection_binding';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  SELECT * INTO STRICT d FROM app.second_home_date WHERE second_home_id = p_second_home_id AND stay_date = p_stay_date;
  v_at := clock_timestamp();
  IF d.checkin_at <= v_at THEN
    RAISE EXCEPTION 'a Luxtory selection is written only before the check-in of the night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_selection_night_future';
  END IF;
  IF d.is_leap_day THEN
    RAISE EXCEPTION 'February 29 is outside the ordinary Luxtory capacity'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_selection_leap_day';
  END IF;
  v_opens := app.luxtory_window_opens_at(p_second_home_id, d.exercise_year);
  IF v_opens IS NULL OR v_at < v_opens THEN
    RAISE EXCEPTION 'the Luxtory window of the exercise is not open'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'window_luxtory_selection';
  END IF;
END $$;

-- INV-4 do lado da Luxtory (REQ-016): custódias ativas da seleção (finalidade ≠ inventory ou `annual_allocation`) no
-- exercício e na categoria da noite nunca passam da capacidade. Trava consultiva por (Second Home, exercício) entre as
-- classes 5 e 6 do TECH-053 (precedente: a trava da reserva da W13): seleções concorrentes se serializam no banco e a
-- contagem depois da trava enxerga as confirmadas.
CREATE FUNCTION app.assert_luxtory_capacity_available(p_second_home_id uuid, p_stay_date date) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE d app.second_home_date; v_used integer;
BEGIN
  SELECT * INTO STRICT d FROM app.second_home_date WHERE second_home_id = p_second_home_id AND stay_date = p_stay_date;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('app.luxtory_capacity:' || p_second_home_id::text || ':' || d.exercise_year::text, 0));
  SELECT count(*) INTO v_used
    FROM app.date_custody c
    JOIN app.second_home_date n ON n.second_home_id = c.second_home_id AND n.stay_date = c.stay_date
   WHERE c.second_home_id = p_second_home_id AND c.closed_at IS NULL AND c.holder_kind = 'luxtory'
     AND (c.purpose <> 'inventory' OR c.inventory_origin = 'annual_allocation')
     AND n.exercise_year = d.exercise_year AND n.season = d.season AND NOT n.is_leap_day;
  IF v_used >= app.luxtory_capacity(p_second_home_id, d.exercise_year, d.season) THEN
    RAISE EXCEPTION 'the Luxtory capacity of the season category is exhausted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_luxtory_capacity';
  END IF;
END $$;

-- Abertura: o ramo da W14 é inserido antes do `ELSE` final; o resto é literalmente o da W13 (20261104030102).

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
    IF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'
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

-- Fechamento: a aplicação também fecha `spe_pool` da seleção Luxtory da mesma operação (W14); o resto é o da W13.
CREATE OR REPLACE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE b app.booking; t app.booking_state_transition; a app.booking_authorization;
BEGIN
  IF NOT app.acts_as_schema_owner() THEN
    IF OLD.holder_kind = 'spe_pool'
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

CREATE OR REPLACE FUNCTION app.inventory_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, stay_date date)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- TECH-021: noite selada com exatamente uma custódia ativa.
  SELECT 'TECH-021', d.second_home_id, d.stay_date
    FROM app.second_home_date d
   WHERE (SELECT count(*) FROM app.date_custody c
           WHERE c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date AND c.closed_at IS NULL) <> 1
  UNION ALL
  -- INV-1 (dona: W12; aqui só a barreira): no máximo uma ocupação ativa por noite.
  SELECT 'INV-1', o.second_home_id, o.stay_date
    FROM app.date_occupancy o WHERE o.released_at IS NULL
   GROUP BY o.second_home_id, o.stay_date HAVING count(*) > 1
  UNION ALL
  -- INV-2: ocupação ativa sobre a custódia ativa da mesma noite, num par da matriz da TECH-023.
  SELECT 'INV-2', o.second_home_id, o.stay_date
    FROM app.date_occupancy o JOIN app.date_custody c ON c.id = o.custody_id
   WHERE o.released_at IS NULL AND (c.closed_at IS NOT NULL OR NOT app.occupancy_pair_valid(o, c))
  UNION ALL
  -- INV-3: custódia ativa no Inventário Luxtory com exatamente uma das três origens e autorização identificável.
  SELECT 'INV-3', c.second_home_id, c.stay_date
    FROM app.date_custody c
   WHERE c.closed_at IS NULL AND c.holder_kind = 'luxtory' AND c.purpose = 'inventory'
     AND (c.inventory_origin IS NULL OR c.authorization_ref IS NULL
          OR c.inventory_origin NOT IN ('annual_allocation', 'luxchange_cession', 'recovered_future_capacity'))
  UNION ALL
  -- TECH-022: sucessora aberta pela operação que fechou a mãe, dentro da tabela fechada.
  SELECT 'TECH-022', n.second_home_id, n.stay_date
    FROM app.date_custody n
    JOIN app.date_custody p ON p.id = n.parent_custody_id
    LEFT JOIN app.date_custody g ON g.id = p.parent_custody_id
   WHERE p.closed_by_operation IS DISTINCT FROM n.opened_by_operation OR NOT app.custody_transition_valid(p, n, g)
  UNION ALL
  -- TECH-022: uma única raiz por noite.
  SELECT 'TECH-022', c.second_home_id, c.stay_date
    FROM app.date_custody c WHERE c.parent_custody_id IS NULL
   GROUP BY c.second_home_id, c.stay_date HAVING count(*) > 1
  UNION ALL
  -- INV-4 (W14): custódias ativas da seleção Luxtory por exercício e categoria dentro da capacidade Luxtory; o 29/02
  -- nunca é selecionado (TECH-027).
  SELECT 'INV-4', c.second_home_id, max(c.stay_date)
    FROM app.date_custody c
    JOIN app.second_home_date d ON d.second_home_id = c.second_home_id AND d.stay_date = c.stay_date
   WHERE c.closed_at IS NULL AND c.holder_kind = 'luxtory'
     AND (c.purpose <> 'inventory' OR c.inventory_origin = 'annual_allocation')
   GROUP BY c.second_home_id, d.exercise_year, d.season
  HAVING count(*) > app.luxtory_capacity(c.second_home_id, d.exercise_year, d.season) OR bool_or(d.is_leap_day)
$$;

REVOKE ALL ON FUNCTION app.assert_luxtory_selection_active(), app.luxtory_window_opens_at(uuid, integer),
  app.luxtory_capacity(uuid, integer, text), app.assert_luxtory_selection_write(uuid, uuid, date),
  app.assert_luxtory_capacity_available(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_luxtory_selection_active(), app.luxtory_window_opens_at(uuid, integer),
  app.luxtory_capacity(uuid, integer, text), app.assert_luxtory_selection_write(uuid, uuid, date),
  app.assert_luxtory_capacity_available(uuid, date) TO luxtory_app;


-- migrate:down
-- Recusado com a K3 presente (decisão de ativação). Sem ela (banco vazio do `db:check`), voltam exatamente os corpos da
-- W13 e da W10; custódias de seleção já gravadas continuam válidas pela tabela fechada da W10.
DO $$
BEGIN
  LOCK TABLE app.capability_activation IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxtory_selection') THEN
    RAISE EXCEPTION 'W14 rollback would remove the Luxtory selection rule under an activation decision';
  END IF;
END $$;

-- Corpos da W13 (20261104030102) e da W10 (20261029193232), restaurados literalmente.
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
    IF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'
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
    IF OLD.holder_kind = 'spe_pool' THEN
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

CREATE OR REPLACE FUNCTION app.inventory_invariant_breaches()
  RETURNS TABLE (invariant text, second_home_id uuid, stay_date date)
  LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- TECH-021: noite selada com exatamente uma custódia ativa.
  SELECT 'TECH-021', d.second_home_id, d.stay_date
    FROM app.second_home_date d
   WHERE (SELECT count(*) FROM app.date_custody c
           WHERE c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date AND c.closed_at IS NULL) <> 1
  UNION ALL
  -- INV-1 (dona: W12; aqui só a barreira): no máximo uma ocupação ativa por noite.
  SELECT 'INV-1', o.second_home_id, o.stay_date
    FROM app.date_occupancy o WHERE o.released_at IS NULL
   GROUP BY o.second_home_id, o.stay_date HAVING count(*) > 1
  UNION ALL
  -- INV-2: ocupação ativa sobre a custódia ativa da mesma noite, num par da matriz da TECH-023.
  SELECT 'INV-2', o.second_home_id, o.stay_date
    FROM app.date_occupancy o JOIN app.date_custody c ON c.id = o.custody_id
   WHERE o.released_at IS NULL AND (c.closed_at IS NOT NULL OR NOT app.occupancy_pair_valid(o, c))
  UNION ALL
  -- INV-3: custódia ativa no Inventário Luxtory com exatamente uma das três origens e autorização identificável.
  SELECT 'INV-3', c.second_home_id, c.stay_date
    FROM app.date_custody c
   WHERE c.closed_at IS NULL AND c.holder_kind = 'luxtory' AND c.purpose = 'inventory'
     AND (c.inventory_origin IS NULL OR c.authorization_ref IS NULL
          OR c.inventory_origin NOT IN ('annual_allocation', 'luxchange_cession', 'recovered_future_capacity'))
  UNION ALL
  -- TECH-022: sucessora aberta pela operação que fechou a mãe, dentro da tabela fechada.
  SELECT 'TECH-022', n.second_home_id, n.stay_date
    FROM app.date_custody n
    JOIN app.date_custody p ON p.id = n.parent_custody_id
    LEFT JOIN app.date_custody g ON g.id = p.parent_custody_id
   WHERE p.closed_by_operation IS DISTINCT FROM n.opened_by_operation OR NOT app.custody_transition_valid(p, n, g)
  UNION ALL
  -- TECH-022: uma única raiz por noite.
  SELECT 'TECH-022', c.second_home_id, c.stay_date
    FROM app.date_custody c WHERE c.parent_custody_id IS NULL
   GROUP BY c.second_home_id, c.stay_date HAVING count(*) > 1
$$;

DROP FUNCTION app.assert_luxtory_capacity_available(uuid, date);
DROP FUNCTION app.assert_luxtory_selection_write(uuid, uuid, date);
DROP FUNCTION app.luxtory_capacity(uuid, integer, text);
DROP FUNCTION app.luxtory_window_opens_at(uuid, integer);
DROP FUNCTION app.assert_luxtory_selection_active();
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle'));
