-- migrate:up
-- A validade da liberação da Garantia é decidida no instante carimbado pelo ledger (ADR-0037, TECH-071).
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
  -- A Garantia pode vencer entre a leitura sob trava e a escrita (TECH-071).
  -- Normaliza só a liberação já autorizada, no mesmo instante usado para validar o bucket.
  IF NEW.movement = 'release' AND NOT v_valid AND NEW.to_bucket = 'available' THEN
    NEW.to_bucket := 'expired';
  END IF;
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

-- migrate:down
-- Restaura a definição da migration 73. O histórico do ledger permanece intacto.
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
