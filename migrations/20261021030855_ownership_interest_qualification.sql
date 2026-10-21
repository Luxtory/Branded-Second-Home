-- migrate:up
-- Pré-qualificação comercial do interesse (W6; `03` v3.15 §3.1 `interest_qualification`; spec ownership §14.5–§14.7;
-- ADR-0018): dimensão de investimento, unidade de decisão e horizonte, com códigos semânticos estáveis. Contexto para a
-- conversa comercial: nunca score, faixa, prioridade, aprovação nem valor — nenhum valor é gravado ou derivado da média
-- projetada (BR-034). 1:1 com `app.interest`; mesma regra de eliminação do contato (sem UPDATE; DELETE possível, mas não
-- concedido ao papel de aplicação). Sem FK para party, holding, membership, Brand Partner ou parceiro.
--
-- `presented_projected_investment_id` é a média projetada que a página efetivamente apresentou (`02` §15, item 14),
-- provada pelo contexto assinado; nunca a vigente no envio. As linhas da média projetada não aceitam DELETE/TRUNCATE e
-- só mudam o fim da vigência (W4.2), então a FK basta para reconstruir o valor apresentado, sem cópia de `amount_minor`.
CREATE TABLE app.interest_qualification (
  interest_id uuid PRIMARY KEY REFERENCES app.interest (id),
  investment_question text NOT NULL
    CONSTRAINT interest_qualification_investment_question_check
    CHECK (investment_question IN ('reference_fit', 'investment_definition')),
  investment_answer text NOT NULL,
  presented_projected_investment_id uuid REFERENCES app.home_edition_projected_investment (id),
  decision_unit text NOT NULL
    CONSTRAINT interest_qualification_decision_unit_check
    CHECK (decision_unit IN ('self', 'with_partner_or_family', 'with_others')),
  decision_horizon text NOT NULL
    CONSTRAINT interest_qualification_decision_horizon_check
    CHECK (decision_horizon IN ('within_3_months', 'from_3_to_6_months', 'from_6_to_12_months', 'over_12_months',
                                'exploring')),
  created_at timestamptz NOT NULL,
  -- Respostas por variante (spec ownership §14.5).
  CONSTRAINT interest_qualification_investment_answer_check CHECK (
    (investment_question = 'reference_fit' AND investment_answer IN ('within', 'needs_understanding', 'above'))
    OR (investment_question = 'investment_definition'
        AND investment_answer IN ('range_defined', 'idea_without_range', 'needs_understanding'))
  ),
  -- A comparação com a referência só existe quando uma referência foi apresentada.
  CONSTRAINT interest_qualification_reference_check
    CHECK (investment_question <> 'reference_fit' OR presented_projected_investment_id IS NOT NULL)
);

CREATE INDEX interest_qualification_presented_idx ON app.interest_qualification (presented_projected_investment_id)
  WHERE presented_projected_investment_id IS NOT NULL;

-- Em qualquer caminho de escrita: a referência apresentada é da mesma Home Edition do interesse, e a variante é a da
-- modalidade desejada com o contexto apresentado (`reference_fit` só para Owner com referência; spec §14.5).
CREATE FUNCTION app.interest_qualification_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_modality text;
  v_home_edition_id uuid;
  v_reference_home_edition_id uuid;
  v_expected text;
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
  v_expected := CASE
    WHEN v_modality = 'owner' AND NEW.presented_projected_investment_id IS NOT NULL THEN 'reference_fit'
    ELSE 'investment_definition'
  END;
  IF NEW.investment_question IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'app.interest_qualification: investment question does not match the modality and the presented reference'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'interest_qualification_investment_question_variant';
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
