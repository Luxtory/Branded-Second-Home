-- migrate:up
-- W4.2 (ADR-0019 §4; `01` v10.2 BR-034; `03` v3.15 §3.1; spec catalog §17.4): a média projetada de investimento
-- substitui o valor de referência da Edition. Não é renomeação: o valor de referência tinha base por modalidade
-- (Owner/Ação) e série por base; a média projetada é a ordem de grandeza do investimento total projetado para
-- materializar uma Second Home da Home Edition — uma vigente por Home Edition, sem modalidade, base, configuração ou
-- Ação, nunca preço nem condição, registrada pela Luxtory e nunca calculada (TECH-033: `bigint` + moeda).

-- Precondição fail-closed: nenhum valor de referência pode ser descartado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.edition_reference_value) THEN
    RAISE EXCEPTION 'W4.2 precondition: edition_reference_value has rows; they would be dropped'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- Nada referencia a tabela; os gatilhos, as policies e os grants saem com ela (sem CASCADE).
DROP TABLE app.edition_reference_value;
DROP FUNCTION app.edition_reference_value_guard();

CREATE TABLE app.home_edition_projected_investment (
  id uuid PRIMARY KEY,
  home_edition_id uuid NOT NULL REFERENCES app.home_edition (id),
  amount_minor bigint NOT NULL
    CONSTRAINT home_edition_projected_investment_amount_minor_check CHECK (amount_minor BETWEEN 1 AND 1000000000000000),
  currency text NOT NULL CONSTRAINT home_edition_projected_investment_currency_check CHECK (currency IN ('BRL')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  registered_by_user_id uuid NOT NULL,
  registered_role app.actor_role NOT NULL
    CONSTRAINT home_edition_projected_investment_registered_role_check CHECK (registered_role IN ('admin', 'super_admin')),
  operation_id uuid NOT NULL UNIQUE REFERENCES app.operation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT home_edition_projected_investment_period_check CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX home_edition_projected_investment_home_edition_idx
  ON app.home_edition_projected_investment (home_edition_id, valid_from);

-- Só inserção; a única mudança é encerrar a vigência uma vez. Uma vigente por Home Edition: vigências da mesma Home
-- Edition nunca se sobrepõem, em qualquer moeda. Os commands serializam pela trava da Brand Partner (ADR-0010 §8); o
-- gatilho barra a sobreposição em qualquer caminho.
CREATE FUNCTION app.home_edition_projected_investment_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.valid_until IS NOT NULL
          OR NEW.valid_until IS NULL
          OR (to_jsonb(NEW) - 'valid_until') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_until'))
  THEN
    RAISE EXCEPTION 'app.home_edition_projected_investment: only a single end of validity can change a row'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM app.home_edition_projected_investment AS other
       WHERE other.home_edition_id = NEW.home_edition_id
         AND other.id <> NEW.id
         AND tstzrange(other.valid_from, other.valid_until) && tstzrange(NEW.valid_from, NEW.valid_until)
     )
  THEN
    RAISE EXCEPTION 'app.home_edition_projected_investment: validity overlaps another value of the same Home Edition'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'home_edition_projected_investment_overlap';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER home_edition_projected_investment_guard
  BEFORE INSERT OR UPDATE ON app.home_edition_projected_investment
  FOR EACH ROW EXECUTE FUNCTION app.home_edition_projected_investment_guard();
CREATE TRIGGER home_edition_projected_investment_no_delete BEFORE DELETE ON app.home_edition_projected_investment
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER home_edition_projected_investment_no_truncate BEFORE TRUNCATE ON app.home_edition_projected_investment
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

ALTER TABLE app.home_edition_projected_investment ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_edition_projected_investment_app_read ON app.home_edition_projected_investment
  FOR SELECT TO luxtory_app USING (true);
CREATE POLICY home_edition_projected_investment_app_insert ON app.home_edition_projected_investment
  FOR INSERT TO luxtory_app WITH CHECK (true);
CREATE POLICY home_edition_projected_investment_app_update ON app.home_edition_projected_investment
  FOR UPDATE TO luxtory_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON app.home_edition_projected_investment TO luxtory_app;
GRANT UPDATE (valid_until) ON app.home_edition_projected_investment TO luxtory_app;

-- Leitura pública (spec catalog §17.7): só a vigente agora, de Home Edition pública — a subconsulta lê como `anon` e
-- herda a policy pública da Home Edition (visível e de Home Concept público).
GRANT SELECT (id, home_edition_id, amount_minor, currency, valid_from, valid_until)
  ON app.home_edition_projected_investment TO anon;
CREATE POLICY home_edition_projected_investment_public_read ON app.home_edition_projected_investment
  FOR SELECT TO anon
  USING (
    valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
    AND EXISTS (SELECT 1 FROM app.home_edition AS home_edition WHERE home_edition.id = home_edition_id)
  );

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.home_edition_projected_investment) THEN
    RAISE EXCEPTION 'W4.2 rollback precondition: home_edition_projected_investment has rows; they would be dropped'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

DROP TABLE app.home_edition_projected_investment;
DROP FUNCTION app.home_edition_projected_investment_guard();

-- Recria o valor de referência como estava (migrations catalog_edition_reference_value e
-- catalog_collection_public_read), sobre a tabela da Home Edition, que a migration catalog_home_edition devolve a
-- `edition` no próprio rollback.
CREATE TABLE app.edition_reference_value (
  id uuid PRIMARY KEY,
  edition_id uuid NOT NULL REFERENCES app.home_edition (id),
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

GRANT SELECT (id, edition_id, basis, amount_minor, currency, valid_from, valid_until)
  ON app.edition_reference_value TO anon;
CREATE POLICY edition_reference_value_public_read ON app.edition_reference_value FOR SELECT TO anon
  USING (
    valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
    AND EXISTS (SELECT 1 FROM app.home_edition AS edition WHERE edition.id = edition_id)
  );
