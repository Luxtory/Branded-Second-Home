-- migrate:up
-- W20 (REQ-051, REQ-060; BR-151, BR-200–BR-203; TECH-022, TECH-023, TECH-025, TECH-031, TECH-043, TECH-051–TECH-054;
-- ADR-0036; spec luxchange §5.1): depósito Luxchange no banco. O depósito troca, num só COMMIT, capacidade elegível do
-- Titular por Créditos: noites cedidas a `luxtory/inventory/luxchange_cession` e um lote de Créditos = Σ PRL das noites ×
-- multiplicador, com o snapshot por noite. Owner: `owner` livre da holding vigente. Co-Owner: reservas de uso próprio
-- confirmadas e inteiras, encerradas pela transição própria `cession` (`confirmed → cancelled`), ocupação liberada com
-- `ceded`, Direito de Uso mantido consumido (nenhum movimento no ledger). Toda escrita exige a K6 `luxchange_deposit`
-- (sem linha) e a operação `deposit_capacity` da transação; o lote segue exigindo a K4. As funções das W13, W14 e W17
-- ganham só o ramo do depósito antes dos caminhos existentes (provas de preservação); nada mais muda.
-- `search_path = pg_catalog, pg_temp` em toda função nova (T-1312).

-- K6 e K7 (ADR-0036 §7): só ampliam o CHECK. Nenhuma linha. K6 `luxchange_deposit` abre a cessão do depósito; K7
-- `luxchange_exchange` abre os movimentos de Créditos de Request e Direct (originação no aceite, Garantia, consumo e
-- liberação — W21–W23, ainda sem lastro no banco). Ativar a K4 para o depósito nunca abre o intercâmbio.
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection', 'credits', 'payments',
                          'luxchange_deposit', 'luxchange_exchange'));

-- Toda escrita do depósito pelo papel da aplicação passa por aqui: sem a linha, recusa — inclusive SQL direto.
-- Funcionalidade fechada, não recusa funcional.
CREATE FUNCTION app.assert_luxchange_deposit_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxchange_deposit') THEN
    RAISE EXCEPTION 'Luxchange deposit is not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'luxchange_deposit_not_activated';
  END IF;
END $$;

-- Movimentos de Créditos de Request e Direct pelo papel da aplicação (W20 auditoria; ADR-0036 §7): sem a linha, recusa —
-- inclusive SQL direto. Funcionalidade fechada até as waves donas (W21–W23) trazerem o lastro no banco.
CREATE FUNCTION app.assert_luxchange_exchange_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'luxchange_exchange') THEN
    RAISE EXCEPTION 'Luxchange exchange (Request and Direct) is not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'luxchange_exchange_not_activated';
  END IF;
END $$;

-- Identidade transacional do snapshot (auditoria da W20, 2ª rodada; ADR-0036 §3): o snapshot da operação foi inserido
-- pela transação corrente. `now()` é só o início da transação — uma transação iniciada antes do snapshot de outra passaria
-- num teste de tempo —, então a prova é o `xmin` da linha (o snapshot é só-inserção: nunca atualizado nem apagado, e
-- travas não mudam o `xmin`) igual ao xid da transação corrente. `created_at >= now()` exclui uma coincidência de xid
-- depois de um wraparound. Inserido dentro de savepoint, o `xmin` é o da subtransação: falha fechada (nenhum command de
-- depósito usa savepoint).
CREATE FUNCTION app.economic_snapshot_in_current_transaction(p_operation uuid) RETURNS boolean
  LANGUAGE sql SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app.economic_snapshot s
                  WHERE s.operation_id = p_operation AND s.xmin = pg_current_xact_id()::xid
                    AND s.created_at >= now())
$$;

-- Snapshot por noite (TECH-031, REQ-052; ADR-0036 §4; follow-up da ADR-0033 §4): a versão imutável do PRL de cada noite
-- usada pela operação, lida pela FK (sem cópia de valor). Só-inserção.
CREATE TABLE app.economic_snapshot_night (
  operation_id uuid NOT NULL REFERENCES app.economic_snapshot(operation_id),
  second_home_id uuid NOT NULL,
  stay_date date NOT NULL,
  prl_id uuid NOT NULL REFERENCES app.prl(id),
  PRIMARY KEY (operation_id, stay_date),
  CONSTRAINT economic_snapshot_night_sealed FOREIGN KEY (second_home_id, stay_date)
    REFERENCES app.second_home_date(second_home_id, stay_date)
);
CREATE INDEX economic_snapshot_night_prl_idx ON app.economic_snapshot_night (prl_id);

-- Cada noite aponta para a versão do PRL da própria noite vigente no instante de resolução do snapshot, e todas as
-- noites de uma operação são da mesma Second Home.
CREATE FUNCTION app.economic_snapshot_night_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_resolved_at timestamptz; v_in_force uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT s.resolved_at INTO v_resolved_at FROM app.economic_snapshot s WHERE s.operation_id = NEW.operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a snapshot night belongs to the snapshot of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_night_snapshot';
  END IF;
  -- Só na transação que inseriu o snapshot (identidade, não tempo): uma operação `pending` reaproveitada noutra
  -- transação — sequencial ou concorrente — não acrescenta noites a um depósito já conferido no COMMIT.
  IF NOT app.economic_snapshot_in_current_transaction(NEW.operation_id) THEN
    RAISE EXCEPTION 'snapshot nights are recorded in the transaction of the snapshot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_night_transaction';
  END IF;
  SELECT v.id INTO v_in_force FROM app.prl_at(NEW.second_home_id, NEW.stay_date, v_resolved_at) v;
  IF v_in_force IS DISTINCT FROM NEW.prl_id THEN
    RAISE EXCEPTION 'the snapshot records the PRL version of the night in force when the terms were resolved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_night_version';
  END IF;
  IF EXISTS (SELECT 1 FROM app.economic_snapshot_night n
              WHERE n.operation_id = NEW.operation_id AND n.second_home_id <> NEW.second_home_id) THEN
    RAISE EXCEPTION 'the nights of a snapshot belong to one Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_night_second_home';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.economic_snapshot_night_write() FROM PUBLIC;
CREATE TRIGGER economic_snapshot_night_write BEFORE INSERT ON app.economic_snapshot_night
  FOR EACH ROW EXECUTE FUNCTION app.economic_snapshot_night_write();
CREATE TRIGGER economic_snapshot_night_no_update BEFORE UPDATE ON app.economic_snapshot_night
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_night_no_delete BEFORE DELETE ON app.economic_snapshot_night
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_night_no_truncate BEFORE TRUNCATE ON app.economic_snapshot_night
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Antecedência mínima do depósito (BR-200, TECH-043; ADR-0036 §3): o instante `p_at` está a pelo menos 336 horas do
-- check-in oficial da noite — no limite exato, permitido. Predicado puro, chamado com `clock_timestamp()` nas regras de
-- escrita: as bordas (335h59, 336h, 336h01) ficam testáveis sem controlar o relógio do banco.
CREATE FUNCTION app.luxchange_deposit_notice_met(p_checkin timestamptz, p_at timestamptz) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_at <= p_checkin - interval '336 hours'
$$;

-- Escrita do depósito (ADR-0036 §3): K6; operação `pending` da transação com command `deposit_capacity`, papel Titular,
-- party que age e Second Home da operação; representação travada; Membership `active` (`FOR SHARE`); noite selada com
-- antecedência de 14 dias do check-in pelo relógio do banco (TECH-043: `now ≤ checkin_at − 14 dias`, em instantes) e
-- presente no snapshot da operação. Devolve a operação.
CREATE FUNCTION app.luxchange_deposit_write(p_operation uuid, p_second_home_id uuid, p_stay_date date)
  RETURNS app.operation
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; v_at timestamptz; v_checkin timestamptz;
BEGIN
  PERFORM app.assert_luxchange_deposit_active();
  PERFORM app.assert_operation_in_transaction(p_operation);
  SELECT * INTO STRICT op FROM app.operation WHERE id = p_operation;
  IF op.command <> 'deposit_capacity' OR op.role <> 'titular' OR op.acting_party_id IS NULL
     OR op.actor_user_id IS NULL OR op.second_home_id IS DISTINCT FROM p_second_home_id THEN
    RAISE EXCEPTION 'deposit writes belong to a deposit_capacity operation of the Titular for this Second Home'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_binding';
  END IF;
  v_at := clock_timestamp();
  PERFORM app.lock_own_use_representation(op.actor_user_id, op.acting_party_id, v_at);
  PERFORM app.assert_credit_membership(op.acting_party_id);
  SELECT d.checkin_at INTO v_checkin
    FROM app.second_home_date d WHERE d.second_home_id = p_second_home_id AND d.stay_date = p_stay_date;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only a sealed night is deposited'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_night';
  END IF;
  IF NOT app.luxchange_deposit_notice_met(v_checkin, v_at) THEN
    RAISE EXCEPTION 'a capacity is deposited at least 14 days before the check-in of the night'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'deposit_min_notice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.economic_snapshot_night n
                  WHERE n.operation_id = p_operation AND n.second_home_id = p_second_home_id
                    AND n.stay_date = p_stay_date) THEN
    RAISE EXCEPTION 'every deposited night is priced in the snapshot of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_snapshot';
  END IF;
  -- Toda escrita do depósito na transação que inseriu o snapshot — a mesma em que a completude é conferida no COMMIT.
  IF NOT app.economic_snapshot_in_current_transaction(p_operation) THEN
    RAISE EXCEPTION 'deposit writes happen in the transaction of the snapshot of their operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_transaction';
  END IF;
  RETURN op;
END $$;

-- Fechamento pela operação de depósito: `owner` da holding Owner vigente da party que age (a ocupação ativa já impede o
-- fechamento — reserva Owner é cancelada antes, TECH-023) ou `reserved_right` aberta pela reserva que a mesma operação
-- cedeu. Nenhuma outra origem é depositável (`forfeited_right`, `spe_pool`, `delinquency`, `luxtory`: TECH-060, BR-162).
CREATE FUNCTION app.luxchange_deposit_close(p_operation uuid, p_custody app.date_custody) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; b app.booking; v_at timestamptz;
BEGIN
  op := app.luxchange_deposit_write(p_operation, p_custody.second_home_id, p_custody.stay_date);
  v_at := clock_timestamp();
  IF p_custody.holder_kind = 'owner' THEN
    IF NOT EXISTS (SELECT 1 FROM app.holding h
                    WHERE h.second_home_id = p_custody.second_home_id AND h.party_id = op.acting_party_id
                      AND h.role = 'owner' AND h.valid_from <= v_at
                      AND (h.valid_until IS NULL OR v_at < h.valid_until)) THEN
      RAISE EXCEPTION 'the Owner capacity belongs to the current holding of the represented party'
        USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'permission_representation';
    END IF;
  ELSIF p_custody.holder_kind = 'use_right' AND p_custody.basis = 'reserved_right' THEN
    SELECT * INTO b FROM app.booking WHERE opened_by_operation = p_custody.opened_by_operation;
    IF NOT FOUND OR b.stake_id IS DISTINCT FROM p_custody.stake_id
       OR NOT EXISTS (SELECT 1 FROM app.booking_state_transition t
                       WHERE t.operation_id = op.id AND t.booking_id = b.id AND t.kind = 'cession') THEN
      RAISE EXCEPTION 'a reserved right is deposited only with the booking ceded by the same operation'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
    END IF;
  ELSE
    RAISE EXCEPTION 'only Owner capacity or a reserved right of the Titular is deposited'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_source';
  END IF;
END $$;

-- Abertura pela operação de depósito: só `luxtory/inventory/luxchange_cession`, com a referência do depósito (BR-161:
-- origem, autorização e tratamento econômico identificáveis). A tabela fechada (TECH-022) e a atomicidade (mãe fechada
-- pela mesma operação) continuam conferidas pelo gatilho.
CREATE FUNCTION app.luxchange_deposit_open(p_custody app.date_custody) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.luxchange_deposit_write(p_custody.opened_by_operation, p_custody.second_home_id, p_custody.stay_date);
  IF p_custody.holder_kind IS DISTINCT FROM 'luxtory' OR p_custody.purpose IS DISTINCT FROM 'inventory'
     OR p_custody.inventory_origin IS DISTINCT FROM 'luxchange_cession'
     OR p_custody.authorization_ref IS DISTINCT FROM 'deposit_capacity:' || p_custody.opened_by_operation::text THEN
    RAISE EXCEPTION 'a deposit opens only Luxchange cession inventory with the reference of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_deposit_successor';
  END IF;
END $$;

-- Liberação pela operação de depósito: só `ceded`, da ocupação `own_use` Co-Owner da reserva que a mesma operação cedeu
-- (a regra da W10 confere a `reserved_right` da mesma Ação).
CREATE FUNCTION app.luxchange_deposit_release(p_operation uuid, p_occupancy app.date_occupancy, p_reason text)
  RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.luxchange_deposit_write(p_operation, p_occupancy.second_home_id, p_occupancy.stay_date);
  IF p_reason IS DISTINCT FROM 'ceded' OR p_occupancy.channel <> 'own_use' OR p_occupancy.stake_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM app.booking_state_transition t
                     WHERE t.operation_id = p_operation AND t.booking_id = p_occupancy.booking_id
                       AND t.kind = 'cession') THEN
    RAISE EXCEPTION 'a deposit releases only the own use of the booking it ceded, as ceded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_write_binding';
  END IF;
END $$;

-- BR-201 (`01` §20; ADR-0036 §5): quantidade × 100 = Σ PRL das noites do snapshot (unidade mínima do BRL, 2 casas) ×
-- multiplicador do snapshot, em `numeric` exato. Falso sem multiplicador ou sem noite.
CREATE FUNCTION app.luxchange_deposit_quantity_matches(p_operation uuid, p_quantity numeric) RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(p_quantity * 100 = (
    SELECT sum(l.amount_minor)::numeric FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
     WHERE n.operation_id = p_operation
  ) * (
    SELECT p.value::numeric FROM app.economic_snapshot_parameter sp JOIN app.parameter p ON p.id = sp.parameter_id
     WHERE sp.operation_id = p_operation AND sp.parameter_key = 'credit_multiplier'
  ), false)
$$;

-- Completude do depósito no COMMIT (ADR-0036 §6; REQ-060, INV-2, INV-3, INV-6): noites do snapshot = custódias
-- `luxchange_cession` abertas pela operação, cada uma sucedendo `owner` ou `reserved_right` fechada por ela, e nada mais
-- aberto ou fechado; exatamente um lote, da party que age, com a quantidade da BR-201; reservas de origem = reservas
-- cedidas pela operação, cada uma por inteiro e com todas as ocupações liberadas como `ceded`, e nada mais liberado;
-- nenhum movimento do Direito de Uso (REQ-060: o dia segue consumido) e nenhuma outra transição. Só conferência.
CREATE FUNCTION app.assert_luxchange_deposit_complete(p_operation uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  op app.operation;
  v_nights date[];
  v_n integer;
  v_from_custody uuid[];
  v_ceded uuid[];
BEGIN
  SELECT * INTO op FROM app.operation WHERE id = p_operation;
  IF NOT FOUND OR op.command <> 'deposit_capacity' THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(n.stay_date ORDER BY n.stay_date), '{}') INTO v_nights
    FROM app.economic_snapshot_night n WHERE n.operation_id = p_operation;
  v_n := cardinality(v_nights);
  IF v_n = 0 OR EXISTS (SELECT 1 FROM app.economic_snapshot_night n
                         WHERE n.operation_id = p_operation AND n.second_home_id IS DISTINCT FROM op.second_home_id) THEN
    RAISE EXCEPTION 'a deposit cedes at least one night of the Second Home of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_complete';
  END IF;
  IF (SELECT count(*) FROM app.date_custody c JOIN app.date_custody p ON p.id = c.parent_custody_id
       WHERE c.opened_by_operation = p_operation AND p.closed_by_operation = p_operation
         AND c.second_home_id = op.second_home_id AND c.stay_date = ANY (v_nights)
         AND c.holder_kind = 'luxtory' AND c.purpose = 'inventory' AND c.inventory_origin = 'luxchange_cession'
         AND c.authorization_ref = 'deposit_capacity:' || p_operation::text
         AND (p.holder_kind = 'owner' OR (p.holder_kind = 'use_right' AND p.basis = 'reserved_right'))) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.opened_by_operation = p_operation) <> v_n
     OR (SELECT count(*) FROM app.date_custody c WHERE c.closed_by_operation = p_operation) <> v_n THEN
    RAISE EXCEPTION 'every deposited night moves to Luxchange cession inventory, and only those'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_complete';
  END IF;
  IF (SELECT count(*) FROM app.credit_lot l WHERE l.origin_operation_id = p_operation) <> 1
     OR NOT EXISTS (SELECT 1 FROM app.credit_lot l
                     WHERE l.origin_operation_id = p_operation AND l.party_id = op.acting_party_id
                       AND app.luxchange_deposit_quantity_matches(p_operation, l.quantity)) THEN
    RAISE EXCEPTION 'a deposit originates exactly one lot of the PRL of its nights times the multiplier'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_complete';
  END IF;
  SELECT coalesce(array_agg(DISTINCT b.id ORDER BY b.id), '{}') INTO v_from_custody
    FROM app.date_custody p JOIN app.booking b ON b.opened_by_operation = p.opened_by_operation
   WHERE p.closed_by_operation = p_operation AND p.holder_kind = 'use_right' AND p.basis = 'reserved_right';
  SELECT coalesce(array_agg(DISTINCT t.booking_id ORDER BY t.booking_id), '{}') INTO v_ceded
    FROM app.booking_state_transition t WHERE t.operation_id = p_operation AND t.kind = 'cession';
  IF v_from_custody IS DISTINCT FROM v_ceded
     OR EXISTS (SELECT 1 FROM app.booking b JOIN app.second_home_date d
                    ON d.second_home_id = b.second_home_id AND d.stay_date >= b.checkin_date
                   AND d.stay_date < b.checkout_date
                 WHERE b.id = ANY (v_ceded) AND NOT (d.stay_date = ANY (v_nights)))
     OR (SELECT count(*) FROM app.date_occupancy o
          WHERE o.released_by_operation = p_operation AND o.release_reason = 'ceded'
            AND o.booking_id = ANY (v_ceded) AND o.stay_date = ANY (v_nights))
        <> (SELECT coalesce(sum(b.checkout_date - b.checkin_date), 0) FROM app.booking b WHERE b.id = ANY (v_ceded))
     OR (SELECT count(*) FROM app.date_occupancy o WHERE o.released_by_operation = p_operation)
        <> (SELECT coalesce(sum(b.checkout_date - b.checkin_date), 0) FROM app.booking b WHERE b.id = ANY (v_ceded))
     OR EXISTS (SELECT 1 FROM app.date_occupancy o
                 WHERE o.booking_id = ANY (v_ceded) AND o.released_at IS NULL) THEN
    RAISE EXCEPTION 'every ceded booking is ceded whole, with all its nights released as ceded, and only those'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_complete';
  END IF;
  IF EXISTS (SELECT 1 FROM app.use_right_ledger l WHERE l.operation_id = p_operation)
     OR EXISTS (SELECT 1 FROM app.booking_state_transition t WHERE t.operation_id = p_operation AND t.kind <> 'cession')
  THEN
    RAISE EXCEPTION 'a deposit keeps the use right consumed and records no other booking event'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'luxchange_deposit_complete';
  END IF;
END $$;

-- Natureza `cession` (ADR-0036 §1; TECH-055): `confirmed → cancelled`, sem base registrada (ato do Titular). Um evento
-- por operação continua valendo para as outras naturezas; na cessão, um por reserva (a reserva cedida é terminal).
ALTER TABLE app.booking_state_transition
  DROP CONSTRAINT booking_state_transition_kind_check,
  ADD CONSTRAINT booking_state_transition_kind_check CHECK (kind IN (
    'advance', 'cancellation', 'no_show', 'exception_opening', 'exception_resolution', 'invalidation', 'cession'
  )),
  DROP CONSTRAINT conflict_booking_transition_pair,
  ADD CONSTRAINT conflict_booking_transition_pair CHECK (CASE kind
    WHEN 'advance' THEN (from_state, to_state) IN (('confirmed', 'in_use'), ('in_use', 'completed'))
    WHEN 'cancellation' THEN from_state IN ('confirmed', 'in_use', 'in_exception') AND to_state = 'cancelled'
    WHEN 'no_show' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'no_show'
    WHEN 'exception_opening' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'in_exception'
    WHEN 'exception_resolution' THEN from_state = 'in_exception' AND to_state IN ('confirmed', 'completed', 'cancelled')
    WHEN 'invalidation' THEN from_state = 'in_exception' AND to_state = 'cancelled'
    WHEN 'cession' THEN from_state = 'confirmed' AND to_state = 'cancelled'
  END),
  DROP CONSTRAINT booking_state_transition_basis_shape,
  ADD CONSTRAINT booking_state_transition_basis_shape
    CHECK ((kind IN ('advance', 'cancellation', 'cession')) = (basis IS NULL));
DROP INDEX app.booking_transition_one_event_per_operation;
CREATE UNIQUE INDEX booking_transition_one_event_per_operation ON app.booking_state_transition (operation_id)
  WHERE kind NOT IN ('advance', 'cession');

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

CREATE OR REPLACE FUNCTION app.credit_entry_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
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
END $$;

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

-- No COMMIT, todo snapshot de operação `deposit_capacity` confere o depósito inteiro (ADR-0036 §6). Toda escrita do
-- depósito exige o snapshot da operação (noite no snapshot; lote com o snapshot da validade), então nenhum fato de
-- cessão nem lote de depósito escapa desta verificação. `SET CONSTRAINTS … IMMEDIATE` só antecipa e falha diante do
-- estado incompleto.
CREATE FUNCTION app.economic_snapshot_operation_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_luxchange_deposit_complete(NEW.operation_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.economic_snapshot_operation_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER economic_snapshot_operation_constraint AFTER INSERT ON app.economic_snapshot
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.economic_snapshot_operation_constraint();

-- Consulta de invariantes do depósito (após todo teste `db`, ADR-0005; reconciliação futura): uma linha por operação
-- `deposit_capacity` com fato gravado e depósito incompleto (as regras do COMMIT). Para o papel da aplicação, a abertura
-- de `luxchange_cession` fora do depósito já é recusada pelos gatilhos (W10/W13/W20).
CREATE FUNCTION app.luxchange_invariant_breaches()
  RETURNS TABLE (invariant text, operation_id uuid, detail text)
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
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
END $$;
REVOKE ALL ON FUNCTION app.luxchange_invariant_breaches() FROM PUBLIC;

-- Funções auxiliares só para os gatilhos, que rodam com o papel de quem escreve (`luxtory_app`); nenhum outro papel as
-- executa (TECH-052; prontidão da W13).
REVOKE ALL ON FUNCTION app.economic_snapshot_in_current_transaction(uuid),
  app.luxchange_deposit_notice_met(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.economic_snapshot_in_current_transaction(uuid),
  app.luxchange_deposit_notice_met(timestamptz, timestamptz) TO luxtory_app;
REVOKE ALL ON FUNCTION app.assert_luxchange_deposit_active(), app.assert_luxchange_exchange_active(),
  app.luxchange_deposit_write(uuid, uuid, date),
  app.luxchange_deposit_close(uuid, app.date_custody), app.luxchange_deposit_open(app.date_custody),
  app.luxchange_deposit_release(uuid, app.date_occupancy, text), app.luxchange_deposit_quantity_matches(uuid, numeric),
  app.assert_luxchange_deposit_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_luxchange_deposit_active(), app.assert_luxchange_exchange_active(),
  app.luxchange_deposit_write(uuid, uuid, date),
  app.luxchange_deposit_close(uuid, app.date_custody), app.luxchange_deposit_open(app.date_custody),
  app.luxchange_deposit_release(uuid, app.date_occupancy, text), app.luxchange_deposit_quantity_matches(uuid, numeric),
  app.assert_luxchange_deposit_complete(uuid) TO luxtory_app;

-- Só o servidor lê e grava o snapshot por noite (TECH-052; REQ-100: nenhum preço por noite ao Titular).
ALTER TABLE app.economic_snapshot_night ENABLE ROW LEVEL SECURITY;
CREATE POLICY economic_snapshot_night_app_read ON app.economic_snapshot_night FOR SELECT TO luxtory_app USING (true);
CREATE POLICY economic_snapshot_night_app_insert ON app.economic_snapshot_night
  FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT ON app.economic_snapshot_night TO luxtory_app;
GRANT INSERT (operation_id, second_home_id, stay_date, prl_id) ON app.economic_snapshot_night TO luxtory_app;


-- migrate:down
-- Fatos de depósito nunca são descartados por rollback (TECH-052) nem a regra é removida sob uma ativação: com snapshot
-- por noite, transição `cession`, cessão `luxchange_cession` ou a K6 presente, a reversão é recusada. A trava exclusiva
-- espera gravações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), restaura exatamente a W19.
DO $$
BEGIN
  LOCK TABLE app.economic_snapshot_night, app.booking_state_transition, app.date_custody, app.capability_activation
    IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.economic_snapshot_night)
     OR EXISTS (SELECT 1 FROM app.booking_state_transition WHERE kind = 'cession')
     OR EXISTS (SELECT 1 FROM app.date_custody c JOIN app.operation o ON o.id = c.opened_by_operation
                 WHERE o.command = 'deposit_capacity')
     OR EXISTS (SELECT 1 FROM app.capability_activation
                 WHERE capability IN ('luxchange_deposit', 'luxchange_exchange')) THEN
    RAISE EXCEPTION 'W20 rollback would discard deposit facts or remove the rule under an activation decision';
  END IF;
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

CREATE OR REPLACE FUNCTION app.credit_entry_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
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
END $$;

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
  NEW.originated_at := v_resolved_at;
  NEW.expires_at := app.credit_expires_at(v_resolved_at, v_months::integer);
  NEW.held := 0;
  NEW.consumed := 0;
  NEW.expired := 0;
  NEW.origin_command := op.command;
  RETURN NEW;
END $$;

DROP TRIGGER economic_snapshot_operation_constraint ON app.economic_snapshot;
DROP FUNCTION app.economic_snapshot_operation_constraint();
DROP FUNCTION app.luxchange_invariant_breaches();
DROP INDEX app.booking_transition_one_event_per_operation;
CREATE UNIQUE INDEX booking_transition_one_event_per_operation ON app.booking_state_transition (operation_id)
  WHERE kind <> 'advance';
ALTER TABLE app.booking_state_transition
  DROP CONSTRAINT booking_state_transition_basis_shape,
  ADD CONSTRAINT booking_state_transition_basis_shape
    CHECK ((kind IN ('advance', 'cancellation')) = (basis IS NULL)),
  DROP CONSTRAINT conflict_booking_transition_pair,
  ADD CONSTRAINT conflict_booking_transition_pair CHECK (CASE kind
    WHEN 'advance' THEN (from_state, to_state) IN (('confirmed', 'in_use'), ('in_use', 'completed'))
    WHEN 'cancellation' THEN from_state IN ('confirmed', 'in_use', 'in_exception') AND to_state = 'cancelled'
    WHEN 'no_show' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'no_show'
    WHEN 'exception_opening' THEN from_state IN ('confirmed', 'in_use') AND to_state = 'in_exception'
    WHEN 'exception_resolution' THEN from_state = 'in_exception' AND to_state IN ('confirmed', 'completed', 'cancelled')
    WHEN 'invalidation' THEN from_state = 'in_exception' AND to_state = 'cancelled'
  END),
  DROP CONSTRAINT booking_state_transition_kind_check,
  ADD CONSTRAINT booking_state_transition_kind_check CHECK (kind IN (
    'advance', 'cancellation', 'no_show', 'exception_opening', 'exception_resolution', 'invalidation'
  ));
DROP FUNCTION app.assert_luxchange_deposit_complete(uuid);
DROP FUNCTION app.luxchange_deposit_quantity_matches(uuid, numeric);
DROP FUNCTION app.luxchange_deposit_release(uuid, app.date_occupancy, text);
DROP FUNCTION app.luxchange_deposit_open(app.date_custody);
DROP FUNCTION app.luxchange_deposit_close(uuid, app.date_custody);
DROP FUNCTION app.luxchange_deposit_write(uuid, uuid, date);
DROP FUNCTION app.economic_snapshot_in_current_transaction(uuid);
DROP FUNCTION app.luxchange_deposit_notice_met(timestamptz, timestamptz);
DROP TABLE app.economic_snapshot_night;
DROP FUNCTION app.economic_snapshot_night_write();
DROP FUNCTION app.assert_luxchange_exchange_active();
DROP FUNCTION app.assert_luxchange_deposit_active();
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection', 'credits', 'payments'));
