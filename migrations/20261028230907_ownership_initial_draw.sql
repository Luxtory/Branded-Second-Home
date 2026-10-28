-- migrate:up
-- W9 (spec ownership §16, ADR-0022, TECH-093): sorteio da ordem inicial. Só inserção. O banco impõe a anterioridade do
-- compromisso no COMMIT efetivo, a revelação só depois da rodada e o resultado como permutação dos participantes.
CREATE TABLE app.initial_draw (
  id uuid PRIMARY KEY,
  acquisition_id uuid NOT NULL UNIQUE,
  second_home_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  source_event_id uuid NOT NULL UNIQUE REFERENCES app.outbox (id),
  algorithm text NOT NULL CHECK (algorithm = 'fy-v1'),
  beacon_chain_hash text NOT NULL
    CHECK (beacon_chain_hash = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'),
  participant_count smallint NOT NULL CHECK (participant_count IN (2, 4, 8, 10)),
  commitment bytea NOT NULL CHECK (octet_length(commitment) = 32),
  target_round bigint NOT NULL CHECK (target_round >= 1),
  target_round_at timestamptz NOT NULL,
  -- Instantes carimbados pelo próprio banco (gatilhos), nunca pela aplicação.
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  commit_deadline timestamptz NOT NULL,
  -- t(R) = genesis + (R − 1) × período da drand quicknet.
  CONSTRAINT initial_draw_round_time CHECK (target_round_at = to_timestamp(1692803367 + (target_round - 1) * 3)),
  CONSTRAINT initial_draw_commit_window CHECK (recorded_at < commit_deadline AND commit_deadline < target_round_at),
  CONSTRAINT initial_draw_acquisition FOREIGN KEY (acquisition_id, second_home_id, operation_id)
    REFERENCES app.acquisition (id, second_home_id, operation_id),
  UNIQUE (id, acquisition_id, second_home_id)
);

CREATE TABLE app.initial_draw_participant (
  draw_id uuid NOT NULL,
  acquisition_id uuid NOT NULL,
  second_home_id uuid NOT NULL,
  -- Ordem determinística do TECH-093 passo 1: a allocation_position técnica da Ação.
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  stake_id uuid NOT NULL,
  PRIMARY KEY (draw_id, ordinal),
  CONSTRAINT conflict_initial_draw_participant_stake UNIQUE (draw_id, stake_id),
  CONSTRAINT initial_draw_participant_draw FOREIGN KEY (draw_id, acquisition_id, second_home_id)
    REFERENCES app.initial_draw (id, acquisition_id, second_home_id),
  CONSTRAINT initial_draw_participant_stake FOREIGN KEY (stake_id, second_home_id, acquisition_id)
    REFERENCES app.stake (id, second_home_id, acquisition_id)
);

CREATE TABLE app.initial_draw_seed (
  draw_id uuid PRIMARY KEY REFERENCES app.initial_draw (id),
  seed bytea NOT NULL CHECK (octet_length(seed) = 32)
);

CREATE TABLE app.initial_draw_reveal (
  draw_id uuid PRIMARY KEY REFERENCES app.initial_draw (id),
  beacon_round bigint NOT NULL,
  beacon_signature bytea NOT NULL CHECK (octet_length(beacon_signature) = 48),
  beacon_randomness bytea NOT NULL CHECK (octet_length(beacon_randomness) = 32),
  revealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_event_id uuid NOT NULL UNIQUE REFERENCES app.outbox (id),
  CONSTRAINT initial_draw_reveal_randomness CHECK (beacon_randomness = sha256(beacon_signature))
);

CREATE TABLE app.initial_draw_position (
  draw_id uuid NOT NULL REFERENCES app.initial_draw_reveal (draw_id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  stake_id uuid NOT NULL,
  PRIMARY KEY (draw_id, position),
  CONSTRAINT conflict_initial_draw_position_stake UNIQUE (draw_id, stake_id),
  CONSTRAINT initial_draw_position_participant FOREIGN KEY (draw_id, stake_id)
    REFERENCES app.initial_draw_participant (draw_id, stake_id)
);

-- Compromisso: Co-Owner com N da configuração, instante carimbado pelo banco, prazo ainda aberto e
-- transaction_timeout armado (salvaguarda que libera conexão e locks).
CREATE FUNCTION app.initial_draw_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.acquisition;
BEGIN
  SELECT * INTO a FROM app.acquisition WHERE id = NEW.acquisition_id;
  IF a.modality IS DISTINCT FROM 'co_owner' OR a.configuration_id IS DISTINCT FROM NEW.participant_count THEN
    RAISE EXCEPTION 'initial draw requires a Co-Owner acquisition with its configured N'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_co_owner';
  END IF;
  NEW.recorded_at := clock_timestamp();
  IF NEW.recorded_at >= NEW.commit_deadline THEN
    RAISE EXCEPTION 'initial draw commit deadline already passed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_deadline';
  END IF;
  IF current_setting('transaction_timeout') IN ('0', '0ms') THEN
    RAISE EXCEPTION 'initial draw requires transaction_timeout armed in its transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_transaction_timeout';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_before_insert() FROM PUBLIC;

-- No COMMIT efetivo: prazo, exatamente as N Ações na ordem de allocation_position e SHA-256(seed) = commitment.
CREATE FUNCTION app.initial_draw_commit_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE d app.initial_draw;
BEGIN
  SELECT * INTO d FROM app.initial_draw WHERE id = NEW.id;
  IF clock_timestamp() > d.commit_deadline THEN
    RAISE EXCEPTION 'initial draw commit deadline exceeded at commit'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_deadline';
  END IF;
  IF (SELECT count(*) FROM app.initial_draw_participant p WHERE p.draw_id = d.id) <> d.participant_count
     OR (SELECT count(*) FROM app.stake s WHERE s.acquisition_id = d.acquisition_id) <> d.participant_count
     OR EXISTS (SELECT 1 FROM app.stake s WHERE s.acquisition_id = d.acquisition_id AND NOT EXISTS (
       SELECT 1 FROM app.initial_draw_participant p
       WHERE p.draw_id = d.id AND p.stake_id = s.id AND p.ordinal = s.allocation_position)) THEN
    RAISE EXCEPTION 'initial draw participants must be every stake in allocation order'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_participants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.initial_draw_seed s WHERE s.draw_id = d.id AND sha256(s.seed) = d.commitment) THEN
    RAISE EXCEPTION 'initial draw seed must match its commitment'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_seed_commitment';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_commit_constraint() FROM PUBLIC;

-- Participante e posição chegam com o seu sorteio: ordinal = allocation_position e posição até N.
CREATE FUNCTION app.initial_draw_member_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_count smallint;
BEGIN
  SELECT participant_count INTO v_count FROM app.initial_draw WHERE id = NEW.draw_id;
  IF TG_TABLE_NAME = 'initial_draw_participant' THEN
    IF NOT EXISTS (SELECT 1 FROM app.stake s WHERE s.id = NEW.stake_id AND s.allocation_position = NEW.ordinal) THEN
      RAISE EXCEPTION 'initial draw participant ordinal must be the stake allocation position'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_participants';
    END IF;
  ELSIF NEW.position > v_count THEN
    RAISE EXCEPTION 'initial draw position beyond its participants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_permutation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_member_before_insert() FROM PUBLIC;

-- Revelação: só na rodada fixada, depois de t(R), com o instante carimbado pelo banco.
CREATE FUNCTION app.initial_draw_reveal_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE d app.initial_draw;
BEGIN
  SELECT * INTO d FROM app.initial_draw WHERE id = NEW.draw_id;
  IF NEW.beacon_round IS DISTINCT FROM d.target_round THEN
    RAISE EXCEPTION 'initial draw reveal must use its target round'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_reveal_round';
  END IF;
  NEW.revealed_at := clock_timestamp();
  IF NEW.revealed_at < d.target_round_at THEN
    RAISE EXCEPTION 'initial draw cannot be revealed before its round'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_reveal_time';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_reveal_before_insert() FROM PUBLIC;

-- No COMMIT: a revelação traz a permutação completa dos participantes.
CREATE FUNCTION app.initial_draw_reveal_constraint() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM app.initial_draw_position p WHERE p.draw_id = NEW.draw_id)
     <> (SELECT participant_count FROM app.initial_draw WHERE id = NEW.draw_id) THEN
    RAISE EXCEPTION 'initial draw result must be a full permutation of its participants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_permutation';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_reveal_constraint() FROM PUBLIC;

CREATE TRIGGER initial_draw_before_insert BEFORE INSERT ON app.initial_draw
  FOR EACH ROW EXECUTE FUNCTION app.initial_draw_before_insert();
CREATE CONSTRAINT TRIGGER initial_draw_commit_constraint AFTER INSERT ON app.initial_draw
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.initial_draw_commit_constraint();
CREATE TRIGGER initial_draw_participant_before_insert BEFORE INSERT ON app.initial_draw_participant
  FOR EACH ROW EXECUTE FUNCTION app.initial_draw_member_before_insert();
CREATE TRIGGER initial_draw_position_before_insert BEFORE INSERT ON app.initial_draw_position
  FOR EACH ROW EXECUTE FUNCTION app.initial_draw_member_before_insert();
CREATE TRIGGER initial_draw_reveal_before_insert BEFORE INSERT ON app.initial_draw_reveal
  FOR EACH ROW EXECUTE FUNCTION app.initial_draw_reveal_before_insert();
CREATE CONSTRAINT TRIGGER initial_draw_reveal_constraint AFTER INSERT ON app.initial_draw_reveal
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.initial_draw_reveal_constraint();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['initial_draw','initial_draw_participant','initial_draw_seed','initial_draw_reveal',
      'initial_draw_position'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.forbid_change()', v_table || '_no_change', v_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change()', v_table || '_no_truncate', v_table);
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO luxtory_app USING (true)', v_table || '_app_read', v_table);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO luxtory_app WITH CHECK (true)', v_table || '_app_insert', v_table);
    EXECUTE format('GRANT SELECT, INSERT ON app.%I TO luxtory_app', v_table);
  END LOOP;
END $$;

-- Titular (TECH-052): titular vigente da Second Home lê o sorteio por coluna; seed só depois da revelação. Sem
-- operation_id, eventos de origem ou pessoas e empresas de outros Co-Owners.
GRANT SELECT (id, second_home_id, algorithm, beacon_chain_hash, participant_count, commitment, target_round,
  target_round_at, recorded_at, commit_deadline) ON app.initial_draw TO authenticated;
CREATE POLICY initial_draw_holder_read ON app.initial_draw FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.holding h WHERE h.second_home_id = initial_draw.second_home_id)
);
GRANT SELECT (draw_id, ordinal, stake_id) ON app.initial_draw_participant TO authenticated;
CREATE POLICY initial_draw_participant_holder_read ON app.initial_draw_participant FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.initial_draw d WHERE d.id = initial_draw_participant.draw_id)
);
GRANT SELECT (draw_id, beacon_round, beacon_signature, beacon_randomness, revealed_at)
  ON app.initial_draw_reveal TO authenticated;
CREATE POLICY initial_draw_reveal_holder_read ON app.initial_draw_reveal FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.initial_draw d WHERE d.id = initial_draw_reveal.draw_id)
);
GRANT SELECT (draw_id, seed) ON app.initial_draw_seed TO authenticated;
CREATE POLICY initial_draw_seed_holder_read ON app.initial_draw_seed FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.initial_draw_reveal r WHERE r.draw_id = initial_draw_seed.draw_id)
);
GRANT SELECT (draw_id, position, stake_id) ON app.initial_draw_position TO authenticated;
CREATE POLICY initial_draw_position_holder_read ON app.initial_draw_position FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM app.initial_draw_reveal r WHERE r.draw_id = initial_draw_position.draw_id)
);


-- migrate:down
-- Never discard a draw commitment, reveal or result on rollback.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['initial_draw','initial_draw_participant','initial_draw_seed','initial_draw_reveal',
      'initial_draw_position'] LOOP
    EXECUTE format('LOCK TABLE app.%I IN ACCESS EXCLUSIVE MODE', v_table);
  END LOOP;
  IF EXISTS (SELECT 1 FROM app.initial_draw) THEN
    RAISE EXCEPTION 'W9 rollback would discard initial draw facts';
  END IF;
END $$;
-- The seed and position read policies reference the reveal: drop them first.
DROP TABLE app.initial_draw_position;
DROP TABLE app.initial_draw_seed;
DROP TABLE app.initial_draw_reveal;
DROP TABLE app.initial_draw_participant;
DROP TABLE app.initial_draw;
DROP FUNCTION app.initial_draw_reveal_constraint();
DROP FUNCTION app.initial_draw_reveal_before_insert();
DROP FUNCTION app.initial_draw_member_before_insert();
DROP FUNCTION app.initial_draw_commit_constraint();
DROP FUNCTION app.initial_draw_before_insert();
