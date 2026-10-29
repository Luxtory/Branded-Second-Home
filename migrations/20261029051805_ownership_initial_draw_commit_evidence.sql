-- migrate:up
-- T-910 (spec ownership §16.8, ADR-0023): a revelação exige o carimbo de COMMIT registrado pelo servidor
-- (track_commit_timestamp) para o compromisso, capturado numa evidência imutável calculada pelo próprio banco. Recusa
-- segura com a configuração desligada ou o carimbo indisponível. As migrations da W9 permanecem inalteradas.
CREATE FUNCTION app.require_server_commit_timestamps() RETURNS void
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('track_commit_timestamp') <> 'on' THEN
    RAISE EXCEPTION 'initial draw requires track_commit_timestamp enabled on the server'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_timestamp';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_server_commit_timestamps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_server_commit_timestamps() TO luxtory_app;

-- Compromisso: sem carimbo de COMMIT no servidor, nenhum compromisso nasce (nunca ficaria revelável).
CREATE OR REPLACE FUNCTION app.initial_draw_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE a app.acquisition;
BEGIN
  PERFORM app.require_server_commit_timestamps();
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

-- Evidência do COMMIT: o instante é sempre o registrado pelo servidor para a transação do compromisso, nunca o da
-- aplicação. Só existe para compromissos comitados até o prazo; capturada antes de o carimbo poder ser descartado pela
-- manutenção do servidor, torna a revelação independente da retenção dos carimbos.
CREATE TABLE app.initial_draw_commit_evidence (
  draw_id uuid PRIMARY KEY REFERENCES app.initial_draw (id),
  committed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION app.initial_draw_commit_evidence_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_xmin xid; v_deadline timestamptz; v_committed timestamptz;
BEGIN
  PERFORM app.require_server_commit_timestamps();
  SELECT d.xmin, d.commit_deadline INTO v_xmin, v_deadline FROM app.initial_draw d WHERE d.id = NEW.draw_id;
  IF NOT FOUND THEN RETURN NEW; END IF; -- a chave estrangeira recusa
  v_committed := pg_catalog.pg_xact_commit_timestamp(v_xmin);
  IF v_committed IS NULL THEN
    RAISE EXCEPTION 'initial draw commit timestamp is unavailable'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_timestamp';
  END IF;
  IF v_committed > v_deadline THEN
    RAISE EXCEPTION 'initial draw commitment was committed after its deadline'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_deadline';
  END IF;
  NEW.committed_at := v_committed;
  NEW.recorded_at := clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.initial_draw_commit_evidence_before_insert() FROM PUBLIC;

CREATE TRIGGER initial_draw_commit_evidence_before_insert BEFORE INSERT ON app.initial_draw_commit_evidence
  FOR EACH ROW EXECUTE FUNCTION app.initial_draw_commit_evidence_before_insert();
CREATE TRIGGER initial_draw_commit_evidence_no_change BEFORE UPDATE OR DELETE ON app.initial_draw_commit_evidence
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER initial_draw_commit_evidence_no_truncate BEFORE TRUNCATE ON app.initial_draw_commit_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
ALTER TABLE app.initial_draw_commit_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY initial_draw_commit_evidence_app_read ON app.initial_draw_commit_evidence
  FOR SELECT TO luxtory_app USING (true);
CREATE POLICY initial_draw_commit_evidence_app_insert ON app.initial_draw_commit_evidence
  FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.initial_draw_commit_evidence TO luxtory_app;

-- Revelação: só com a evidência do COMMIT do compromisso (gatilho não diferível; a aplicação não o desativa).
CREATE OR REPLACE FUNCTION app.initial_draw_reveal_before_insert() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE d app.initial_draw;
BEGIN
  SELECT * INTO d FROM app.initial_draw WHERE id = NEW.draw_id;
  IF NOT EXISTS (SELECT 1 FROM app.initial_draw_commit_evidence e WHERE e.draw_id = NEW.draw_id) THEN
    RAISE EXCEPTION 'initial draw reveal requires server commit evidence'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'initial_draw_commit_timestamp';
  END IF;
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


-- migrate:down
-- Never weaken the reveal guard while a draw or its commit evidence exists.
DO $$
BEGIN
  LOCK TABLE app.initial_draw, app.initial_draw_commit_evidence, app.initial_draw_reveal IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.initial_draw) OR EXISTS (SELECT 1 FROM app.initial_draw_commit_evidence) THEN
    RAISE EXCEPTION 'T-910 rollback would weaken the initial draw commit evidence guard';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION app.initial_draw_reveal_before_insert() RETURNS trigger
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
DROP TABLE app.initial_draw_commit_evidence;
DROP FUNCTION app.initial_draw_commit_evidence_before_insert();
CREATE OR REPLACE FUNCTION app.initial_draw_before_insert() RETURNS trigger
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
DROP FUNCTION app.require_server_commit_timestamps();
