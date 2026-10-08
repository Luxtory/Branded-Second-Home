-- migrate:up
-- Leitura pública da Coleção (Wave 4.1; spec catalog §13.12 item 7; ADR-0014, ADR-0015): `anon` passa a ler, só das
-- linhas públicas, os vocabulários ativos em uso, as classificações e atributos das versões aprovadas, a capa aprovada
-- (metadados das larguras de exibição; o master nunca), a curadoria e os valores de referência vigentes. Menor privilégio por coluna; dados
-- de aprovação, retirada, quem registrou e valores futuros ficam fora.

-- Termo público = ativo e classificando uma versão aprovada de Concept público. SECURITY DEFINER pelo mesmo motivo dos
-- predicados da W4 (evitar políticas encadeadas); devolve só booleano.
CREATE FUNCTION app.catalog_term_is_public(p_term_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.catalog_term AS term
    JOIN app.concept_version_term AS classification ON classification.term_id = term.id
    JOIN app.concept_version AS version ON version.id = classification.concept_version_id
    WHERE term.id = p_term_id
      AND term.active
      AND version.state = 'approved'
      AND app.concept_is_public(version.concept_id)
  )
$$;

REVOKE ALL ON FUNCTION app.catalog_term_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.catalog_term_is_public(uuid) TO anon;

GRANT SELECT (summary, guests_max, suites, built_area_m2) ON app.concept_version TO anon;
GRANT SELECT (id, kind, slug, label) ON app.catalog_term TO anon;
GRANT SELECT (concept_version_id, term_id, kind, position) ON app.concept_version_term TO anon;
GRANT SELECT (id, concept_id, alt, credit, crop_x, crop_y) ON app.concept_media TO anon;
GRANT SELECT (media_id, role, width, height, content_type, storage_key) ON app.concept_media_file TO anon;
GRANT SELECT (concept_id, rank, featured) ON app.concept_curation TO anon;
GRANT SELECT (id, edition_id, basis, amount_minor, currency, valid_from, valid_until)
  ON app.edition_reference_value TO anon;

CREATE POLICY catalog_term_public_read ON app.catalog_term FOR SELECT TO anon
  USING (app.catalog_term_is_public(id));
-- As subconsultas abaixo leem como `anon`: valem as políticas públicas de `concept_version`, `concept_media` e
-- `edition` (W4), sem repetir a regra.
CREATE POLICY concept_version_term_public_read ON app.concept_version_term FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM app.concept_version AS version WHERE version.id = concept_version_id));
CREATE POLICY concept_media_public_read ON app.concept_media FOR SELECT TO anon
  USING (state = 'approved' AND app.concept_is_public(concept_id));
-- O master sanitizado nunca é público: só as larguras de exibição da capa aprovada.
CREATE POLICY concept_media_file_public_read ON app.concept_media_file FOR SELECT TO anon
  USING (role = 'display' AND EXISTS (SELECT 1 FROM app.concept_media AS media WHERE media.id = media_id));
CREATE POLICY concept_curation_public_read ON app.concept_curation FOR SELECT TO anon
  USING (app.concept_is_public(concept_id));
-- Só o valor vigente agora; valores futuros e encerrados não são públicos.
CREATE POLICY edition_reference_value_public_read ON app.edition_reference_value FOR SELECT TO anon
  USING (
    valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
    AND EXISTS (SELECT 1 FROM app.edition AS edition WHERE edition.id = edition_id)
  );

-- migrate:down
DROP POLICY edition_reference_value_public_read ON app.edition_reference_value;
DROP POLICY concept_curation_public_read ON app.concept_curation;
DROP POLICY concept_media_file_public_read ON app.concept_media_file;
DROP POLICY concept_media_public_read ON app.concept_media;
DROP POLICY concept_version_term_public_read ON app.concept_version_term;
DROP POLICY catalog_term_public_read ON app.catalog_term;

REVOKE SELECT (id, edition_id, basis, amount_minor, currency, valid_from, valid_until)
  ON app.edition_reference_value FROM anon;
REVOKE SELECT (concept_id, rank, featured) ON app.concept_curation FROM anon;
REVOKE SELECT (media_id, role, width, height, content_type, storage_key) ON app.concept_media_file FROM anon;
REVOKE SELECT (id, concept_id, alt, credit, crop_x, crop_y) ON app.concept_media FROM anon;
REVOKE SELECT (concept_version_id, term_id, kind, position) ON app.concept_version_term FROM anon;
REVOKE SELECT (id, kind, slug, label) ON app.catalog_term FROM anon;
REVOKE SELECT (summary, guests_max, suites, built_area_m2) ON app.concept_version FROM anon;

DROP FUNCTION app.catalog_term_is_public(uuid);
