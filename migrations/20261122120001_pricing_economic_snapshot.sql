-- migrate:up
-- W17 (TECH-031, TECH-052; ADR-0032 §8, ADR-0033 §4; spec pricing §13, spec credits §5.1): snapshot econômico
-- persistido. Nasce com o primeiro efeito econômico que usa um valor versionado — a originação de Créditos (validade do
-- Crédito originado) — e é gravado na mesma transação do efeito. Um snapshot por operação: o instante de resolução dos
-- termos (`EconomicTerms`, W16) e uma linha por parâmetro usado, com FK para a versão imutável de `app.parameter`; o
-- valor é lido pela FK, sem cópia. As noites de PRL entram na W20, com o primeiro consumidor de PRL (nenhuma tabela sem
-- consumidor). Sem UPDATE nem DELETE (TECH-052).
CREATE TABLE app.economic_snapshot (
  operation_id uuid PRIMARY KEY REFERENCES app.operation(id),
  -- Instante em que os termos foram resolvidos (lido do banco pelo resolvedor, depois das travas): aceito só dentro da
  -- transação corrente.
  resolved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.economic_snapshot_parameter (
  operation_id uuid NOT NULL REFERENCES app.economic_snapshot(operation_id),
  parameter_key text NOT NULL,
  parameter_id uuid NOT NULL REFERENCES app.parameter(id),
  PRIMARY KEY (operation_id, parameter_key),
  -- As seis chaves econômicas globais da W16 (ADR-0032 §6); `guest_rules` não forma operação econômica.
  CONSTRAINT economic_snapshot_parameter_key_check CHECK (parameter_key IN (
    'credit_multiplier', 'credit_validity_months', 'luxchange_fee_rate', 'luxchange_fee_minimum',
    'request_deadline_hours', 'membership_base_annual_price'
  ))
);
CREATE INDEX economic_snapshot_parameter_version_idx ON app.economic_snapshot_parameter (parameter_id);

-- O snapshot pertence à operação da transação corrente e o instante de resolução fica entre o início da transação e a
-- gravação: o servidor não escolhe um instante fora do próprio command.
CREATE FUNCTION app.economic_snapshot_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  IF NEW.resolved_at IS NULL OR NEW.resolved_at < now() OR NEW.resolved_at > v_now THEN
    RAISE EXCEPTION 'the economic terms are resolved inside the transaction of the operation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_instant';
  END IF;
  NEW.created_at := v_now;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.economic_snapshot_write() FROM PUBLIC;
CREATE TRIGGER economic_snapshot_write BEFORE INSERT ON app.economic_snapshot
  FOR EACH ROW EXECUTE FUNCTION app.economic_snapshot_write();

-- Cada parâmetro aponta para a versão global da própria chave vigente no instante de resolução (TECH-030/031): nenhuma
-- versão futura, superada ou de outra chave entra no snapshot.
CREATE FUNCTION app.economic_snapshot_parameter_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_resolved_at timestamptz; v_in_force uuid;
BEGIN
  PERFORM app.assert_operation_in_transaction(NEW.operation_id);
  SELECT s.resolved_at INTO STRICT v_resolved_at FROM app.economic_snapshot s WHERE s.operation_id = NEW.operation_id;
  SELECT v.id INTO v_in_force FROM app.parameter_at(NEW.parameter_key, NULL, v_resolved_at) v;
  IF v_in_force IS DISTINCT FROM NEW.parameter_id THEN
    RAISE EXCEPTION 'the snapshot records the global version in force when the terms were resolved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'economic_snapshot_parameter_version';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.economic_snapshot_parameter_write() FROM PUBLIC;
CREATE TRIGGER economic_snapshot_parameter_write BEFORE INSERT ON app.economic_snapshot_parameter
  FOR EACH ROW EXECUTE FUNCTION app.economic_snapshot_parameter_write();

CREATE TRIGGER economic_snapshot_no_update BEFORE UPDATE ON app.economic_snapshot
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_no_delete BEFORE DELETE ON app.economic_snapshot
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_no_truncate BEFORE TRUNCATE ON app.economic_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_parameter_no_update BEFORE UPDATE ON app.economic_snapshot_parameter
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_parameter_no_delete BEFORE DELETE ON app.economic_snapshot_parameter
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER economic_snapshot_parameter_no_truncate BEFORE TRUNCATE ON app.economic_snapshot_parameter
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- Só o servidor lê e grava (TECH-052); nenhuma leitura pelo Titular ou anônimo.
ALTER TABLE app.economic_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.economic_snapshot_parameter ENABLE ROW LEVEL SECURITY;
CREATE POLICY economic_snapshot_app_read ON app.economic_snapshot FOR SELECT TO luxtory_app USING (true);
CREATE POLICY economic_snapshot_app_insert ON app.economic_snapshot FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY economic_snapshot_parameter_app_read ON app.economic_snapshot_parameter
  FOR SELECT TO luxtory_app USING (true);
CREATE POLICY economic_snapshot_parameter_app_insert ON app.economic_snapshot_parameter
  FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT ON app.economic_snapshot, app.economic_snapshot_parameter TO luxtory_app;
GRANT INSERT (operation_id, resolved_at) ON app.economic_snapshot TO luxtory_app;
GRANT INSERT (operation_id, parameter_key, parameter_id) ON app.economic_snapshot_parameter TO luxtory_app;


-- migrate:down
-- Snapshot nunca é descartado por rollback (TECH-052): com qualquer linha, a reversão é recusada. A trava exclusiva espera
-- gravações em curso e barra as novas. Sem linhas (banco vazio do `db:check`), desfaz tudo.
DO $$
BEGIN
  LOCK TABLE app.economic_snapshot, app.economic_snapshot_parameter IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM app.economic_snapshot) OR EXISTS (SELECT 1 FROM app.economic_snapshot_parameter) THEN
    RAISE EXCEPTION 'W17 rollback would discard economic snapshots';
  END IF;
END $$;
DROP TABLE app.economic_snapshot_parameter;
DROP TABLE app.economic_snapshot;
DROP FUNCTION app.economic_snapshot_parameter_write();
DROP FUNCTION app.economic_snapshot_write();
