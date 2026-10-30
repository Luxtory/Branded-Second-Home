-- migrate:up
-- W11 (TECH-026, TECH-027, TECH-042; 01 BR-074–BR-095, BR-100–BR-109; spec calendar §6; ADR-0025): o ledger
-- só-inserção da W8 recebe os cinco movimentos do TECH-026. O banco confere cada movimento pelos fatos — fonte,
-- quantidade, Ação, exercício, categoria e tempo —, de modo que o papel da aplicação só grava o canônico: concessão da
-- configuração de exercício selado, concessão do 29/02 à Ação contemplada antes do vencimento e expiração exata depois
-- do fim efetivo. `consume`/`restore` têm a forma completa e ficam fechados ao papel da aplicação até a W12/W13;
-- `correction` é só estrutural e fechada a todos até a W13 (semântica pendente, D2).

-- Calendário gregoriano, rotação ordinária (BR-101) e lista do 29/02 (BR-093–BR-095): as mesmas funções do TypeScript
-- (src/features/calendar/domain/use-right.ts); o teste db compara as duas implementações.
CREATE FUNCTION app.is_leap_year(p_year integer) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT p_year % 4 = 0 AND (p_year % 100 <> 0 OR p_year % 400 = 0) $$;

-- Anos bissextos em [p_from, p_to).
CREATE FUNCTION app.leap_years_between(p_from integer, p_to integer) RETURNS integer
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE WHEN p_to <= p_from THEN 0 ELSE
    ((p_to - 1) / 4 - (p_to - 1) / 100 + (p_to - 1) / 400)
    - ((p_from - 1) / 4 - (p_from - 1) / 100 + (p_from - 1) / 400) END
$$;

-- Primeiro ano bissexto com 29/02 na data-base ou depois dela (uma data-base em 29/02 conta).
CREATE FUNCTION app.first_leap_exercise(p_start date) RETURNS integer
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT min(y)
    FROM generate_series(extract(year FROM p_start)::integer, extract(year FROM p_start)::integer + 8) AS y
   WHERE CASE WHEN app.is_leap_year(y) THEN make_date(y, 2, 29) >= p_start ELSE false END
$$;

-- BR-101: a posição 1 passa à última e as demais avançam; módulo não negativo.
CREATE FUNCTION app.ordinary_position(p_initial integer, p_stakes integer, p_first_exercise integer,
    p_exercise integer) RETURNS integer
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$ SELECT ((p_initial - 1 - (p_exercise - p_first_exercise)) % p_stakes + p_stakes) % p_stakes + 1 $$;

-- TECH-042: a Ação contemplada com o 29/02 do exercício — a lista é a ordem ordinária do primeiro 29/02 da operação e
-- avança uma posição por ano bissexto, sem nunca ler a ordem ordinária do ano pedido. NULL = sem sorteio revelado, ano
-- comum ou anterior ao primeiro 29/02 da operação.
CREATE FUNCTION app.leap_day_beneficiary(p_second_home_id uuid, p_exercise integer) RETURNS uuid
  LANGUAGE sql STABLE STRICT SET search_path = ''
AS $$
  WITH f AS (
    SELECT a.id, a.exercise_year AS first_exercise, a.configuration_id AS stakes,
           app.first_leap_exercise(a.operation_start_date) AS fixed_in
      FROM app.acquisition a
     WHERE a.second_home_id = p_second_home_id AND a.modality = 'co_owner'
  )
  SELECT p.stake_id
    FROM f
    JOIN app.initial_draw d ON d.acquisition_id = f.id
    JOIN app.initial_draw_reveal r ON r.draw_id = d.id
    JOIN app.initial_draw_position p ON p.draw_id = d.id
   WHERE app.is_leap_year(p_exercise) AND p_exercise >= f.fixed_in
     AND app.ordinary_position(p.position, f.stakes, f.first_exercise, f.fixed_in) - 1
         = app.leap_years_between(f.fixed_in, p_exercise) % f.stakes
$$;

-- INV-5 e PD-004: fim efetivo do bucket no fuso da Second Home — o 29/02 às 00:00 de 01/03; Alta e Média às 00:00 de
-- 01/01 do exercício seguinte. NULL = 29/02 inexistente no ano.
CREATE FUNCTION app.use_right_effective_end(p_bucket text, p_exercise integer, p_timezone text)
  RETURNS timestamptz
  LANGUAGE sql STABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_bucket = 'leap' AND app.is_leap_year(p_exercise)
      THEN make_date(p_exercise, 3, 1)::timestamp AT TIME ZONE p_timezone
    WHEN p_bucket IN ('alta', 'media') THEN make_date(p_exercise + 1, 1, 1)::timestamp AT TIME ZONE p_timezone
  END
$$;

-- W11: consumo e restauração só pelo dono do schema até a wave do command (W12/W13) substituir esta função pela regra de
-- autorização decidida com o fundador (ADR-0024 §3, ADR-0025). Chamada só de gatilho INVOKER: dentro de uma função
-- SECURITY DEFINER `current_user` seria o dono e o gate passaria.
CREATE FUNCTION app.assert_use_right_consumption_enabled() RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
        WHERE r.rolname = current_user
          AND (r.rolsuper OR r.oid = (SELECT c.relowner FROM pg_catalog.pg_class c
                                       WHERE c.oid = 'app.use_right_ledger'::regclass))) THEN
    RAISE EXCEPTION 'use right consumption and restoration are not enabled in W11'
      USING ERRCODE = 'insufficient_privilege', CONSTRAINT = 'use_right_consumption_not_enabled';
  END IF;
END $$;

-- Forma de cada movimento (TECH-026). Só o grant tem fonte — configuração ou alocação inicial —; nenhum outro movimento
-- recebe origem fictícia. O 29/02 é concedido pela configuração (fonte canônica da capacidade extraordinária, 01 §10),
-- sempre 1. `quantity` é a magnitude; a direção da correção é decisão da W13.
ALTER TABLE app.use_right_ledger
  DROP CONSTRAINT conflict_use_right_acquisition,
  DROP CONSTRAINT conflict_use_right_initial_grant,
  DROP CONSTRAINT use_right_ledger_bucket_check,
  DROP CONSTRAINT use_right_ledger_movement_check,
  DROP CONSTRAINT use_right_ledger_source_check,
  ALTER COLUMN source DROP NOT NULL,
  ADD COLUMN stay_date date,
  ADD COLUMN refers_to_id uuid,
  ADD COLUMN effective_at timestamptz,
  ADD CONSTRAINT use_right_ledger_bucket_check CHECK (bucket IN ('alta', 'media', 'leap')),
  ADD CONSTRAINT use_right_ledger_movement_check
    CHECK (movement IN ('grant', 'consume', 'restore', 'expire', 'correction')),
  ADD CONSTRAINT use_right_ledger_source_check CHECK (source IN ('configuration', 'initial_allocation')),
  ADD CONSTRAINT use_right_movement_shape CHECK (CASE movement
    WHEN 'grant' THEN source IS NOT NULL AND stay_date IS NULL AND refers_to_id IS NULL AND effective_at IS NULL
      AND (bucket <> 'leap' OR (source = 'configuration' AND quantity = 1))
    WHEN 'consume' THEN source IS NULL AND initial_allocation_id IS NULL AND stay_date IS NOT NULL
      AND refers_to_id IS NULL AND effective_at IS NULL AND quantity = 1
    WHEN 'restore' THEN source IS NULL AND initial_allocation_id IS NULL AND stay_date IS NOT NULL
      AND refers_to_id IS NOT NULL AND effective_at IS NULL AND quantity = 1
    WHEN 'expire' THEN source IS NULL AND initial_allocation_id IS NULL AND stay_date IS NULL
      AND refers_to_id IS NULL AND effective_at IS NOT NULL AND quantity >= 1
    WHEN 'correction' THEN source IS NULL AND initial_allocation_id IS NULL AND stay_date IS NULL
      AND refers_to_id IS NOT NULL AND effective_at IS NULL AND quantity >= 1
  END),
  -- A W8 amarrava toda linha à operação da formalização; os movimentos seguintes têm a própria operação.
  ADD CONSTRAINT conflict_use_right_acquisition FOREIGN KEY (acquisition_id, second_home_id)
    REFERENCES app.acquisition(id, second_home_id),
  ADD CONSTRAINT use_right_ledger_operation_fk FOREIGN KEY (operation_id) REFERENCES app.operation(id),
  ADD CONSTRAINT custody_use_right_night_sealed FOREIGN KEY (second_home_id, stay_date)
    REFERENCES app.second_home_date(second_home_id, stay_date),
  ADD CONSTRAINT use_right_ledger_refers_to_fk FOREIGN KEY (refers_to_id) REFERENCES app.use_right_ledger(id);

-- Uma concessão por Ação, exercício e bucket; um 29/02 por Second Home e ano; uma restauração por consumo.
CREATE UNIQUE INDEX conflict_use_right_grant ON app.use_right_ledger (stake_id, exercise_year, bucket)
  WHERE movement = 'grant';
CREATE UNIQUE INDEX conflict_use_right_leap_grant ON app.use_right_ledger (second_home_id, exercise_year)
  WHERE movement = 'grant' AND bucket = 'leap';
CREATE UNIQUE INDEX conflict_use_right_restore ON app.use_right_ledger (refers_to_id) WHERE movement = 'restore';
CREATE INDEX use_right_ledger_key_idx ON app.use_right_ledger (stake_id, exercise_year, bucket);

-- A constraint diferida da W8 passa a contar só as concessões da própria formalização (2N do primeiro exercício); os
-- demais movimentos têm a regra abaixo. O resto da validação da W8 fica idêntico.
CREATE OR REPLACE FUNCTION app.validate_acquisition_facts(p_home uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  c app.second_home_configuration;
  v_luxtory uuid;
  v_holdings integer;
  v_parties integer;
  v_stakes integer;
  v_spes integer;
  v_grants integer;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id=p_home;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=a.operation_id
      AND command='formalize_acquisition' AND role='admin' AND actor_user_id IS NOT NULL AND state='committed') THEN
    RAISE EXCEPTION 'ownership facts require the committed formalization command'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_operation';
  END IF;
  SELECT count(*), count(DISTINCT party_id) INTO v_holdings, v_parties FROM app.holding WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_stakes FROM app.stake WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_spes FROM app.spe WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_grants FROM app.use_right_ledger WHERE acquisition_id=a.id AND operation_id=a.operation_id;
  IF a.modality='owner' THEN
    IF v_holdings<>1 OR v_parties<>1 OR v_stakes<>0 OR v_spes<>0 OR v_grants<>0 THEN
      RAISE EXCEPTION 'Owner requires one integral holding and no artificial stake'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
  ELSE
    SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id=a.configuration_id;
    IF v_holdings<>c.id OR v_parties<>c.id OR v_stakes<>c.id OR v_spes<>1 THEN
      RAISE EXCEPTION 'Co-Owner requires N distinct parties, holdings and stakes'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
    IF EXISTS (SELECT 1 FROM app.stake WHERE acquisition_id=a.id
        AND (participation_bps<>c.participation_bps OR allocation_position>c.id)) THEN
      RAISE EXCEPTION 'stakes must match their immutable configuration'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
    END IF;
    SELECT party_id INTO v_luxtory FROM app.luxtory_legal_identity;
    IF v_luxtory IS NULL THEN
      RAISE EXCEPTION 'institutional identity is not registered'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_institution_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id AND party_id=v_luxtory) THEN
      RAISE EXCEPTION 'Luxtory cannot be a shareholder'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_luxtory_shareholder';
    END IF;
    IF v_grants<>2*c.id OR EXISTS (
      SELECT 1 FROM app.use_right_ledger l JOIN app.stake s ON s.id=l.stake_id
      LEFT JOIN app.initial_allocation_grant g ON g.initial_allocation_id=a.initial_allocation_id AND g.position=s.allocation_position
      WHERE l.acquisition_id=a.id AND l.operation_id=a.operation_id AND (
        l.exercise_year<>a.exercise_year
        OR l.source<>CASE WHEN a.initial_allocation_id IS NULL THEN 'configuration' ELSE 'initial_allocation' END
        OR l.initial_allocation_id IS DISTINCT FROM a.initial_allocation_id
        OR l.quantity IS DISTINCT FROM CASE
          WHEN a.initial_allocation_id IS NULL THEN CASE WHEN l.bucket='alta' THEN c.alta ELSE c.media END
          ELSE CASE WHEN l.bucket='alta' THEN g.alta ELSE g.media END END
      )
    ) THEN
      RAISE EXCEPTION 'initial grants require the exact configuration or initial allocation source'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_use_right_grant_source';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id
      AND (role<>a.modality OR valid_until IS NOT NULL OR valid_from<>a.formalized_at)) THEN
    RAISE EXCEPTION 'initial holding must match the formalized modality and time'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
  END IF;
END $$;
-- Trava da estrutura da W8 e constraint diferida dos fatos: só para concessões. Os demais movimentos se serializam pelas
-- travas do TECH-053 (saldo, classe 6), sem a trava consultiva depois das noites.
DROP TRIGGER use_right_ledger_serialize ON app.use_right_ledger;
CREATE TRIGGER use_right_ledger_serialize BEFORE INSERT ON app.use_right_ledger
  FOR EACH ROW WHEN (NEW.movement = 'grant') EXECUTE FUNCTION app.serialize_second_home_fact();
DROP TRIGGER use_right_ledger_facts_constraint ON app.use_right_ledger;
CREATE CONSTRAINT TRIGGER use_right_ledger_facts_constraint AFTER INSERT ON app.use_right_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.movement = 'grant')
  EXECUTE FUNCTION app.acquisition_facts_constraint();

-- Movimentos conferidos pelos fatos (INVOKER: o gate de consumo enxerga o papel real). Instantes carimbados pelo banco,
-- salvo o grant da formalização, que mantém o instante da W8.
CREATE FUNCTION app.use_right_ledger_movement() RETURNS trigger
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
REVOKE ALL ON FUNCTION app.use_right_ledger_movement() FROM PUBLIC;
CREATE TRIGGER use_right_ledger_movement BEFORE INSERT ON app.use_right_ledger
  FOR EACH ROW EXECUTE FUNCTION app.use_right_ledger_movement();

-- Titular continua vendo só concessões (W8); leituras de saldo e movimentos chegam com a W12.
ALTER POLICY use_right_holder_read ON app.use_right_ledger USING (
  movement = 'grant' AND EXISTS (SELECT 1 FROM app.holding h WHERE h.stake_id = use_right_ledger.stake_id)
);

REVOKE ALL ON FUNCTION app.is_leap_year(integer), app.leap_years_between(integer, integer),
  app.first_leap_exercise(date), app.ordinary_position(integer, integer, integer, integer),
  app.leap_day_beneficiary(uuid, integer), app.use_right_effective_end(text, integer, text),
  app.assert_use_right_consumption_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_leap_year(integer), app.leap_years_between(integer, integer),
  app.first_leap_exercise(date), app.ordinary_position(integer, integer, integer, integer),
  app.leap_day_beneficiary(uuid, integer), app.use_right_effective_end(text, integer, text),
  app.assert_use_right_consumption_enabled() TO luxtory_app;


-- migrate:down
-- Só sem movimentos além das concessões da formalização (padrão da W8: rollback nunca descarta fatos).
DO $$
BEGIN
  LOCK TABLE app.use_right_ledger IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.use_right_ledger l JOIN app.acquisition a ON a.id = l.acquisition_id
              WHERE l.operation_id <> a.operation_id) THEN
    RAISE EXCEPTION 'W11 rollback would discard use right movements in app.use_right_ledger';
  END IF;
END $$;
ALTER POLICY use_right_holder_read ON app.use_right_ledger USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.stake_id = use_right_ledger.stake_id)
);
DROP TRIGGER use_right_ledger_movement ON app.use_right_ledger;
DROP FUNCTION app.use_right_ledger_movement();
DROP TRIGGER use_right_ledger_facts_constraint ON app.use_right_ledger;
CREATE CONSTRAINT TRIGGER use_right_ledger_facts_constraint AFTER INSERT ON app.use_right_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.acquisition_facts_constraint();
DROP TRIGGER use_right_ledger_serialize ON app.use_right_ledger;
CREATE TRIGGER use_right_ledger_serialize BEFORE INSERT ON app.use_right_ledger
  FOR EACH ROW EXECUTE FUNCTION app.serialize_second_home_fact();
CREATE OR REPLACE FUNCTION app.validate_acquisition_facts(p_home uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  a app.acquisition;
  c app.second_home_configuration;
  v_luxtory uuid;
  v_holdings integer;
  v_parties integer;
  v_stakes integer;
  v_spes integer;
  v_grants integer;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id=p_home;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.operation WHERE id=a.operation_id
      AND command='formalize_acquisition' AND role='admin' AND actor_user_id IS NOT NULL AND state='committed') THEN
    RAISE EXCEPTION 'ownership facts require the committed formalization command'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_operation';
  END IF;
  SELECT count(*), count(DISTINCT party_id) INTO v_holdings, v_parties FROM app.holding WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_stakes FROM app.stake WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_spes FROM app.spe WHERE acquisition_id=a.id;
  SELECT count(*) INTO v_grants FROM app.use_right_ledger WHERE acquisition_id=a.id;
  IF a.modality='owner' THEN
    IF v_holdings<>1 OR v_parties<>1 OR v_stakes<>0 OR v_spes<>0 OR v_grants<>0 THEN
      RAISE EXCEPTION 'Owner requires one integral holding and no artificial stake'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
  ELSE
    SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id=a.configuration_id;
    IF v_holdings<>c.id OR v_parties<>c.id OR v_stakes<>c.id OR v_spes<>1 THEN
      RAISE EXCEPTION 'Co-Owner requires N distinct parties, holdings and stakes'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_cardinality';
    END IF;
    IF EXISTS (SELECT 1 FROM app.stake WHERE acquisition_id=a.id
        AND (participation_bps<>c.participation_bps OR allocation_position>c.id)) THEN
      RAISE EXCEPTION 'stakes must match their immutable configuration'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
    END IF;
    SELECT party_id INTO v_luxtory FROM app.luxtory_legal_identity;
    IF v_luxtory IS NULL THEN
      RAISE EXCEPTION 'institutional identity is not registered'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_institution_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id AND party_id=v_luxtory) THEN
      RAISE EXCEPTION 'Luxtory cannot be a shareholder'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_luxtory_shareholder';
    END IF;
    IF v_grants<>2*c.id OR EXISTS (
      SELECT 1 FROM app.use_right_ledger l JOIN app.stake s ON s.id=l.stake_id
      LEFT JOIN app.initial_allocation_grant g ON g.initial_allocation_id=a.initial_allocation_id AND g.position=s.allocation_position
      WHERE l.acquisition_id=a.id AND (
        l.exercise_year<>a.exercise_year
        OR l.source<>CASE WHEN a.initial_allocation_id IS NULL THEN 'configuration' ELSE 'initial_allocation' END
        OR l.initial_allocation_id IS DISTINCT FROM a.initial_allocation_id
        OR l.quantity IS DISTINCT FROM CASE
          WHEN a.initial_allocation_id IS NULL THEN CASE WHEN l.bucket='alta' THEN c.alta ELSE c.media END
          ELSE CASE WHEN l.bucket='alta' THEN g.alta ELSE g.media END END
      )
    ) THEN
      RAISE EXCEPTION 'initial grants require the exact configuration or initial allocation source'
        USING ERRCODE='check_violation', CONSTRAINT='conflict_use_right_grant_source';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM app.holding WHERE acquisition_id=a.id
      AND (role<>a.modality OR valid_until IS NOT NULL OR valid_from<>a.formalized_at)) THEN
    RAISE EXCEPTION 'initial holding must match the formalized modality and time'
      USING ERRCODE='check_violation', CONSTRAINT='conflict_acquisition_equivalence';
  END IF;
END $$;
DROP INDEX app.use_right_ledger_key_idx;
DROP INDEX app.conflict_use_right_restore;
DROP INDEX app.conflict_use_right_leap_grant;
DROP INDEX app.conflict_use_right_grant;
ALTER TABLE app.use_right_ledger
  DROP CONSTRAINT use_right_ledger_refers_to_fk,
  DROP CONSTRAINT custody_use_right_night_sealed,
  DROP CONSTRAINT use_right_ledger_operation_fk,
  DROP CONSTRAINT conflict_use_right_acquisition,
  DROP CONSTRAINT use_right_movement_shape,
  DROP CONSTRAINT use_right_ledger_source_check,
  DROP CONSTRAINT use_right_ledger_movement_check,
  DROP CONSTRAINT use_right_ledger_bucket_check,
  DROP COLUMN effective_at,
  DROP COLUMN refers_to_id,
  DROP COLUMN stay_date,
  ALTER COLUMN source SET NOT NULL,
  ADD CONSTRAINT use_right_ledger_source_check CHECK (source IN ('configuration', 'initial_allocation')),
  ADD CONSTRAINT use_right_ledger_movement_check CHECK (movement = 'grant'),
  ADD CONSTRAINT use_right_ledger_bucket_check CHECK (bucket IN ('alta', 'media')),
  ADD CONSTRAINT conflict_use_right_initial_grant UNIQUE (stake_id, exercise_year, bucket, movement),
  ADD CONSTRAINT conflict_use_right_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition(id, second_home_id, operation_id);
DROP FUNCTION app.assert_use_right_consumption_enabled();
DROP FUNCTION app.use_right_effective_end(text, integer, text);
DROP FUNCTION app.leap_day_beneficiary(uuid, integer);
DROP FUNCTION app.ordinary_position(integer, integer, integer, integer);
DROP FUNCTION app.first_leap_exercise(date);
DROP FUNCTION app.leap_years_between(integer, integer);
DROP FUNCTION app.is_leap_year(integer);
