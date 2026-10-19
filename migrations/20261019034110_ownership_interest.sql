-- migrate:up
-- Manifestação de interesse (W5; `03` §3.1; spec ownership): Concept, Edition opcional, modalidade, região,
-- `approx_days` e origem. Preferência comercial: nunca gera Ação, Direito de Uso nem prerrogativa (REQ-023, REQ-025,
-- BR-060, BR-065) — nenhuma tabela referencia `interest`. `origin` e `partner_ref` são metadados declarados, sem FK e
-- sem enum (decisão do fundador, 2026-10-19). Textos chegam normalizados pela aplicação; os limites, em caracteres, são
-- técnicos. Só inserção; o instante vem do Clock da aplicação (TECH-110).
CREATE TABLE app.interest (
  id uuid PRIMARY KEY,
  concept_id uuid NOT NULL REFERENCES app.concept (id),
  edition_id uuid,
  modality text NOT NULL CHECK (modality IN ('owner', 'co_owner')),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 200 AND region = btrim(region)),
  approx_days integer CHECK (approx_days > 0),
  origin text CHECK (length(origin) BETWEEN 1 AND 200 AND origin = btrim(origin)),
  partner_ref text CHECK (length(partner_ref) BETWEEN 1 AND 200 AND partner_ref = btrim(partner_ref)),
  created_at timestamptz NOT NULL,
  -- Edition opcional e sempre do mesmo Concept (REQ-022).
  CONSTRAINT interest_edition_fkey FOREIGN KEY (edition_id, concept_id) REFERENCES app.edition (id, concept_id),
  -- Dias só para Co-Owner, e obrigatórios para Co-Owner (REQ-025, BR-060; F2b).
  CONSTRAINT interest_approx_days_modality_check CHECK ((modality = 'co_owner') = (approx_days IS NOT NULL))
);

CREATE INDEX interest_grouping_idx ON app.interest (concept_id, region, modality);

-- Com Edition, a modalidade do interesse precisa estar entre as que ela oferece (BR-032; F2a), em qualquer caminho de
-- escrita. Revalidado na inserção: a modalidade da Edition pode mudar enquanto a estrutura está aberta (REQ-022).
CREATE FUNCTION app.interest_modality_offered() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_offered text;
BEGIN
  IF NEW.edition_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT edition.modality INTO v_offered FROM app.edition AS edition WHERE edition.id = NEW.edition_id;
  IF v_offered IS NOT NULL AND v_offered <> 'owner_and_co_owner' AND v_offered <> NEW.modality THEN
    RAISE EXCEPTION 'app.interest: modality % is not offered by the edition', NEW.modality
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interest_modality_offered';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER interest_modality_offered BEFORE INSERT ON app.interest
  FOR EACH ROW EXECUTE FUNCTION app.interest_modality_offered();
CREATE TRIGGER interest_no_update BEFORE UPDATE ON app.interest
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER interest_no_delete BEFORE DELETE ON app.interest
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER interest_no_truncate BEFORE TRUNCATE ON app.interest
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- RLS ligada, política só para o papel de aplicação (ADR-0010 §7): `anon` e `authenticated` não leem nem gravam.
ALTER TABLE app.interest ENABLE ROW LEVEL SECURITY;
CREATE POLICY interest_app_read ON app.interest FOR SELECT TO luxtory_app USING (true);
CREATE POLICY interest_app_insert ON app.interest FOR INSERT TO luxtory_app WITH CHECK (true);
GRANT SELECT, INSERT ON app.interest TO luxtory_app;

-- migrate:down
REVOKE ALL ON app.interest FROM luxtory_app;
DROP TABLE app.interest;
DROP FUNCTION app.interest_modality_offered();
