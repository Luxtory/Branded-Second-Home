-- migrate:up
-- W13 E1 (TECH-021, TECH-022, TECH-023, TECH-060; BR-163, BR-280–BR-284; ADR-0024 §3, ADR-0027 §1, §3): regras de
-- autorização no banco da liberação de ocupação `own_use` e das transições de custódia do ciclo da reserva, presas à
-- transição de estado (ou ao uso da autorização de recuperação) da mesma operação. Só estes casos deixam o gate da W10
-- para o papel da aplicação; todo o resto continua só do dono do schema (`app.assert_inventory_transition_enabled`).

-- Motivos da liberação do ciclo da reserva (spec booking §10.6), só no uso próprio.
ALTER TABLE app.date_occupancy
  DROP CONSTRAINT date_occupancy_release_reason_check,
  ADD CONSTRAINT date_occupancy_release_reason_check
    CHECK (release_reason IN ('ceded', 'cancelled', 'no_show', 'exception', 'invalidation')),
  ADD CONSTRAINT date_occupancy_lifecycle_own_use
    CHECK (release_reason NOT IN ('cancelled', 'no_show', 'exception', 'invalidation') OR channel = 'own_use');

-- Liberação: a aplicação só libera a ocupação `own_use` de noite não iniciada da reserva cuja transição `cancelled` ou
-- `no_show` a mesma operação gravou, com o motivo do evento, uma vez; o instante é carimbado pelo banco.
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
    IF OLD.channel <> 'own_use' THEN
      PERFORM app.assert_inventory_transition_enabled();
    END IF;
    SELECT * INTO t FROM app.own_use_lifecycle_write(NEW.released_by_operation, OLD.booking_id, OLD.stay_date);
    IF NEW.release_reason IS DISTINCT FROM app.booking_release_reason(t.kind) THEN
      RAISE EXCEPTION 'the release reason is the reason of the event of the operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_release_reason';
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

-- Sucessora esperada da `reserved_right` no evento (TECH-022, §7): tempestivo e invalidação devolvem à SPE; tardio e
-- no-show a mantêm consumida como `forfeited_right` da mesma Ação.
CREATE FUNCTION app.own_use_reserved_right_successor(p_transition app.booking_state_transition) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p_transition.kind = 'invalidation' OR p_transition.cancellation_class = 'timely' THEN 'spe_pool'
    ELSE 'forfeited_right' END
$$;

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

-- Histórico não é reescrito: só o fechamento de uma custódia ativa, uma vez, pela operação da transação. A aplicação
-- fecha `spe_pool` da reserva Co-Owner da mesma operação (W12), `reserved_right` da reserva cuja transição de fechamento
-- a operação gravou e `forfeited_right` autorizada para recuperação (W13).
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

REVOKE ALL ON FUNCTION app.own_use_reserved_right_successor(app.booking_state_transition) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.own_use_reserved_right_successor(app.booking_state_transition) TO luxtory_app;

-- Liberação: só as colunas de liberação (a regra acima decide o resto). O UPDATE da W12 em custódia já cobre o
-- fechamento.
GRANT UPDATE (released_at, release_reason, released_by_operation) ON app.date_occupancy TO luxtory_app;
CREATE POLICY date_occupancy_app_release ON app.date_occupancy FOR UPDATE TO luxtory_app
  USING (released_at IS NULL) WITH CHECK (true);


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.date_occupancy, app.date_custody IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.date_occupancy
              WHERE release_reason IN ('cancelled', 'no_show', 'exception', 'invalidation')) THEN
    RAISE EXCEPTION 'W13 rollback would discard occupancy releases of the booking lifecycle';
  END IF;
END $$;

DROP POLICY date_occupancy_app_release ON app.date_occupancy;
REVOKE UPDATE (released_at, release_reason, released_by_operation) ON app.date_occupancy FROM luxtory_app;

-- Os gatilhos voltam aos da W12 (custódia) e da W10 (liberação).
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

DROP FUNCTION app.own_use_reserved_right_successor(app.booking_state_transition);

CREATE OR REPLACE FUNCTION app.date_occupancy_release() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM app.assert_inventory_transition_enabled();
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'a released occupancy never changes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'date_occupancy_released_once';
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

ALTER TABLE app.date_occupancy
  DROP CONSTRAINT date_occupancy_lifecycle_own_use,
  DROP CONSTRAINT date_occupancy_release_reason_check,
  ADD CONSTRAINT date_occupancy_release_reason_check CHECK (release_reason IN ('ceded'));
