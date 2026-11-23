-- migrate:up
-- W19 (REQ-094; ADR-006, ADR-008, TECH-025, TECH-080–083, TECH-101; ADR-0035; spec billing §4): pagamentos, Luxchange
-- Fee, estornos, settlement e inbox de webhooks. Dinheiro em unidade mínima (`bigint`) + moeda (TECH-033).
--
-- Duas fases (TECH-080): `payment` nasce `pending` antes de qualquer chamada ao PSP; o command de domínio vincula o
-- pagamento aprovado com `fee_charge` dentro da própria transação. Estados monotônicos, efeitos únicos e o valor do Fee
-- são conferidos pelo banco com o relógio do banco. Nada disso é executável pelo papel da aplicação sem a K5 `payments`
-- (sem linha nesta wave).

-- K5 (ADR-0035 §8): a W19 só amplia o CHECK. Nenhuma linha.
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection', 'credits', 'payments'));

-- Toda escrita financeira pelo papel da aplicação passa por aqui: sem a linha, recusa — inclusive SQL direto.
CREATE FUNCTION app.assert_payments_active() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT app.acts_as_schema_owner()
     AND NOT EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'payments') THEN
    RAISE EXCEPTION 'payments are not activated'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'payments_not_activated';
  END IF;
END $$;

-- Pagamento (TECH-080 etapa 1, TECH-081). Idempotente por usuário + chave; a chave do provedor é o próprio `id`.
-- `pending → approved | failed`, ambos terminais (estado monotônico).
CREATE TABLE app.payment (
  id uuid PRIMARY KEY,
  payer_party_id uuid NOT NULL REFERENCES app.party(id),
  created_by_user_id uuid NOT NULL,
  purpose text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  provider text NOT NULL,
  provider_payment_id text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  -- Finalidades com consumidor: o Luxchange Fee (W21/W23). Luxplus e locação entram com as próprias waves.
  CONSTRAINT billing_payment_purpose CHECK (purpose IN ('luxchange_fee')),
  CONSTRAINT billing_payment_amount CHECK (amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT billing_payment_currency CHECK (currency = 'BRL'),
  CONSTRAINT billing_payment_provider CHECK (provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT billing_payment_provider_reference CHECK (
    provider_payment_id IS NULL OR length(provider_payment_id) BETWEEN 1 AND 255),
  CONSTRAINT billing_payment_idempotency_key CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
  CONSTRAINT billing_payment_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT billing_payment_state CHECK (state IN ('pending', 'approved', 'failed')),
  CONSTRAINT billing_payment_resolution CHECK ((state = 'pending') = (resolved_at IS NULL)),
  CONSTRAINT billing_payment_idempotency UNIQUE (created_by_user_id, idempotency_key),
  CONSTRAINT billing_payment_provider_unique UNIQUE (provider, provider_payment_id)
);
CREATE INDEX payment_reconciliation_idx ON app.payment (state, created_at);

-- Nasce `pending`, sem referência do provedor, de quem representa o pagador no instante.
CREATE FUNCTION app.payment_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_payments_active();
  IF NEW.state IS DISTINCT FROM 'pending' OR NEW.provider_payment_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a payment opens pending, before any provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_opening';
  END IF;
  PERFORM app.lock_own_use_representation(NEW.created_by_user_id, NEW.payer_party_id, clock_timestamp());
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.payment_open() FROM PUBLIC;
CREATE TRIGGER payment_open BEFORE INSERT ON app.payment
  FOR EACH ROW EXECUTE FUNCTION app.payment_open();

-- Só o estado (para frente) e a referência do provedor (uma vez) mudam; `resolved_at` é o instante do banco.
CREATE FUNCTION app.payment_advance() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_payments_active();
  IF (NEW.id, NEW.payer_party_id, NEW.created_by_user_id, NEW.purpose, NEW.amount_minor, NEW.currency, NEW.provider,
      NEW.idempotency_key, NEW.request_hash, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.payer_party_id, OLD.created_by_user_id, OLD.purpose, OLD.amount_minor, OLD.currency, OLD.provider,
      OLD.idempotency_key, OLD.request_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'a payment keeps its payer, purpose, amount and provider'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_immutable';
  END IF;
  IF OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('approved', 'failed') THEN
      RAISE EXCEPTION 'payment states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  IF NEW.state = 'approved' AND NEW.provider_payment_id IS NULL THEN
    RAISE EXCEPTION 'an approved payment carries the provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_payment_reference_required';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.payment_advance() FROM PUBLIC;
CREATE TRIGGER payment_advance BEFORE UPDATE ON app.payment
  FOR EACH ROW EXECUTE FUNCTION app.payment_advance();

-- Luxchange Fee (TECH-082, `01` §24, BR-230–232): um por operação e por pagamento. O valor é conferido com o PRL total
-- informado e as versões de percentual e mínimo registradas no snapshot da operação (TECH-031): HALF_UP uma vez no valor
-- percentual (`round` do PostgreSQL afasta do zero, igual a HALF_UP para positivos); o mínimo é por operação.
CREATE TABLE app.fee_charge (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  payment_id uuid NOT NULL REFERENCES app.payment(id),
  payer_party_id uuid NOT NULL REFERENCES app.party(id),
  prl_total_minor bigint NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT billing_fee_charge_prl CHECK (prl_total_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT billing_fee_charge_amount CHECK (amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT billing_fee_charge_currency CHECK (currency = 'BRL'),
  CONSTRAINT fee_charge_operation_unique UNIQUE (operation_id),
  CONSTRAINT payment_already_bound UNIQUE (payment_id)
);

CREATE FUNCTION app.fee_charge_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; p app.payment; v_rate text; v_minimum text; v_currency text; v_fee bigint;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command NOT IN ('send_request', 'create_direct') OR op.actor_user_id IS NULL
     OR op.acting_party_id IS DISTINCT FROM NEW.payer_party_id THEN
    RAISE EXCEPTION 'the Fee is charged by a Request or a Direct, to the party that acts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_charge_origin';
  END IF;
  PERFORM app.lock_own_use_representation(op.actor_user_id, NEW.payer_party_id, clock_timestamp());
  SELECT * INTO p FROM app.payment WHERE id = NEW.payment_id FOR UPDATE;
  IF p.state IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'the Fee binds an approved payment'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_not_approved';
  END IF;
  IF p.purpose <> 'luxchange_fee' OR p.payer_party_id <> NEW.payer_party_id THEN
    RAISE EXCEPTION 'the payment was made for this Fee by the same party'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM app.refund r WHERE r.payment_id = p.id) THEN
    RAISE EXCEPTION 'a payment under refund is never bound'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_refunded';
  END IF;
  SELECT r.value, m.value, m.currency INTO v_rate, v_minimum, v_currency
    FROM app.economic_snapshot_parameter sr
    JOIN app.parameter r ON r.id = sr.parameter_id
    JOIN app.economic_snapshot_parameter sm
      ON sm.operation_id = sr.operation_id AND sm.parameter_key = 'luxchange_fee_minimum'
    JOIN app.parameter m ON m.id = sm.parameter_id
   WHERE sr.operation_id = NEW.operation_id AND sr.parameter_key = 'luxchange_fee_rate';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the Fee records its rate and minimum in the snapshot of its operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_snapshot_missing';
  END IF;
  v_fee := greatest(round(NEW.prl_total_minor::numeric * v_rate::numeric)::bigint, v_minimum::bigint);
  IF NEW.amount_minor <> v_fee OR NEW.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'the Fee is the greater of the rate over the PRL total and the minimum in force'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_fee_amount_mismatch';
  END IF;
  IF p.amount_minor <> NEW.amount_minor OR p.currency <> NEW.currency THEN
    RAISE EXCEPTION 'the approved amount is the Fee of the operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_amount_mismatch';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.fee_charge_write() FROM PUBLIC;
CREATE TRIGGER fee_charge_write BEFORE INSERT ON app.fee_charge
  FOR EACH ROW EXECUTE FUNCTION app.fee_charge_write();

-- Estorno/void (TECH-080 etapa 6, TECH-081). `pending → succeeded | failed`; nova tentativa é nova linha (nova
-- operação). Origem: reversão do Fee (desfecho pré-aceite) ou conciliação de pagamento aprovado sem desfecho.
CREATE TABLE app.refund (
  id uuid PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES app.payment(id),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  state text NOT NULL,
  provider_refund_id text,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CONSTRAINT billing_refund_amount CHECK (amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT billing_refund_currency CHECK (currency = 'BRL'),
  CONSTRAINT billing_refund_state CHECK (state IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT billing_refund_resolution CHECK ((state = 'pending') = (resolved_at IS NULL)),
  CONSTRAINT billing_refund_provider_reference CHECK (
    provider_refund_id IS NULL OR length(provider_refund_id) BETWEEN 1 AND 255),
  CONSTRAINT refund_payment_operation_unique UNIQUE (payment_id, operation_id)
);
CREATE INDEX refund_payment_idx ON app.refund (payment_id);
CREATE INDEX refund_open_idx ON app.refund (state, created_at) WHERE state <> 'succeeded';

-- Reversão integral do Fee (PD-006, TECH-082): só Fee de Request, pelos desfechos pré-aceite. Uma por Fee.
CREATE TABLE app.fee_charge_reversal (
  fee_charge_id uuid NOT NULL REFERENCES app.fee_charge(id),
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  created_at timestamptz NOT NULL,
  CONSTRAINT conflict_fee_charge_reversal PRIMARY KEY (fee_charge_id)
);

-- Settlement (TECH-083, REQ-094): append-only por natureza e beneficiário (nulo = Luxtory). Categorias separadas; só as
-- habilitadas são graváveis pelo papel da aplicação — na W19, o Luxchange Fee (BR-352: nada indefinido é presumido).
CREATE TABLE app.settlement (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES app.operation(id),
  kind text NOT NULL,
  beneficiary_party_id uuid REFERENCES app.party(id),
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  fee_charge_id uuid REFERENCES app.fee_charge(id),
  created_at timestamptz NOT NULL,
  CONSTRAINT settlement_kind_check CHECK (kind IN (
    'membership', 'administration_fee', 'design_build', 'property_services', 'luxchange_fee', 'luxplus', 'rental',
    'structuring_commercialization', 'second_home_expenses', 'brand_partner_obligation', 'investor_margin',
    'titular_net'
  )),
  -- Receita Luxtory tem a Luxtory como beneficiária; obrigações com terceiros têm a party beneficiária (TECH-083:
  -- Brand Partner e margem do Investor nunca são automaticamente receita Luxtory). Despesas: beneficiário não definido.
  CONSTRAINT settlement_beneficiary_group CHECK (
    (kind IN ('membership', 'administration_fee', 'design_build', 'property_services', 'luxchange_fee', 'luxplus',
              'rental', 'structuring_commercialization') AND beneficiary_party_id IS NULL)
    OR (kind IN ('brand_partner_obligation', 'investor_margin', 'titular_net') AND beneficiary_party_id IS NOT NULL)
    OR kind = 'second_home_expenses'
  ),
  CONSTRAINT settlement_fee_link CHECK ((fee_charge_id IS NOT NULL) = (kind = 'luxchange_fee')),
  CONSTRAINT billing_settlement_amount CHECK (amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT billing_settlement_currency CHECK (currency = 'BRL'),
  CONSTRAINT settlement_operation_kind_beneficiary_unique
    UNIQUE NULLS NOT DISTINCT (operation_id, kind, beneficiary_party_id),
  CONSTRAINT conflict_fee_charge_settlement UNIQUE (fee_charge_id)
);
CREATE INDEX settlement_kind_idx ON app.settlement (kind, currency);

CREATE FUNCTION app.fee_charge_reversal_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; fee_op text; v_payment uuid;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  -- Desfechos pré-aceite do PD-006 nomeados na TECH-051/TECH-090; perda de elegibilidade entra com a W21.
  IF op.command NOT IN ('withdraw_request', 'reject_request', 'accept_request', 'expire_requests') THEN
    RAISE EXCEPTION 'the Fee is reversed only by a pre-acceptance outcome'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_origin';
  END IF;
  SELECT o.command, f.payment_id INTO fee_op, v_payment
    FROM app.fee_charge f JOIN app.operation o ON o.id = f.operation_id WHERE f.id = NEW.fee_charge_id;
  IF fee_op IS DISTINCT FROM 'send_request' THEN
    RAISE EXCEPTION 'only the Fee of a Request has pre-acceptance outcomes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_fee_reversal_mechanism';
  END IF;
  PERFORM 1 FROM app.payment WHERE id = v_payment FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.settlement s WHERE s.fee_charge_id = NEW.fee_charge_id) THEN
    RAISE EXCEPTION 'a settled Fee is not reversed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_settled';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.fee_charge_reversal_write() FROM PUBLIC;
CREATE TRIGGER fee_charge_reversal_write BEFORE INSERT ON app.fee_charge_reversal
  FOR EACH ROW EXECUTE FUNCTION app.fee_charge_reversal_write();

-- Estorno: pagamento aprovado, travado; vinculado só pela reversão do Fee (ou nova tentativa da conciliação); órfão só
-- pela conciliação; soma dos estornos não falhos nunca acima do valor aprovado.
CREATE FUNCTION app.refund_open() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; p app.payment; v_fee uuid; v_reversal_op uuid; v_active bigint;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  IF NEW.state IS DISTINCT FROM 'pending' OR NEW.provider_refund_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a refund opens pending, before any provider reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_opening';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO p FROM app.payment WHERE id = NEW.payment_id FOR UPDATE;
  IF p.state IS DISTINCT FROM 'approved' OR p.currency <> NEW.currency THEN
    RAISE EXCEPTION 'only an approved payment is refunded, in its currency'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_payment';
  END IF;
  SELECT f.id, r.operation_id INTO v_fee, v_reversal_op
    FROM app.fee_charge f LEFT JOIN app.fee_charge_reversal r ON r.fee_charge_id = f.id
   WHERE f.payment_id = p.id;
  IF v_fee IS NOT NULL AND v_reversal_op IS NULL THEN
    RAISE EXCEPTION 'a payment bound to a Fee is refunded only through the Fee reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_bound_payment';
  END IF;
  IF NOT (op.command = 'reconciliation' OR (v_fee IS NOT NULL AND v_reversal_op = NEW.operation_id)) THEN
    RAISE EXCEPTION 'a refund comes from the Fee reversal or from the reconciliation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_origin';
  END IF;
  SELECT coalesce(sum(r.amount_minor), 0) INTO v_active
    FROM app.refund r WHERE r.payment_id = p.id AND r.state <> 'failed';
  IF v_active + NEW.amount_minor > p.amount_minor THEN
    RAISE EXCEPTION 'refunds never exceed the approved amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_exceeds_payment';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.refund_open() FROM PUBLIC;
CREATE TRIGGER refund_open BEFORE INSERT ON app.refund
  FOR EACH ROW EXECUTE FUNCTION app.refund_open();

CREATE FUNCTION app.refund_advance() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_payments_active();
  IF (NEW.id, NEW.payment_id, NEW.operation_id, NEW.amount_minor, NEW.currency, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.payment_id, OLD.operation_id, OLD.amount_minor, OLD.currency, OLD.created_at) THEN
    RAISE EXCEPTION 'a refund keeps its payment, operation and amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_immutable';
  END IF;
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
    RAISE EXCEPTION 'the provider reference is recorded once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_reference_once';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF OLD.state <> 'pending' OR NEW.state NOT IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'refund states only move forward: % -> %', OLD.state, NEW.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_refund_state_regression';
    END IF;
    NEW.resolved_at := clock_timestamp();
  ELSE
    NEW.resolved_at := OLD.resolved_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.refund_advance() FROM PUBLIC;
CREATE TRIGGER refund_advance BEFORE UPDATE ON app.refund
  FOR EACH ROW EXECUTE FUNCTION app.refund_advance();

-- Apuração do Fee como receita Luxtory: Fee não revertido, mesmo valor, quando a operação se torna definitiva (aceite da
-- Request, W22; Direct, W23). Demais categorias fechadas até a wave dona definir valores e beneficiários.
CREATE FUNCTION app.settlement_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; f app.fee_charge; fee_op text;
BEGIN
  PERFORM app.assert_payments_active();
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  NEW.created_at := clock_timestamp();
  IF app.acts_as_schema_owner() THEN
    RETURN NEW;
  END IF;
  IF NEW.kind <> 'luxchange_fee' THEN
    RAISE EXCEPTION 'settlement category % is not enabled', NEW.kind
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'settlement_kind_not_enabled';
  END IF;
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  SELECT * INTO STRICT f FROM app.fee_charge WHERE id = NEW.fee_charge_id;
  SELECT o.command INTO fee_op FROM app.operation o WHERE o.id = f.operation_id;
  IF NOT ((op.command = 'create_direct' AND f.operation_id = NEW.operation_id)
          OR (op.command = 'accept_request' AND fee_op = 'send_request')) THEN
    RAISE EXCEPTION 'the Fee is settled when its Request is accepted or its Direct confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_origin';
  END IF;
  PERFORM 1 FROM app.payment WHERE id = f.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.fee_charge_reversal r WHERE r.fee_charge_id = f.id) THEN
    RAISE EXCEPTION 'a reversed Fee is not settled'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_fee_charge_reversed';
  END IF;
  IF NEW.amount_minor <> f.amount_minor OR NEW.currency <> f.currency THEN
    RAISE EXCEPTION 'the Fee is settled for its charged amount'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'billing_settlement_fee_amount';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.settlement_write() FROM PUBLIC;
CREATE TRIGGER settlement_write BEFORE INSERT ON app.settlement
  FOR EACH ROW EXECUTE FUNCTION app.settlement_write();

-- Inbox de webhooks (ADR-006): deduplicação por provedor + evento, na transação que aplica a transição. Só o hash do
-- corpo, o tipo e o resultado — nunca o payload bruto (TECH-100).
CREATE TABLE app.webhook_inbox (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL,
  payment_id uuid REFERENCES app.payment(id),
  refund_id uuid REFERENCES app.refund(id),
  outcome text NOT NULL,
  received_at timestamptz NOT NULL,
  CONSTRAINT billing_webhook_provider CHECK (provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT billing_webhook_event_id CHECK (event_id ~ '^[!-~]{1,255}$'),
  CONSTRAINT billing_webhook_event_type CHECK (event_type IN (
    'payment.approved', 'payment.failed', 'refund.succeeded', 'refund.failed')),
  CONSTRAINT billing_webhook_payload CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT billing_webhook_outcome CHECK (outcome IN ('applied', 'no_change', 'unknown_object')),
  CONSTRAINT webhook_inbox_event_unique UNIQUE (provider, event_id)
);

CREATE FUNCTION app.webhook_inbox_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.assert_payments_active();
  NEW.received_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.webhook_inbox_write() FROM PUBLIC;
CREATE TRIGGER webhook_inbox_write BEFORE INSERT ON app.webhook_inbox
  FOR EACH ROW EXECUTE FUNCTION app.webhook_inbox_write();

-- Append-only (TECH-052): nenhum DELETE/TRUNCATE; UPDATE só nas transições de pagamento e estorno.
CREATE TRIGGER payment_no_delete BEFORE DELETE ON app.payment FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER payment_no_truncate BEFORE TRUNCATE ON app.payment
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER refund_no_delete BEFORE DELETE ON app.refund FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER refund_no_truncate BEFORE TRUNCATE ON app.refund
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_no_update BEFORE UPDATE ON app.fee_charge
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_no_delete BEFORE DELETE ON app.fee_charge
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_no_truncate BEFORE TRUNCATE ON app.fee_charge
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_reversal_no_update BEFORE UPDATE ON app.fee_charge_reversal
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_reversal_no_delete BEFORE DELETE ON app.fee_charge_reversal
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER fee_charge_reversal_no_truncate BEFORE TRUNCATE ON app.fee_charge_reversal
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER settlement_no_update BEFORE UPDATE ON app.settlement
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER settlement_no_delete BEFORE DELETE ON app.settlement
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER settlement_no_truncate BEFORE TRUNCATE ON app.settlement
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER webhook_inbox_no_update BEFORE UPDATE ON app.webhook_inbox
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER webhook_inbox_no_delete BEFORE DELETE ON app.webhook_inbox
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER webhook_inbox_no_truncate BEFORE TRUNCATE ON app.webhook_inbox
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Invariantes financeiros, consultados após todo teste `db` e pela conciliação.
CREATE FUNCTION app.billing_invariant_breaches()
  RETURNS TABLE (invariant text, object_id uuid, detail text)
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  -- Estornos não falhos nunca acima do valor; só de pagamento aprovado.
  SELECT 'TECH-025/refund_total', p.id, sum(r.amount_minor)::text
    FROM app.payment p JOIN app.refund r ON r.payment_id = p.id AND r.state <> 'failed'
   GROUP BY p.id, p.amount_minor HAVING sum(r.amount_minor) > p.amount_minor
  UNION ALL
  SELECT 'TECH-080/refund_payment_state', r.id, p.state
    FROM app.refund r JOIN app.payment p ON p.id = r.payment_id WHERE p.state <> 'approved'
  UNION ALL
  -- Fee: pagamento aprovado, mesmo valor e moeda, da party que age.
  SELECT 'TECH-082/fee_payment', f.id, p.state
    FROM app.fee_charge f JOIN app.payment p ON p.id = f.payment_id
   WHERE p.state <> 'approved' OR p.amount_minor <> f.amount_minor OR p.currency <> f.currency
      OR p.payer_party_id <> f.payer_party_id
  UNION ALL
  -- Fee revertido e apurado ao mesmo tempo.
  SELECT 'TECH-082/fee_reversed_and_settled', f.id, ''
    FROM app.fee_charge f
    JOIN app.fee_charge_reversal r ON r.fee_charge_id = f.id
    JOIN app.settlement s ON s.fee_charge_id = f.id
  UNION ALL
  -- Apuração do Fee pelo valor cobrado.
  SELECT 'TECH-083/fee_settlement_amount', s.id, s.amount_minor::text
    FROM app.settlement s JOIN app.fee_charge f ON f.id = s.fee_charge_id
   WHERE s.amount_minor <> f.amount_minor OR s.currency <> f.currency
  UNION ALL
  -- Aprovado sempre com a referência do provedor.
  SELECT 'TECH-081/approved_reference', p.id, ''
    FROM app.payment p WHERE p.state = 'approved' AND p.provider_payment_id IS NULL
$$;
REVOKE ALL ON FUNCTION app.billing_invariant_breaches() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_payments_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_payments_active() TO luxtory_app;

-- Só o servidor lê e grava (TECH-052): nenhuma leitura por `anon`/`authenticated`.
ALTER TABLE app.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fee_charge ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fee_charge_reversal ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.webhook_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_app_read ON app.payment FOR SELECT TO luxtory_app USING (true);
CREATE POLICY payment_app_insert ON app.payment FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY payment_app_update ON app.payment FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
CREATE POLICY fee_charge_app_read ON app.fee_charge FOR SELECT TO luxtory_app USING (true);
CREATE POLICY fee_charge_app_insert ON app.fee_charge FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY fee_charge_reversal_app_read ON app.fee_charge_reversal FOR SELECT TO luxtory_app USING (true);
CREATE POLICY fee_charge_reversal_app_insert ON app.fee_charge_reversal FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY refund_app_read ON app.refund FOR SELECT TO luxtory_app USING (true);
CREATE POLICY refund_app_insert ON app.refund FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY refund_app_update ON app.refund FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
CREATE POLICY settlement_app_read ON app.settlement FOR SELECT TO luxtory_app USING (true);
CREATE POLICY settlement_app_insert ON app.settlement FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY webhook_inbox_app_read ON app.webhook_inbox FOR SELECT TO luxtory_app USING (true);
CREATE POLICY webhook_inbox_app_insert ON app.webhook_inbox FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT ON app.payment, app.fee_charge, app.fee_charge_reversal, app.refund, app.settlement, app.webhook_inbox
  TO luxtory_app;
GRANT INSERT (id, payer_party_id, created_by_user_id, purpose, amount_minor, currency, provider, idempotency_key,
              request_hash, state) ON app.payment TO luxtory_app;
GRANT UPDATE (state, provider_payment_id) ON app.payment TO luxtory_app;
GRANT INSERT (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor, currency)
  ON app.fee_charge TO luxtory_app;
GRANT INSERT (fee_charge_id, operation_id) ON app.fee_charge_reversal TO luxtory_app;
GRANT INSERT (id, payment_id, operation_id, amount_minor, currency, state) ON app.refund TO luxtory_app;
GRANT UPDATE (state, provider_refund_id) ON app.refund TO luxtory_app;
GRANT INSERT (id, operation_id, kind, beneficiary_party_id, amount_minor, currency, fee_charge_id)
  ON app.settlement TO luxtory_app;
GRANT INSERT (id, provider, event_id, event_type, payload_sha256, payment_id, refund_id, outcome)
  ON app.webhook_inbox TO luxtory_app;


-- migrate:down
-- Fatos financeiros nunca são descartados por rollback (TECH-052) nem a regra é removida sob uma ativação: com qualquer
-- linha ou a K5 presente, a reversão é recusada. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.payment, app.fee_charge, app.fee_charge_reversal, app.refund, app.settlement, app.webhook_inbox,
    app.capability_activation IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.payment) OR EXISTS (SELECT 1 FROM app.fee_charge)
     OR EXISTS (SELECT 1 FROM app.fee_charge_reversal) OR EXISTS (SELECT 1 FROM app.refund)
     OR EXISTS (SELECT 1 FROM app.settlement) OR EXISTS (SELECT 1 FROM app.webhook_inbox)
     OR EXISTS (SELECT 1 FROM app.capability_activation WHERE capability = 'payments') THEN
    RAISE EXCEPTION 'W19 rollback would discard financial facts or remove the rule under an activation decision';
  END IF;
END $$;
DROP FUNCTION app.billing_invariant_breaches();
DROP TABLE app.webhook_inbox;
DROP TABLE app.settlement;
DROP TABLE app.fee_charge_reversal;
DROP TABLE app.refund;
DROP TABLE app.fee_charge;
DROP TABLE app.payment;
DROP FUNCTION app.webhook_inbox_write();
DROP FUNCTION app.settlement_write();
DROP FUNCTION app.refund_advance();
DROP FUNCTION app.refund_open();
DROP FUNCTION app.fee_charge_reversal_write();
DROP FUNCTION app.fee_charge_write();
DROP FUNCTION app.payment_advance();
DROP FUNCTION app.payment_open();
DROP FUNCTION app.assert_payments_active();
ALTER TABLE app.capability_activation
  DROP CONSTRAINT capability_activation_capability_check,
  ADD CONSTRAINT capability_activation_capability_check
    CHECK (capability IN ('own_use_booking', 'own_use_lifecycle', 'luxtory_selection', 'credits'));
