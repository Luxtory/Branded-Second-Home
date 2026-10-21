-- migrate:up
-- D-W3-1 (ADR-0010 §3, spec catalog): a autorização do Investor ganha o vínculo com a `party` do Investor, sem
-- reescrever registros. Production tinha 0 autorizações (auditoria de 2026-10-21): não há legado nem backfill, então a
-- coluna nasce `NOT NULL` — nova autorização só com party existente. Se um ambiente tiver uma autorização anterior, a
-- migration falha fechada em vez de aceitar vínculo nulo.
ALTER TABLE app.investor_authorization
  ADD COLUMN party_id uuid NOT NULL REFERENCES app.party (id);

CREATE INDEX investor_authorization_party_idx ON app.investor_authorization (party_id);

-- migrate:down
DROP INDEX app.investor_authorization_party_idx;
ALTER TABLE app.investor_authorization DROP COLUMN party_id;
