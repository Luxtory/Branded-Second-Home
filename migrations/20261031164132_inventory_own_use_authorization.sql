-- migrate:up
-- W12 (TECH-021, TECH-022, TECH-023; ADR-0024 §3, ADR-0026): regra de autorização no banco da transição
-- `spe_pool → use_right/reserved_right` e da ocupação `own_use`, presas à reserva da mesma operação. Só esses dois casos
-- deixam o gate da W10 para o papel da aplicação; toda outra transição, fechamento ou ocupação e a liberação continuam
-- só do dono do schema (`app.assert_inventory_transition_enabled`, intocado).

-- Cada escrita da reserva revalida no próprio instante (`clock_timestamp()`, T3): ativação, operação da transação,
-- reserva da mesma operação cobrindo a noite, representação vigente e noite ainda futura (TECH-043).
CREATE FUNCTION app.assert_own_use_write(p_operation uuid, p_second_home_id uuid, p_stay_date date)
  RETURNS app.booking
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
  b app.booking;
  op app.operation;
  v_valid_until timestamptz;
  v_checkin timestamptz;
BEGIN
  PERFORM app.assert_own_use_booking_active();
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT * INTO b FROM app.booking WHERE opened_by_operation = p_operation;
  IF NOT FOUND OR b.second_home_id <> p_second_home_id
     OR p_stay_date < b.checkin_date OR p_stay_date >= b.checkout_date THEN
    RAISE EXCEPTION 'own use writes belong to the booking of the same operation and night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = p_operation;
  PERFORM app.lock_own_use_representation(op.actor_user_id, op.acting_party_id, v_at);
  SELECT valid_until INTO STRICT v_valid_until FROM app.holding WHERE id = b.holding_id;
  IF v_valid_until IS NOT NULL AND v_valid_until <= v_at THEN
    RAISE EXCEPTION 'the booking holding is no longer current'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
  END IF;
  SELECT checkin_at INTO STRICT v_checkin
    FROM app.second_home_date WHERE second_home_id = p_second_home_id AND stay_date = p_stay_date;
  IF v_checkin <= v_at THEN
    RAISE EXCEPTION 'an own use night is written only before its check-in'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_booking_night_future';
  END IF;
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_parent app.date_custody; v_grand app.date_custody; v_modality text; v_found boolean; b app.booking;
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
    -- W12: a aplicação só abre `use_right/reserved_right` sobre `spe_pool`, para a Ação da reserva da mesma operação.
    IF NOT v_found OR v_parent.holder_kind <> 'spe_pool' OR NEW.holder_kind <> 'use_right'
       OR NEW.basis IS DISTINCT FROM 'reserved_right' THEN
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    b := app.assert_own_use_write(NEW.opened_by_operation, NEW.second_home_id, NEW.stay_date);
    IF b.stake_id IS DISTINCT FROM NEW.stake_id THEN
      RAISE EXCEPTION 'a reserved right belongs to the stake of the booking'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
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

-- Histórico não é reescrito: só o fechamento de uma custódia ativa, uma vez, pela operação da transação. W12: a
-- aplicação só fecha `spe_pool` de uma noite da reserva Co-Owner da mesma operação.
CREATE OR REPLACE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE b app.booking;
BEGIN
  IF NOT app.acts_as_schema_owner() THEN
    IF OLD.holder_kind <> 'spe_pool' THEN
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    b := app.assert_own_use_write(NEW.closed_by_operation, OLD.second_home_id, OLD.stay_date);
    IF b.stake_id IS NULL THEN
      RAISE EXCEPTION 'an Owner booking never closes a custody'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_custody_stake';
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

REVOKE ALL ON FUNCTION app.assert_own_use_write(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_own_use_write(uuid, uuid, date) TO luxtory_app;

-- Privilégios da W12: fechar custódia ativa (só as colunas de fechamento) e gravar ocupação. Os gatilhos acima decidem o
-- que é permitido; o UPDATE também é o privilégio que o `FOR SHARE` da ocupação exige. Liberação continua sem UPDATE.
GRANT UPDATE (closed_at, closed_by_operation) ON app.date_custody TO luxtory_app;
CREATE POLICY date_custody_app_close ON app.date_custody FOR UPDATE TO luxtory_app
  USING (closed_at IS NULL) WITH CHECK (true);
GRANT INSERT ON app.date_occupancy TO luxtory_app;
CREATE POLICY date_occupancy_app_insert ON app.date_occupancy FOR INSERT TO luxtory_app WITH CHECK (true);


-- migrate:down
DROP POLICY date_occupancy_app_insert ON app.date_occupancy;
REVOKE INSERT ON app.date_occupancy FROM luxtory_app;
DROP POLICY date_custody_app_close ON app.date_custody;
REVOKE UPDATE (closed_at, closed_by_operation) ON app.date_custody FROM luxtory_app;

CREATE OR REPLACE FUNCTION app.date_occupancy_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_custody app.date_custody;
BEGIN
  IF NEW.released_at IS NOT NULL OR NEW.release_reason IS NOT NULL OR NEW.released_by_operation IS NOT NULL THEN
    RAISE EXCEPTION 'an occupancy opens active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_opens_active';
  END IF;
  PERFORM app.assert_inventory_transition_enabled();
  PERFORM app.assert_operation_in_transaction(NEW.opened_by_operation);
  -- TECH-053: o command já travou a noite (classe 5); aqui só a custódia (classe 6), contra o fechamento concorrente.
  SELECT * INTO v_custody FROM app.date_custody WHERE id = NEW.custody_id FOR SHARE;
  IF NOT FOUND OR v_custody.closed_at IS NOT NULL
     OR v_custody.second_home_id <> NEW.second_home_id OR v_custody.stay_date <> NEW.stay_date THEN
    RAISE EXCEPTION 'an occupancy references the active custody of the same night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_active';
  END IF;
  IF NOT app.occupancy_pair_valid(NEW, v_custody) THEN
    RAISE EXCEPTION 'occupancy and custody pair outside the TECH-023 matrix'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_occupancy_matrix';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.date_custody_close() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM app.assert_inventory_transition_enabled();
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

CREATE OR REPLACE FUNCTION app.date_custody_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_parent app.date_custody; v_grand app.date_custody; v_modality text;
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
  PERFORM app.assert_inventory_transition_enabled();
  -- Transição atômica: a mãe (mesma noite, pela FK composta) foi fechada pela operação que abre a filha.
  SELECT * INTO v_parent FROM app.date_custody WHERE id = NEW.parent_custody_id;
  IF NOT FOUND OR v_parent.closed_by_operation IS DISTINCT FROM NEW.opened_by_operation THEN
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

DROP FUNCTION app.assert_own_use_write(uuid, uuid, date);
