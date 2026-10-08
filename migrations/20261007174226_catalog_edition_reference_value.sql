-- migrate:up
-- Valor de referência da Edition, versionado (Wave 4.1; spec catalog §13.12): registrado pela Luxtory, nunca calculado
-- (BR-031, REQ-094); dinheiro em unidades menores `bigint` + moeda (TECH-033). Base `owner` = a Second Home inteira,
-- `acao` = uma Ação Co-Owner — nunca valor por dia (REQ-100). Só inserção; a única mudança é encerrar a vigência uma
-- vez (`valid_until` de nulo a preenchido). Sem vigências sobrepostas por série (Edition + base + moeda). Os commands
-- serializam pela trava da Brand Partner (ADR-0010 §8); o gatilho barra a sobreposição em qualquer caminho.
CREATE TABLE app.edition_reference_value (
  id uuid PRIMARY KEY,
  edition_id uuid NOT NULL REFERENCES app.edition (id),
  basis text NOT NULL CHECK (basis IN ('owner', 'acao')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000000000),
  currency text NOT NULL CHECK (currency IN ('BRL')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  registered_by_user_id uuid NOT NULL,
  registered_role app.actor_role NOT NULL CHECK (registered_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT edition_reference_value_period_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX edition_reference_value_edition_idx ON app.edition_reference_value (edition_id, basis, currency, valid_from);

CREATE FUNCTION app.edition_reference_value_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.valid_until IS NOT NULL
          OR NEW.valid_until IS NULL
          OR (to_jsonb(NEW) - 'valid_until') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_until'))
  THEN
    RAISE EXCEPTION 'app.edition_reference_value: only a single end of validity can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM app.edition_reference_value AS other
       WHERE other.edition_id = NEW.edition_id
         AND other.basis = NEW.basis
         AND other.currency = NEW.currency
         AND other.id <> NEW.id
         AND tstzrange(other.valid_from, other.valid_until) && tstzrange(NEW.valid_from, NEW.valid_until)
     )
  THEN
    RAISE EXCEPTION 'app.edition_reference_value: validity overlaps another value of the same Edition, basis and currency'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER edition_reference_value_guard BEFORE INSERT OR UPDATE ON app.edition_reference_value
  FOR EACH ROW EXECUTE FUNCTION app.edition_reference_value_guard();
CREATE TRIGGER edition_reference_value_no_delete BEFORE DELETE ON app.edition_reference_value
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER edition_reference_value_no_truncate BEFORE TRUNCATE ON app.edition_reference_value
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.edition_reference_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY edition_reference_value_app_read ON app.edition_reference_value FOR SELECT TO luxtory_app
  USING (true);
CREATE POLICY edition_reference_value_app_insert ON app.edition_reference_value FOR INSERT TO luxtory_app
  WITH CHECK (true);
CREATE POLICY edition_reference_value_app_update ON app.edition_reference_value FOR UPDATE TO luxtory_app
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.edition_reference_value TO luxtory_app;
GRANT UPDATE (valid_until) ON app.edition_reference_value TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.edition_reference_value FROM luxtory_app;
DROP TABLE app.edition_reference_value;
DROP FUNCTION app.edition_reference_value_guard();
