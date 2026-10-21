-- migrate:up
-- Pré-qualificação comercial do interesse (W6; `03` v3.15 §3.1 `interest_qualification`; spec ownership §14.5–§14.7;
-- ADR-0018; revisão do fundador de 2026-10-21): Budget (faixa autodeclarada de recursos para iniciar e, só para Owner
-- com média apresentada, a comparação com ela), Authority (unidade de decisão) e Timeline (horizonte), com códigos
-- semânticos estáveis na versão 1. Contexto para o SDR: nunca score, prioridade, aprovação, preço nem capacidade
-- comprovada — nenhum valor exato é gravado e nenhum valor é derivado da média projetada (BR-034). 1:1 com
-- `app.interest`; mesma regra de eliminação do contato (sem UPDATE; DELETE possível, mas não concedido ao papel de
-- aplicação). Sem FK para party, holding, membership, Brand Partner ou parceiro.
--
-- `presented_projected_investment_id` é a média projetada que a página efetivamente apresentou (`02` §15, item 14),
-- provada pelo contexto assinado; nunca a vigente no envio. As linhas da média projetada não aceitam DELETE/TRUNCATE e
-- só mudam o fim da vigência (W4.2), então a FK basta para reconstruir o valor apresentado, sem cópia de `amount_minor`.
CREATE TABLE app.interest_qualification (
  interest_id uuid PRIMARY KEY REFERENCES app.interest (id),
  -- Versão dos códigos e das faixas (spec §14.5): uma mudança exige versão nova, e os registros antigos seguem
  -- interpretáveis.
  qualification_version smallint NOT NULL
    CONSTRAINT interest_qualification_version_check CHECK (qualification_version = 1),
  -- Faixa autodeclarada em reais (versão 1); nunca o valor exato.
  available_to_start_band text NOT NULL
    CONSTRAINT interest_qualification_available_to_start_band_check
    CHECK (available_to_start_band IN ('up_to_250k', 'from_250k_to_500k', 'from_500k_to_1m', 'from_1m_to_2_5m',
                                       'from_2_5m_to_5m', 'above_5m', 'not_defined')),
  reference_fit text
    CONSTRAINT interest_qualification_reference_fit_check
    CHECK (reference_fit IN ('within', 'could_consider', 'above')),
  presented_projected_investment_id uuid REFERENCES app.home_edition_projected_investment (id),
  decision_unit text NOT NULL
    CONSTRAINT interest_qualification_decision_unit_check
    CHECK (decision_unit IN ('self', 'with_partner_or_family', 'with_others')),
  decision_horizon text NOT NULL
    CONSTRAINT interest_qualification_decision_horizon_check
    CHECK (decision_horizon IN ('immediate', 'within_30_days', 'one_to_three_months', 'three_to_six_months',
                                'six_to_twelve_months', 'over_twelve_months', 'exploring')),
  created_at timestamptz NOT NULL,
  -- A comparação com a média só existe quando uma média foi apresentada.
  CONSTRAINT interest_qualification_reference_check
    CHECK (reference_fit IS NULL OR presented_projected_investment_id IS NOT NULL)
);

CREATE INDEX interest_qualification_presented_idx ON app.interest_qualification (presented_projected_investment_id)
  WHERE presented_projected_investment_id IS NOT NULL;

-- Em qualquer caminho de escrita: a referência apresentada é da mesma Home Edition do interesse, e `reference_fit`
-- existe se e somente se a modalidade desejada é Owner e houve média apresentada (spec §14.5; Co-Owner nunca compara).
CREATE FUNCTION app.interest_qualification_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_modality text;
  v_home_edition_id uuid;
  v_reference_home_edition_id uuid;
  v_asks_reference_fit boolean;
BEGIN
  SELECT interest.modality, interest.home_edition_id INTO v_modality, v_home_edition_id
  FROM app.interest AS interest WHERE interest.id = NEW.interest_id;
  IF NEW.presented_projected_investment_id IS NOT NULL THEN
    SELECT reference.home_edition_id INTO v_reference_home_edition_id
    FROM app.home_edition_projected_investment AS reference
    WHERE reference.id = NEW.presented_projected_investment_id;
    IF v_reference_home_edition_id IS DISTINCT FROM v_home_edition_id THEN
      RAISE EXCEPTION 'app.interest_qualification: the presented projected investment belongs to another Home Edition'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'interest_qualification_reference_home_edition';
    END IF;
  END IF;
  v_asks_reference_fit := v_modality = 'owner' AND NEW.presented_projected_investment_id IS NOT NULL;
  IF (NEW.reference_fit IS NOT NULL) IS DISTINCT FROM v_asks_reference_fit THEN
    RAISE EXCEPTION 'app.interest_qualification: reference_fit must exist only for Owner with a presented projected investment'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interest_qualification_reference_fit_variant';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER interest_qualification_guard BEFORE INSERT ON app.interest_qualification
  FOR EACH ROW EXECUTE FUNCTION app.interest_qualification_guard();
CREATE TRIGGER interest_qualification_no_update BEFORE UPDATE ON app.interest_qualification
  FOR EACH ROW EXECUTE FUNCTION app.forbid_change();
CREATE TRIGGER interest_qualification_no_truncate BEFORE TRUNCATE ON app.interest_qualification
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_change();

-- RLS ligada, política só para o papel de aplicação (ADR-0010 §7): `anon` e `authenticated` não leem nem gravam.
ALTER TABLE app.interest_qualification ENABLE ROW LEVEL SECURITY;
CREATE POLICY interest_qualification_app_read ON app.interest_qualification FOR SELECT TO luxtory_app USING (true);
CREATE POLICY interest_qualification_app_insert ON app.interest_qualification FOR INSERT TO luxtory_app
  WITH CHECK (true);
GRANT SELECT, INSERT ON app.interest_qualification TO luxtory_app;

-- migrate:down
-- Fail-closed: apagar a tabela eliminaria pré-qualificações sem o procedimento operacional (spec ownership §14.12).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.interest_qualification) THEN
    RAISE EXCEPTION 'W6 rollback precondition: interest_qualification has rows; they are only removed by the operational procedure'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;
REVOKE ALL ON app.interest_qualification FROM luxtory_app;
DROP TABLE app.interest_qualification;
DROP FUNCTION app.interest_qualification_guard();
