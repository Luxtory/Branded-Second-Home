-- migrate:up
-- W17 (REQ-053, REQ-054, PD-008, INV-6; ADR-007, TECH-025, TECH-044, TECH-051–054, TECH-070–072; ADR-0033; spec credits
-- §5.1): lotes de Créditos e ledger append-only. Créditos são unidade operacional interna, não financeira (BR-190):
-- quantidades `numeric` exatas, sem moeda.
--
-- O servidor só insere lotes (originação) e movimentos; os buckets do lote são escritos exclusivamente pelo gatilho do
-- ledger, na mesma instrução do movimento validado. Origem, party, validade, par do TECH-070, command de cada movimento,
-- Membership, representação, autoridade Admin e saldo por movimento-pai são conferidos pelo banco, com o relógio do
-- banco. Nada disso é executável pelo papel da aplicação sem a K4 `credits` (sem linha nesta wave).

-- K4 (ADR-0033 §8): a W17 só amplia o CHECK. Nenhuma linha.
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection', 'credits'));

-- Toda escrita de Créditos pelo papel da aplicação passa por aqui: sem a linha, recusa — inclusive SQL direto. A leitura
-- mantém a tabela travada em modo compartilhado até o fim da transação (mesma contenção da K1–K3). Falha técnica, não
-- recusa funcional: o nome não começa por `credits_`.
CREATE FUNCTION app.assert_credits_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'credits') THEN
    RAISE EXCEPTION 'credits are not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'credit_capability_not_activated';
  END IF;
END $$;

-- TECH-044: `originated_at + credit_validity_months` por adição calendárica em UTC, ajustada ao último dia válido do mês
-- (o PostgreSQL ajusta o dia ao somar meses: 31/08 + 24 → 31/08; 29/02 + 12 → 28/02; 31/01 + 1 → 28/02 ou 29/02).
CREATE FUNCTION app.credit_expires_at(p_originated_at timestamptz, p_months integer) RETURNS timestamptz
  LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_months < 1 THEN
    RAISE EXCEPTION 'credit validity must be a positive number of months'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_validity_positive';
  END IF;
  RETURN ((p_originated_at AT TIME ZONE 'UTC') + make_interval(months => p_months)) AT TIME ZONE 'UTC';
END $$;

-- ADR-007. `available` é derivado; buckets nunca negativos (constraints `credits_*` → `ERR_CREDITS_INSUFFICIENT`).
CREATE TABLE app.credit_lot (
  id uuid PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES app.party(id),
  quantity numeric NOT NULL,
  held numeric NOT NULL DEFAULT 0,
  consumed numeric NOT NULL DEFAULT 0,
  expired numeric NOT NULL DEFAULT 0,
  available numeric GENERATED ALWAYS AS (quantity - held - consumed - expired) STORED,
  originated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  origin_operation_id uuid NOT NULL REFERENCES app.operation(id),
  -- Command da operação de origem (fato gerador: depósito ou Créditos ao cedente no aceite), gravado pelo banco.
  origin_command text NOT NULL,
  CONSTRAINT credit_lot_origin_unique UNIQUE (origin_operation_id, party_id),
  CONSTRAINT credit_lot_quantity_positive CHECK (quantity > 0),
  CONSTRAINT credits_held_nonnegative CHECK (held >= 0),
  CONSTRAINT credits_consumed_nonnegative CHECK (consumed >= 0),
  CONSTRAINT credits_expired_nonnegative CHECK (expired >= 0),
  CONSTRAINT credits_available_nonnegative CHECK (quantity - held - consumed - expired >= 0),
  CONSTRAINT credit_lot_validity_order CHECK (expires_at > originated_at),
  CONSTRAINT credit_lot_origin_command_check CHECK (origin_command IN ('deposit_capacity', 'accept_request'))
);
-- FEFO (PD-008, TECH-071) e ordem de travas da classe 7 (TECH-053): `(expires_at, originated_at, id)` por party.
CREATE INDEX credit_lot_fefo_idx ON app.credit_lot (party_id, expires_at, originated_at, id);
CREATE INDEX credit_lot_due_idx ON app.credit_lot (expires_at) WHERE available > 0;

-- Ledger append-only (ADR-007). `from_bucket`/`to_bucket` são a notação do TECH-070; `parent_entry_id` aponta a Garantia
-- liberada ou consumida e o consumo revertido; `basis` é a base registrada da reversão (TECH-051).
CREATE TABLE app.credit_entry (
  id uuid PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES app.credit_lot(id),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  command text NOT NULL,
  movement text NOT NULL,
  from_bucket text NOT NULL,
  to_bucket text NOT NULL,
  quantity numeric NOT NULL,
  parent_entry_id uuid REFERENCES app.credit_entry(id),
  basis text,
  created_at timestamptz NOT NULL,
  CONSTRAINT credit_entry_quantity_positive CHECK (quantity > 0),
  -- TECH-070: a tabela fechada de movimentos.
  CONSTRAINT credit_entry_movement_pair CHECK ((movement, from_bucket, to_bucket) IN (
    ('originate', 'external', 'available'),
    ('hold', 'available', 'held'),
    ('release', 'held', 'available'),
    ('release', 'held', 'expired'),
    ('consume', 'held', 'consumed'),
    ('consume', 'available', 'consumed'),
    ('expire', 'available', 'expired'),
    ('reverse', 'consumed', 'available'),
    ('reverse', 'consumed', 'expired')
  )),
  CONSTRAINT credit_entry_parent_required CHECK (
    (parent_entry_id IS NOT NULL) = (movement IN ('release', 'reverse') OR (movement = 'consume' AND from_bucket = 'held'))
  ),
  CONSTRAINT credit_entry_basis_required CHECK ((basis IS NOT NULL) = (movement = 'reverse')),
  CONSTRAINT credit_entry_basis_length CHECK (basis IS NULL OR length(btrim(basis)) BETWEEN 1 AND 2000)
);
CREATE INDEX credit_entry_lot_idx ON app.credit_entry (lot_id, created_at);
CREATE INDEX credit_entry_operation_idx ON app.credit_entry (operation_id);
CREATE INDEX credit_entry_parent_idx ON app.credit_entry (parent_entry_id) WHERE parent_entry_id IS NOT NULL;
CREATE UNIQUE INDEX credit_entry_one_origination ON app.credit_entry (lot_id) WHERE movement = 'originate';

-- Originação (ADR-0033 §3): operação `pending` da transação, command de originação, party que age = party do lote,
-- representação vigente; `originated_at` = instante do snapshot da operação e `expires_at` calculado a partir da versão
-- de `credit_validity_months` registrada no snapshot. Nada disso vem da entrada.
CREATE FUNCTION app.credit_lot_originate() RETURNS trigger
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
REVOKE ALL ON FUNCTION app.credit_lot_originate() FROM PUBLIC;
CREATE TRIGGER credit_lot_originate BEFORE INSERT ON app.credit_lot
  FOR EACH ROW EXECUTE FUNCTION app.credit_lot_originate();

-- O movimento `external → available` é escrito pelo próprio banco (o papel da aplicação não o escreve).
CREATE FUNCTION app.credit_lot_record_origination() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO app.credit_entry (id, lot_id, operation_id, command, movement, from_bucket, to_bucket, quantity, created_at)
  VALUES (gen_random_uuid(), NEW.id, NEW.origin_operation_id, NEW.origin_command, 'originate', 'external', 'available',
          NEW.quantity, NEW.originated_at);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.credit_lot_record_origination() FROM PUBLIC;
CREATE TRIGGER credit_lot_record_origination AFTER INSERT ON app.credit_lot
  FOR EACH ROW EXECUTE FUNCTION app.credit_lot_record_origination();

-- Party, quantidade, origem e validade nunca mudam (ADR-007; `expires_at` nunca é prorrogado, TECH-044); os buckets só
-- mudam pelo gatilho do ledger, que executa como dono. O papel da aplicação tem UPDATE de coluna apenas para as travas
-- de linha da TECH-053 (`FOR UPDATE` em ordem FEFO): todo UPDATE seu é recusado.
CREATE FUNCTION app.credit_lot_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner() THEN
    RAISE EXCEPTION 'credit lots change only through the ledger'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'credit_lot_ledger_only';
  END IF;
  IF (NEW.id, NEW.party_id, NEW.quantity, NEW.originated_at, NEW.expires_at, NEW.origin_operation_id, NEW.origin_command)
     IS DISTINCT FROM
     (OLD.id, OLD.party_id, OLD.quantity, OLD.originated_at, OLD.expires_at, OLD.origin_operation_id, OLD.origin_command)
  THEN
    RAISE EXCEPTION 'a credit lot keeps its party, quantity, origin and validity'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_lot_immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.credit_lot_guard() FROM PUBLIC;
CREATE TRIGGER credit_lot_guard BEFORE UPDATE ON app.credit_lot
  FOR EACH ROW EXECUTE FUNCTION app.credit_lot_guard();

-- Membership elegível da party do lote no instante (BR-195, TECH-050), com `FOR SHARE` (classe 3 da TECH-053; o
-- executor já a toma antes nos commands `eligible`, ADR-0031 §5).
CREATE FUNCTION app.assert_credit_membership(p_party uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  SELECT m.state INTO v_state FROM app.membership m WHERE m.party_id = p_party FOR SHARE;
  IF v_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'credits are used only with an eligible Membership'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'credit_membership_ineligible';
  END IF;
END $$;

-- Validação de cada movimento (ADR-0033 §2), com o lote travado e o relógio do banco. O command e o instante vêm da
-- operação e do banco, nunca da entrada.
CREATE FUNCTION app.credit_entry_write() RETURNS trigger
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
REVOKE ALL ON FUNCTION app.credit_entry_write() FROM PUBLIC;
CREATE TRIGGER credit_entry_write BEFORE INSERT ON app.credit_entry
  FOR EACH ROW EXECUTE FUNCTION app.credit_entry_write();

-- Buckets: escritos só aqui, como dono, a partir do movimento já validado (o lote segue travado pela validação).
CREATE FUNCTION app.credit_entry_apply() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.movement = 'originate' THEN
    RETURN NULL;
  END IF;
  UPDATE app.credit_lot l
     SET held = l.held + CASE WHEN NEW.to_bucket = 'held' THEN NEW.quantity ELSE 0 END
                       - CASE WHEN NEW.from_bucket = 'held' THEN NEW.quantity ELSE 0 END,
         consumed = l.consumed + CASE WHEN NEW.to_bucket = 'consumed' THEN NEW.quantity ELSE 0 END
                               - CASE WHEN NEW.from_bucket = 'consumed' THEN NEW.quantity ELSE 0 END,
         expired = l.expired + CASE WHEN NEW.to_bucket = 'expired' THEN NEW.quantity ELSE 0 END
   WHERE l.id = NEW.lot_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.credit_entry_apply() FROM PUBLIC;
CREATE TRIGGER credit_entry_apply AFTER INSERT ON app.credit_entry
  FOR EACH ROW EXECUTE FUNCTION app.credit_entry_apply();

CREATE TRIGGER credit_lot_no_delete BEFORE DELETE ON app.credit_lot
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER credit_lot_no_truncate BEFORE TRUNCATE ON app.credit_lot
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER credit_entry_no_update BEFORE UPDATE ON app.credit_entry
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER credit_entry_no_delete BEFORE DELETE ON app.credit_entry
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER credit_entry_no_truncate BEFORE TRUNCATE ON app.credit_entry
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Papel da aplicação (TECH-052): insere lote (só as colunas que informa) e movimento; nenhuma escrita de bucket,
-- validade ou origem. O UPDATE de uma coluna existe só para as travas de linha (o gatilho recusa todo UPDATE).
ALTER TABLE app.credit_lot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.credit_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_lot_app_read ON app.credit_lot FOR SELECT TO luxtory_app USING (true);
CREATE POLICY credit_lot_app_insert ON app.credit_lot FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY credit_lot_app_lock ON app.credit_lot FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
CREATE POLICY credit_entry_app_read ON app.credit_entry FOR SELECT TO luxtory_app USING (true);
CREATE POLICY credit_entry_app_insert ON app.credit_entry FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT ON app.credit_lot, app.credit_entry TO luxtory_app;
GRANT INSERT (id, party_id, quantity, origin_operation_id) ON app.credit_lot TO luxtory_app;
GRANT UPDATE (held) ON app.credit_lot TO luxtory_app;
GRANT INSERT (id, lot_id, operation_id, movement, from_bucket, to_bucket, quantity, parent_entry_id, basis)
  ON app.credit_entry TO luxtory_app;

-- Titular (TECH-052, REQ-053/054): lotes e movimentos das parties que representa por delegação vigente (padrão da W7 e
-- da W15); sem a base das reversões nem o movimento-pai. Nenhuma escrita.
GRANT SELECT (id, party_id, quantity, held, consumed, expired, available, originated_at, expires_at,
              origin_operation_id, origin_command) ON app.credit_lot TO authenticated;
GRANT SELECT (id, lot_id, operation_id, command, movement, from_bucket, to_bucket, quantity, created_at)
  ON app.credit_entry TO authenticated;
CREATE POLICY credit_lot_represented_read ON app.credit_lot FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.party_delegation d
           WHERE d.party_id = credit_lot.party_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);
CREATE POLICY credit_entry_represented_read ON app.credit_entry FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.credit_lot l
            JOIN app.party_delegation d ON d.party_id = l.party_id
           WHERE l.id = credit_entry.lot_id AND d.user_id = auth.uid() AND d.state = 'active'
             AND d.valid_from <= now() AND (d.valid_until IS NULL OR now() < d.valid_until))
);

-- INV-6 (ADR-0033 §10): consultada após todo teste `db` (ADR-0005). Uma linha por violação.
CREATE FUNCTION app.credit_invariant_breaches()
  RETURNS TABLE (invariant text, lot_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  -- Exatamente uma originação, com a quantidade e a operação do lote.
  SELECT 'INV-6/origination', l.id, count(e.id)::text
    FROM app.credit_lot l
    LEFT JOIN app.credit_entry e ON e.lot_id = l.id AND e.movement = 'originate'
   GROUP BY l.id, l.quantity, l.origin_operation_id
  HAVING count(e.id) <> 1 OR bool_or(e.quantity <> l.quantity OR e.operation_id <> l.origin_operation_id)
  UNION ALL
  -- Buckets iguais à soma do ledger.
  SELECT 'INV-6/buckets', l.id, concat_ws('/', l.held, l.consumed, l.expired)
    FROM app.credit_lot l
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(CASE WHEN e.to_bucket = 'held' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'held' THEN e.quantity END), 0) AS held,
             coalesce(sum(CASE WHEN e.to_bucket = 'consumed' THEN e.quantity END), 0)
               - coalesce(sum(CASE WHEN e.from_bucket = 'consumed' THEN e.quantity END), 0) AS consumed,
             coalesce(sum(CASE WHEN e.to_bucket = 'expired' THEN e.quantity END), 0) AS expired
        FROM app.credit_entry e WHERE e.lot_id = l.id
    ) s ON true
   WHERE (l.held, l.consumed, l.expired) IS DISTINCT FROM (s.held, s.consumed, s.expired)
  UNION ALL
  -- Nenhum movimento-filho acima do pai.
  SELECT 'INV-6/parent', p.lot_id, p.id::text
    FROM app.credit_entry p
    JOIN app.credit_entry c ON c.parent_entry_id = p.id
   GROUP BY p.id, p.lot_id, p.quantity
  HAVING sum(c.quantity) > p.quantity
  UNION ALL
  -- Origem identificável: command de originação da party que age.
  SELECT 'INV-6/origin', l.id, o.command
    FROM app.credit_lot l JOIN app.operation o ON o.id = l.origin_operation_id
   WHERE o.command NOT IN ('deposit_capacity', 'accept_request') OR o.acting_party_id IS DISTINCT FROM l.party_id
      OR o.command <> l.origin_command
  UNION ALL
  -- TECH-044: validade igual à adição calendárica da versão registrada no snapshot.
  SELECT 'TECH-044/validity', l.id, l.expires_at::text
    FROM app.credit_lot l
    LEFT JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
    LEFT JOIN app.economic_snapshot_parameter sp
      ON sp.operation_id = s.operation_id AND sp.parameter_key = 'credit_validity_months'
    LEFT JOIN app.parameter p ON p.id = sp.parameter_id
   WHERE p.id IS NULL OR l.originated_at <> s.resolved_at
      OR l.expires_at <> app.credit_expires_at(s.resolved_at, p.value::integer)
$$;


-- migrate:down
-- Créditos nunca são descartados por rollback (TECH-052) nem a regra é removida sob uma ativação: com qualquer lote,
-- movimento ou a K4 presente, a reversão é recusada. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.credit_lot, app.credit_entry, app.capability_activation IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.credit_lot) OR EXISTS (SELECT 1 FROM app.credit_entry)
     OR EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'credits') THEN
    RAISE EXCEPTION 'W17 rollback would discard credits or remove the rule under an activation decision';
  END IF;
END $$;
DROP FUNCTION app.credit_invariant_breaches();
DROP TABLE app.credit_entry;
DROP TABLE app.credit_lot;
DROP FUNCTION app.credit_entry_apply();
DROP FUNCTION app.credit_entry_write();
DROP FUNCTION app.assert_credit_membership(uuid);
DROP FUNCTION app.credit_lot_guard();
DROP FUNCTION app.credit_lot_record_origination();
DROP FUNCTION app.credit_lot_originate();
DROP FUNCTION app.credit_expires_at(timestamptz, integer);
DROP FUNCTION app.assert_credits_active();
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection'));
