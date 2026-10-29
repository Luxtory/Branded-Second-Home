-- migrate:up
-- W9 (ADR-0022, spec platform W9): agendamento de entrega do outbox. Nulo = imediato; linhas e produtores anteriores
-- ficam inalterados. A coluna não muda depois de gravada (luxtory_app só atualiza attempts/last_error/delivered_at).
ALTER TABLE app.outbox ADD COLUMN available_at timestamptz;
ALTER TABLE app.outbox ADD CONSTRAINT outbox_available_after_occurrence
  CHECK (available_at IS NULL OR available_at >= occurred_at);
-- Seleção por tentativas: falhas recorrentes cedem a vez a eventos independentes.
CREATE INDEX outbox_pending_attempts_idx ON app.outbox (attempts, occurred_at, id) WHERE delivered_at IS NULL;


-- migrate:down
-- Never drop the schedule of an event still waiting for delivery.
LOCK TABLE app.outbox IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.outbox WHERE available_at IS NOT NULL AND delivered_at IS NULL) THEN
    RAISE EXCEPTION 'W9 rollback would discard scheduled outbox events';
  END IF;
END $$;
DROP INDEX app.outbox_pending_attempts_idx;
ALTER TABLE app.outbox DROP CONSTRAINT outbox_available_after_occurrence;
ALTER TABLE app.outbox DROP COLUMN available_at;
