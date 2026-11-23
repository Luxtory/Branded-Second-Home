-- migrate:up
-- W16 (TECH-030, TECH-033, TECH-001; REQ-013, REQ-095; ADR-0032 §6–§7; spec admin §14): chaves econômicas globais no
-- mesmo `app.parameter` da W14 (ADR-0030 §3 previa a ampliação por migration própria). As seis chaves não têm Second
-- Home (`second_home_id` nulo); `guest_rules` continua a única chave por Second Home. O valor fica em texto canônico,
-- tipado no banco por CHECK de formato por chave; dinheiro em unidade mínima com `currency = 'BRL'`. Zero e negativo
-- são recusados (BR-361); os limites superiores são técnicos. Nenhum valor é gravado aqui (TECH-001, D4): versões só
-- pelo `set_parameter`, com autorização operacional.
--
-- Vigência, autoridade e imutabilidade seguem idênticas às da W14. Só três definições mudam para tratar o escopo global
-- como um escopo próprio: a trava (`app.parameter:<chave>:global`), a busca da versão mais recente e `parameter_at`
-- (`IS NOT DISTINCT FROM`); a unicidade do início passa a `NULLS NOT DISTINCT`. A view ganha `currency` ao fim.
-- Valor-base anual do Membership (BR-141): só registro e histórico — sem cobrança, renovação, faturamento, plano ou
-- integração financeira, e sem tocar `app.membership` (D1–D4 da W15).
ALTER TABLE app.parameter
  ALTER COLUMN second_home_id DROP NOT NULL,
  ADD COLUMN currency text;

ALTER TABLE app.parameter
  DROP CONSTRAINT parameter_key_check,
  DROP CONSTRAINT conflict_parameter_scope_start;

ALTER TABLE app.parameter
  ADD CONSTRAINT parameter_key_check CHECK (key IN ('guest_rules', 'credit_multiplier', 'credit_validity_months',
    'luxchange_fee_rate', 'luxchange_fee_minimum', 'request_deadline_hours', 'membership_base_annual_price')),
  -- Só `guest_rules` é por Second Home; as chaves econômicas são globais.
  ADD CONSTRAINT parameter_scope_check CHECK ((key = 'guest_rules') = (second_home_id IS NOT NULL)),
  -- Moeda só nas chaves monetárias, e só BRL (única moeda do `01`).
  ADD CONSTRAINT parameter_currency_check CHECK (
    (key IN ('luxchange_fee_minimum', 'membership_base_annual_price')) = (currency IS NOT NULL) AND (currency IS NULL OR currency = 'BRL')),
  -- Inteiros positivos (meses, horas); limite técnico de 4 dígitos.
  ADD CONSTRAINT parameter_integer_value CHECK (
    key NOT IN ('credit_validity_months', 'request_deadline_hours') OR value ~ '^[1-9][0-9]{0,3}$'),
  -- Dinheiro em unidade mínima, inteiro positivo; limite técnico de 15 dígitos (exato também como número em JS).
  ADD CONSTRAINT parameter_money_value CHECK (
    key NOT IN ('luxchange_fee_minimum', 'membership_base_annual_price') OR value ~ '^[1-9][0-9]{0,14}$'),
  -- Decimal positivo canônico: até 9 dígitos inteiros e 6 casas, sem zero à direita.
  ADD CONSTRAINT parameter_decimal_value CHECK (
    key <> 'credit_multiplier' OR (value ~ '^(0|[1-9][0-9]{0,8})([.][0-9]{0,5}[1-9])?$' AND value <> '0')),
  -- Percentual do PRL como fração em (0, 1], até 6 casas, canônico.
  ADD CONSTRAINT parameter_rate_value CHECK (
    key <> 'luxchange_fee_rate' OR value ~ '^(0[.][0-9]{0,5}[1-9]|1)$'),
  ADD CONSTRAINT conflict_parameter_scope_start UNIQUE NULLS NOT DISTINCT (key, second_home_id, effective_from);

CREATE OR REPLACE FUNCTION app.parameter_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; latest app.parameter; v_at timestamptz;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'set_parameter' OR op.second_home_id IS DISTINCT FROM NEW.second_home_id
     OR NEW.authority IS DISTINCT FROM op.role OR NEW.created_by IS DISTINCT FROM op.actor_user_id THEN
    RAISE EXCEPTION 'a parameter version is recorded by its set_parameter operation, with its authority and author'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'parameter_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.parameter:' || NEW.key || ':' || coalesce(NEW.second_home_id::text, 'global'), 0));
  v_at := clock_timestamp();
  NEW.created_at := v_at;
  IF NEW.effective_from IS NULL THEN
    NEW.effective_from := v_at;
  ELSIF NEW.effective_from < v_at THEN
    RAISE EXCEPTION 'a parameter version never starts in the past'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_retroactive';
  END IF;
  SELECT * INTO latest FROM app.parameter
   WHERE key = NEW.key AND second_home_id IS NOT DISTINCT FROM NEW.second_home_id
   ORDER BY effective_from DESC LIMIT 1;
  IF FOUND AND (NEW.effective_from <= latest.effective_from
                OR (latest.effective_to IS NOT NULL AND NEW.effective_from < latest.effective_to)) THEN
    RAISE EXCEPTION 'a parameter version starts after every start of its scope and never before an explicit end'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_overlap';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.parameter_at(p_key text, p_second_home_id uuid, p_at timestamptz)
  RETURNS SETOF app.parameter
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.* FROM (
    SELECT p.* FROM app.parameter p
     WHERE p.key = p_key AND p.second_home_id IS NOT DISTINCT FROM p_second_home_id AND p.effective_from <= p_at
     ORDER BY p.effective_from DESC LIMIT 1
  ) v
  WHERE v.effective_to IS NULL OR p_at < v.effective_to
$$;

CREATE OR REPLACE VIEW app.parameter_version WITH (security_invoker = true) AS
SELECT p.id, p.key, p.second_home_id, p.value, p.effective_from, p.effective_to, p.authority, p.authorization_ref,
       p.created_at, p.created_by, p.operation_id,
       coalesce(p.effective_to,
                lead(p.effective_from) OVER (PARTITION BY p.key, p.second_home_id ORDER BY p.effective_from))
         AS effective_until,
       p.currency
  FROM app.parameter p;


-- migrate:down
-- Histórico econômico nunca é descartado por rollback (TECH-052): com qualquer versão de chave econômica, a reversão é
-- recusada. Versões de `guest_rules` permanecem. A trava exclusiva espera publicações em curso e barra as novas.
DO $$
BEGIN
  LOCK TABLE app.parameter IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.parameter WHERE key <> 'guest_rules') THEN
    RAISE EXCEPTION 'W16 rollback would discard the economic parameter history';
  END IF;
END $$;
DROP VIEW app.parameter_version;
CREATE OR REPLACE FUNCTION app.parameter_at(p_key text, p_second_home_id uuid, p_at timestamptz)
  RETURNS SETOF app.parameter
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.* FROM (
    SELECT p.* FROM app.parameter p
     WHERE p.key = p_key AND p.second_home_id = p_second_home_id AND p.effective_from <= p_at
     ORDER BY p.effective_from DESC LIMIT 1
  ) v
  WHERE v.effective_to IS NULL OR p_at < v.effective_to
$$;
CREATE OR REPLACE FUNCTION app.parameter_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE op app.operation; latest app.parameter; v_at timestamptz;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT * INTO STRICT op FROM app.operation WHERE id = NEW.operation_id;
  IF op.command <> 'set_parameter' OR op.second_home_id IS DISTINCT FROM NEW.second_home_id
     OR NEW.authority IS DISTINCT FROM op.role OR NEW.created_by IS DISTINCT FROM op.actor_user_id THEN
    RAISE EXCEPTION 'a parameter version is recorded by its set_parameter operation, with its authority and author'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'parameter_operation_provenance';
  END IF;
  PERFORM app.lock_own_use_admin_authority(op);
  PERFORM pg_advisory_xact_lock(hashtextextended('app.parameter:' || NEW.key || ':' || NEW.second_home_id::text, 0));
  v_at := clock_timestamp();
  NEW.created_at := v_at;
  IF NEW.effective_from IS NULL THEN
    NEW.effective_from := v_at;
  ELSIF NEW.effective_from < v_at THEN
    RAISE EXCEPTION 'a parameter version never starts in the past'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_retroactive';
  END IF;
  SELECT * INTO latest FROM app.parameter
   WHERE key = NEW.key AND second_home_id = NEW.second_home_id
   ORDER BY effective_from DESC LIMIT 1;
  IF FOUND AND (NEW.effective_from <= latest.effective_from
                OR (latest.effective_to IS NOT NULL AND NEW.effective_from < latest.effective_to)) THEN
    RAISE EXCEPTION 'a parameter version starts after every start of its scope and never before an explicit end'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'conflict_parameter_overlap';
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE app.parameter
  DROP CONSTRAINT conflict_parameter_scope_start,
  DROP CONSTRAINT parameter_rate_value,
  DROP CONSTRAINT parameter_decimal_value,
  DROP CONSTRAINT parameter_money_value,
  DROP CONSTRAINT parameter_integer_value,
  DROP CONSTRAINT parameter_currency_check,
  DROP CONSTRAINT parameter_scope_check,
  DROP CONSTRAINT parameter_key_check;
ALTER TABLE app.parameter
  ADD CONSTRAINT parameter_key_check CHECK (key IN ('guest_rules')),
  ADD CONSTRAINT conflict_parameter_scope_start UNIQUE (key, second_home_id, effective_from);
ALTER TABLE app.parameter
  DROP COLUMN currency,
  ALTER COLUMN second_home_id SET NOT NULL;
CREATE VIEW app.parameter_version WITH (security_invoker = true) AS
SELECT p.*,
       coalesce(p.effective_to,
                lead(p.effective_from) OVER (PARTITION BY p.key, p.second_home_id ORDER BY p.effective_from))
         AS effective_until
  FROM app.parameter p;
GRANT SELECT ON app.parameter_version TO luxtory_app;
