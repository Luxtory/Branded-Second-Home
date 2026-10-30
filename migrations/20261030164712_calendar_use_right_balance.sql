-- migrate:up
-- W11 (TECH-026, TECH-053; spec calendar §6; ADR-0025): `use_right_balance(stake_id, exercise_year, bucket)` é a
-- projeção do ledger, nunca uma segunda fonte. Linha travável (classe 6 do TECH-053) com CHECK: duas reduções
-- concorrentes do mesmo saldo se serializam na linha e a segunda falha com ERR_USE_RIGHT_BALANCE (prefixo `balance_`).
-- Só a manutenção a escreve, a partir da linha do ledger já validada pelos gatilhos INVOKER da migration anterior.

-- Precondição (falha fechada): nenhum exercício Co-Owner posterior ao primeiro selado sem as concessões da W11.
DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM app.second_home_date d JOIN app.acquisition a ON a.second_home_id = d.second_home_id
        WHERE a.modality = 'co_owner' AND d.exercise_year > a.exercise_year) THEN
    RAISE EXCEPTION 'W11 cannot start over Co-Owner exercises sealed without their use right grants';
  END IF;
END $$;

CREATE TABLE app.use_right_balance (
  second_home_id uuid NOT NULL,
  stake_id uuid NOT NULL,
  exercise_year integer NOT NULL CHECK (exercise_year BETWEEN 1 AND 9999),
  bucket text NOT NULL CHECK (bucket IN ('alta', 'media', 'leap')),
  granted integer NOT NULL,
  consumed integer NOT NULL DEFAULT 0,
  expired integer NOT NULL DEFAULT 0,
  remaining integer GENERATED ALWAYS AS (granted - consumed - expired) STORED,
  PRIMARY KEY (stake_id, exercise_year, bucket),
  CONSTRAINT balance_counters_nonnegative CHECK (granted >= 0 AND consumed >= 0 AND expired >= 0),
  -- INV-4: a Ação nunca usa além do próprio limite da categoria, mesmo com capacidade ociosa de outra.
  CONSTRAINT balance_remaining_nonnegative CHECK (granted - consumed - expired >= 0),
  CONSTRAINT balance_stake_same_second_home FOREIGN KEY (stake_id, second_home_id)
    REFERENCES app.stake(id, second_home_id)
);
CREATE INDEX use_right_balance_second_home_idx ON app.use_right_balance (second_home_id, exercise_year);

-- Concessão imutável na projeção: nada (nem uma correção futura) altera `granted` ou a chave (TECH-026, §13 do 03).
CREATE FUNCTION app.use_right_balance_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (NEW.second_home_id, NEW.stake_id, NEW.exercise_year, NEW.bucket, NEW.granted)
     IS DISTINCT FROM (OLD.second_home_id, OLD.stake_id, OLD.exercise_year, OLD.bucket, OLD.granted) THEN
    RAISE EXCEPTION 'a use right grant and its key never change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_granted_immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.use_right_balance_guard() FROM PUBLIC;
CREATE TRIGGER use_right_balance_guard BEFORE UPDATE ON app.use_right_balance
  FOR EACH ROW EXECUTE FUNCTION app.use_right_balance_guard();
CREATE TRIGGER use_right_balance_no_delete BEFORE DELETE ON app.use_right_balance
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER use_right_balance_no_truncate BEFORE TRUNCATE ON app.use_right_balance
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Manutenção da projeção. SECURITY DEFINER só aqui: o papel da aplicação não tem escrita no saldo. Restrições: só como
-- gatilho AFTER INSERT do ledger (conferido abaixo), efeito derivado apenas de NEW — linha já inserida e validada pelos
-- gatilhos INVOKER, inclusive o gate de consumo —, sem parâmetro, sem SQL dinâmico, `search_path` vazio e sem EXECUTE
-- para ninguém (sem EXECUTE não se cria outro gatilho com esta função).
CREATE FUNCTION app.use_right_balance_apply() RETURNS trigger
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
REVOKE ALL ON FUNCTION app.use_right_balance_apply() FROM PUBLIC;
CREATE TRIGGER use_right_ledger_balance AFTER INSERT ON app.use_right_ledger
  FOR EACH ROW EXECUTE FUNCTION app.use_right_balance_apply();

-- Concessões da formalização existentes (W8) entram na projeção.
INSERT INTO app.use_right_balance (second_home_id, stake_id, exercise_year, bucket, granted)
SELECT second_home_id, stake_id, exercise_year, bucket, quantity
  FROM app.use_right_ledger WHERE movement = 'grant';

-- INV-4 no COMMIT da selagem: exercício Co-Owner posterior ao primeiro só termina selado com as 2N concessões da
-- configuração (a selagem é atômica por exercício e começa em 01/01; basta conferir na noite de 01/01).
CREATE FUNCTION app.second_home_date_use_rights_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.acquisition; c app.second_home_configuration;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE second_home_id = NEW.second_home_id;
  IF NOT FOUND OR a.modality <> 'co_owner' OR NEW.exercise_year <= a.exercise_year THEN RETURN NULL; END IF;
  SELECT * INTO STRICT c FROM app.second_home_configuration WHERE id = a.configuration_id;
  IF (SELECT count(*) FROM app.use_right_ledger l
       WHERE l.second_home_id = NEW.second_home_id AND l.exercise_year = NEW.exercise_year
         AND l.movement = 'grant' AND l.bucket IN ('alta', 'media') AND l.source = 'configuration'
         AND l.quantity = CASE l.bucket WHEN 'alta' THEN c.alta ELSE c.media END) <> 2 * c.id THEN
    RAISE EXCEPTION 'a sealed Co-Owner exercise carries the configuration grants of every stake'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'use_right_exercise_grants';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.second_home_date_use_rights_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER second_home_date_use_rights_constraint AFTER INSERT ON app.second_home_date
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (extract(month FROM NEW.stay_date) = 1 AND extract(day FROM NEW.stay_date) = 1)
  EXECUTE FUNCTION app.second_home_date_use_rights_constraint();

-- Leitura só no servidor na W11 (as leituras do Titular chegam com a W12); nenhuma escrita direta.
ALTER TABLE app.use_right_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY use_right_balance_app_read ON app.use_right_balance FOR SELECT TO luxtory_app USING (true);
GRANT SELECT ON app.use_right_balance TO luxtory_app;


-- migrate:down
DO $$
BEGIN
  LOCK TABLE app.use_right_ledger IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.use_right_ledger l JOIN app.acquisition a ON a.id = l.acquisition_id
              WHERE l.operation_id <> a.operation_id) THEN
    RAISE EXCEPTION 'W11 rollback would discard use right movements in app.use_right_ledger';
  END IF;
END $$;
DROP TRIGGER second_home_date_use_rights_constraint ON app.second_home_date;
DROP FUNCTION app.second_home_date_use_rights_constraint();
DROP TRIGGER use_right_ledger_balance ON app.use_right_ledger;
DROP FUNCTION app.use_right_balance_apply();
DROP TABLE app.use_right_balance;
DROP FUNCTION app.use_right_balance_guard();
