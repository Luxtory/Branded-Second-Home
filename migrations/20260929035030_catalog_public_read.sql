-- migrate:up
-- Discovery público (W4; ADR-0014; spec catalog §13.2). As páginas públicas leem o catálogo numa transação só de
-- leitura em que o papel de aplicação vira `anon` (`SET LOCAL ROLE`), como a leitura de usuário da W2. Menor
-- privilégio: `anon` só enxerga as colunas publicáveis, e só das linhas públicas (RLS). Nenhuma escrita.
GRANT anon TO luxtory_app WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA app TO anon;

-- Predicados de visibilidade (spec catalog §13.1). SECURITY DEFINER porque as políticas de `concept` e
-- `concept_version` se consultariam em recursão; devolvem só booleano. Brand Partner pública = exposição da marca
-- autorizada (BR-015) e, se houver encerramento, antes da sua eficácia (BR-021, mesma fronteira do domínio: em uso
-- enquanto `now()` é anterior à eficácia). A ocultação depois da eficácia é limitação temporária fechada para
-- falhas — não redefine BR-021/022/023; quando os direitos sobreviventes virarem dado, estes predicados passam a
-- considerá-los.
CREATE FUNCTION app.brand_partner_is_public(p_brand_partner_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.brand_partner AS partner
    WHERE partner.id = p_brand_partner_id
      AND partner.exposure_authorized_at IS NOT NULL
      AND (partner.terminated_effective_at IS NULL OR partner.terminated_effective_at > now())
  )
$$;

-- Concept público = Brand Partner pública e ao menos uma versão aprovada (REQ-096).
CREATE FUNCTION app.concept_is_public(p_concept_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.concept AS concept
    WHERE concept.id = p_concept_id
      AND app.brand_partner_is_public(concept.brand_partner_id)
      AND EXISTS (
        SELECT 1
        FROM app.concept_version AS version
        WHERE version.concept_id = concept.id AND version.state = 'approved'
      )
  )
$$;

REVOKE ALL ON FUNCTION app.brand_partner_is_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.concept_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.brand_partner_is_public(uuid) TO anon;
GRANT EXECUTE ON FUNCTION app.concept_is_public(uuid) TO anon;

-- Colunas publicáveis (spec catalog §13.1, menor conteúdo público). `version` e `state` só escolhem a versão vigente;
-- não são exibidos.
-- `essential_elements`, `preservation_premises`, dados de aprovação, Residences e Investor ficam fora.
GRANT SELECT (id, brand_name) ON app.brand_partner TO anon;
GRANT SELECT (id, brand_partner_id, title, created_at) ON app.concept TO anon;
GRANT SELECT (id, concept_id, version, state, specification) ON app.concept_version TO anon;
GRANT SELECT (id, concept_id, region, modality, commercial_conditions, created_at) ON app.edition TO anon;

CREATE POLICY brand_partner_public_read ON app.brand_partner FOR SELECT TO anon
  USING (app.brand_partner_is_public(id));
CREATE POLICY concept_public_read ON app.concept FOR SELECT TO anon
  USING (app.concept_is_public(id));
CREATE POLICY concept_version_public_read ON app.concept_version FOR SELECT TO anon
  USING (state = 'approved' AND app.concept_is_public(concept_id));
CREATE POLICY edition_public_read ON app.edition FOR SELECT TO anon
  USING (app.concept_is_public(concept_id));

-- migrate:down
DROP POLICY edition_public_read ON app.edition;
DROP POLICY concept_version_public_read ON app.concept_version;
DROP POLICY concept_public_read ON app.concept;
DROP POLICY brand_partner_public_read ON app.brand_partner;

REVOKE SELECT (id, concept_id, region, modality, commercial_conditions, created_at) ON app.edition FROM anon;
REVOKE SELECT (id, concept_id, version, state, specification) ON app.concept_version FROM anon;
REVOKE SELECT (id, brand_partner_id, title, created_at) ON app.concept FROM anon;
REVOKE SELECT (id, brand_name) ON app.brand_partner FROM anon;

DROP FUNCTION app.concept_is_public(uuid);
DROP FUNCTION app.brand_partner_is_public(uuid);

REVOKE USAGE ON SCHEMA app FROM anon;
REVOKE anon FROM luxtory_app;
