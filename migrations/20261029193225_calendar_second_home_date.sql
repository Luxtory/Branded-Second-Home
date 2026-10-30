-- migrate:up
-- W10 (ADR-003 do 03; TECH-021, TECH-040, TECH-041): noite selada da Second Home. Só o command `open_exercise` sela,
-- com a custódia raiz na mesma transação (conferida no COMMIT pela migration seguinte). Noite selada nunca é
-- reclassificada, alterada ou apagada. Spec: docs/specs/calendar.md §5; ADR-0024.

-- PD-003/TECH-041: janela de Carnaval com o mesmo algoritmo do calendário civil da W8 (src/features/calendar). O
-- TypeScript continua produzindo a classificação; o banco só a confere, e o teste db compara as duas implementações
-- em todos os anos aceitos (1–9999), sem divergência possível.
CREATE FUNCTION app.carnival_dates(p_year integer) RETURNS date[]
  LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
DECLARE
  a integer := p_year % 19;
  b integer := p_year / 100;
  c integer := p_year % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
  v_cursor date;
  v_dates date[] := '{}';
BEGIN
  IF p_year < 1 OR p_year > 9999 THEN
    RAISE EXCEPTION 'invalid civil exercise year %', p_year USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Páscoa gregoriana (Meeus/Jones/Butcher); terça de Carnaval = Páscoa − 47; a sexta anterior, mais quatro dias antes.
  v_cursor := make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1) - 51;
  IF extract(month FROM v_cursor) = 1 THEN
    v_cursor := make_date(p_year, 2, 1);
  END IF;
  WHILE cardinality(v_dates) < 10 LOOP
    IF extract(month FROM v_cursor) NOT IN (1, 7, 12)
       AND NOT (extract(month FROM v_cursor) = 2 AND extract(day FROM v_cursor) = 29) THEN
      v_dates := v_dates || v_cursor;
    END IF;
    v_cursor := v_cursor + 1;
  END LOOP;
  RETURN v_dates;
END $$;

-- Janeiro, julho, dezembro e a janela de Carnaval são Alta/Super Alta; o resto (inclusive 29/02) é Média/Baixa.
CREATE FUNCTION app.canonical_season(p_date date) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = ''
AS $$
  SELECT CASE
    WHEN extract(month FROM p_date) IN (1, 7, 12) THEN 'alta'
    WHEN extract(month FROM p_date) IN (2, 3)
      AND p_date = ANY (app.carnival_dates(extract(year FROM p_date)::integer)) THEN 'alta'
    ELSE 'media'
  END
$$;

CREATE TABLE app.second_home_date (
  second_home_id uuid NOT NULL REFERENCES app.second_home(id),
  stay_date date NOT NULL CHECK (stay_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  exercise_year integer GENERATED ALWAYS AS (extract(year FROM stay_date)::integer) STORED,
  season text NOT NULL,
  is_leap_day boolean GENERATED ALWAYS AS (
    extract(month FROM stay_date) = 2 AND extract(day FROM stay_date) = 29
  ) STORED,
  checkin_at timestamptz NOT NULL,
  -- Carimbado pelo banco no gatilho de selagem (instante da transação): o valor enviado pela aplicação nunca prevalece.
  sealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (second_home_id, stay_date),
  CONSTRAINT second_home_date_season_check CHECK (season IN ('alta', 'media')),
  -- Divergência entre a classificação do TypeScript e a do banco falha fechada.
  CONSTRAINT second_home_date_season_canonical CHECK (season = app.canonical_season(stay_date))
);

-- Selagem só de Second Home formalizada, a partir da data-base, com o check-in das 14:00 locais conferido pelas regras
-- de fuso do banco (TECH-040): Node e PostgreSQL discordando, a selagem falha fechada e o job alerta.
CREATE FUNCTION app.second_home_date_seal() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_start date; v_timezone text;
BEGIN
  SELECT a.operation_start_date, h.timezone INTO v_start, v_timezone
    FROM app.acquisition a JOIN app.second_home h ON h.id = a.second_home_id
   WHERE a.second_home_id = NEW.second_home_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only a formalized Second Home has sealed nights'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_night_formalized';
  END IF;
  IF NEW.stay_date < v_start THEN
    RAISE EXCEPTION 'nights before the operation base date are never sealed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_night_after_operation_start';
  END IF;
  -- Horizonte (TECH-042; ADR-0024 §1): só o exercício corrente e o seguinte pela data local do servidor, com um dia de
  -- tolerância à diferença de relógio em cada ponta. Barra selagem antecipada (noites imutáveis com instantes fixados
  -- pelas regras de fuso de hoje, volume sem limite) e retroativa (exercício passado não tem noite utilizável; com
  -- data-base antiga, volume sem limite), inclusive por operação forjada. Gatilho BEFORE: a coluna gerada ainda não existe.
  IF extract(year FROM NEW.stay_date)
       NOT BETWEEN extract(year FROM (now() - interval '1 day') AT TIME ZONE v_timezone)
               AND extract(year FROM (now() + interval '1 day') AT TIME ZONE v_timezone) + 1 THEN
    RAISE EXCEPTION 'only the current and the next exercise can be sealed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_exercise_horizon';
  END IF;
  -- Instante da selagem carimbado pelo banco (como os carimbos do sorteio, ADR-0022): não é forjável pelo papel da
  -- aplicação.
  NEW.sealed_at := now();
  IF NEW.checkin_at IS DISTINCT FROM ((NEW.stay_date + time '14:00') AT TIME ZONE v_timezone) THEN
    RAISE EXCEPTION 'check-in instant disagrees with 14:00 local under the database time zone rules'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'second_home_date_checkin_local';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.second_home_date_seal() FROM PUBLIC;
CREATE TRIGGER second_home_date_seal BEFORE INSERT ON app.second_home_date
  FOR EACH ROW EXECUTE FUNCTION app.second_home_date_seal();

-- TECH-041: um exercício é selado inteiro — toda noite da primeira noite operacional até 31/12; no exercício completo,
-- 103 Alta/Super Alta + 262 Média/Baixa + 29/02 em ano bissexto.
CREATE FUNCTION app.second_home_date_exercise_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_start date; v_first date; v_last date;
  v_count integer; v_min date; v_max date; v_alta integer; v_media integer; v_leap integer;
BEGIN
  SELECT operation_start_date INTO STRICT v_start FROM app.acquisition WHERE second_home_id = NEW.second_home_id;
  v_first := greatest(make_date(NEW.exercise_year, 1, 1), v_start);
  v_last := make_date(NEW.exercise_year, 12, 31);
  SELECT count(*), min(stay_date), max(stay_date),
         count(*) FILTER (WHERE season = 'alta'),
         count(*) FILTER (WHERE season = 'media' AND NOT is_leap_day),
         count(*) FILTER (WHERE is_leap_day)
    INTO v_count, v_min, v_max, v_alta, v_media, v_leap
    FROM app.second_home_date
   WHERE second_home_id = NEW.second_home_id AND exercise_year = NEW.exercise_year;
  IF v_min IS DISTINCT FROM v_first OR v_max IS DISTINCT FROM v_last OR v_count <> v_last - v_first + 1 THEN
    RAISE EXCEPTION 'an exercise is sealed whole, from its first operational night to December 31'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_exercise_coverage';
  END IF;
  IF v_first = make_date(NEW.exercise_year, 1, 1)
     AND (v_alta <> 103 OR v_media <> 262 OR v_leap <> v_count - 365) THEN
    RAISE EXCEPTION 'a full exercise seals 103 high and 262 medium nights, plus February 29 in a leap year'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'custody_exercise_seasons';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.second_home_date_exercise_constraint() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER second_home_date_exercise_constraint AFTER INSERT ON app.second_home_date
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.second_home_date_exercise_constraint();

CREATE TRIGGER second_home_date_no_change BEFORE UPDATE OR DELETE ON app.second_home_date
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER second_home_date_no_truncate BEFORE TRUNCATE ON app.second_home_date
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

REVOKE ALL ON FUNCTION app.carnival_dates(integer), app.canonical_season(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.carnival_dates(integer), app.canonical_season(date) TO luxtory_app;

-- Escrita só no servidor (ADR-002 do 03); nenhuma leitura do Titular na W10.
ALTER TABLE app.second_home_date ENABLE ROW LEVEL SECURITY;
CREATE POLICY second_home_date_app_read ON app.second_home_date FOR SELECT TO luxtory_app USING (true);
CREATE POLICY second_home_date_app_insert ON app.second_home_date FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.second_home_date TO luxtory_app;


-- migrate:down
-- Nunca descarta noite selada: o rollback só é possível sem fatos (padrão da W8).
DO $$
BEGIN
  LOCK TABLE app.second_home_date IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.second_home_date) THEN
    RAISE EXCEPTION 'W10 rollback would discard facts in app.second_home_date';
  END IF;
END $$;
DROP TABLE app.second_home_date;
DROP FUNCTION app.second_home_date_exercise_constraint();
DROP FUNCTION app.second_home_date_seal();
DROP FUNCTION app.canonical_season(date);
DROP FUNCTION app.carnival_dates(integer);
