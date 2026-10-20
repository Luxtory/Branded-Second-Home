import type { DatabaseTransaction } from '@/features/platform';
import type {
  PublicCollectionReader,
  PublicCover,
  PublicTerm,
} from '../application/collection-views';
import type { CropStep } from '../domain/collection';
import { groupBy, publicHomeEditionsByConcept } from './public-home-editions';

/**
 * Leituras da Coleção como `anon`, dentro de `withPublicRead` (ADR-0014, ADR-0015). Só as colunas concedidas a `anon`
 * (migrations `catalog_collection_public_read` e da W4.2); as linhas visíveis — Home Concepts públicos, versões
 * aprovadas, termos ativos, capa aprovada, Home Editions públicas, mídia aprovada e médias vigentes — vêm da RLS, sem
 * nenhuma regra repetida aqui.
 */
type Tx = DatabaseTransaction;

// Os CHECKs do banco garantem os valores dos enums.
const asCrop = (value: number) => value as CropStep;

/** Versão vigente de cada Home Concept = a aprovada de maior número (a RLS só entrega versões aprovadas). */
function currentVersions(tx: Tx) {
  return tx
    .selectFrom('app.home_concept_version')
    .select(['id', 'home_concept_id', 'summary'])
    .distinctOn('home_concept_id')
    .orderBy('home_concept_id')
    .orderBy('version', 'desc')
    .execute();
}

async function versionTerms(tx: Tx, versionIds: readonly string[]) {
  if (versionIds.length === 0) return new Map<string, { kind: string; term: PublicTerm }[]>();
  // Junção interna: termo desativado (invisível para `anon`) some da classificação.
  const rows = await tx
    .selectFrom('app.home_concept_version_term as classification')
    .innerJoin('app.catalog_term as term', 'term.id', 'classification.term_id')
    .select([
      'classification.home_concept_version_id',
      'classification.kind',
      'classification.position',
      'term.slug',
      'term.label',
    ])
    .where('classification.home_concept_version_id', 'in', [...versionIds])
    .orderBy('classification.position')
    .execute();
  return groupBy(
    rows.map((row) => ({
      versionId: row.home_concept_version_id,
      kind: row.kind,
      term: { slug: row.slug, label: row.label },
    })),
    (row) => row.versionId,
  );
}

async function covers(tx: Tx): Promise<Map<string, PublicCover>> {
  const media = await tx
    .selectFrom('app.home_concept_media')
    .select(['id', 'home_concept_id', 'alt', 'credit', 'crop_x', 'crop_y'])
    .execute();
  const files = groupBy(
    await tx
      .selectFrom('app.home_concept_media_file')
      .select(['media_id', 'width', 'height'])
      .where('role', '=', 'display')
      .orderBy('width')
      .execute(),
    (file) => file.media_id,
  );
  return new Map(
    media.map((row) => [
      row.home_concept_id,
      {
        mediaId: row.id,
        alt: row.alt,
        credit: row.credit,
        cropX: asCrop(row.crop_x),
        cropY: asCrop(row.crop_y),
        widths: (files.get(row.id) ?? []).map((file) => ({
          width: file.width,
          height: file.height,
        })),
      },
    ]),
  );
}

async function rendition(
  tx: Tx,
  table: 'app.home_concept_media_file' | 'app.home_edition_media_file',
  mediaId: string,
  width: number,
) {
  const row = await tx
    .selectFrom(table)
    .select(['content_type', 'storage_key'])
    .where('media_id', '=', mediaId)
    .where('role', '=', 'display')
    .where('width', '=', width)
    .executeTakeFirst();
  return row === undefined ? null : { contentType: row.content_type, storageKey: row.storage_key };
}

export const postgresPublicCollectionReader: PublicCollectionReader<Tx> = {
  async entries(tx) {
    const homeConcepts = await tx
      .selectFrom('app.home_concept as home_concept')
      .innerJoin('app.brand_partner as partner', 'partner.id', 'home_concept.brand_partner_id')
      .select([
        'home_concept.id',
        'home_concept.title',
        'home_concept.created_at',
        'home_concept.brand_partner_id',
        'partner.brand_name',
      ])
      .orderBy('home_concept.created_at')
      .orderBy('home_concept.id')
      .execute();
    const versions = new Map((await currentVersions(tx)).map((row) => [row.home_concept_id, row]));
    const terms = await versionTerms(
      tx,
      [...versions.values()].map((version) => version.id),
    );
    const curation = new Map(
      (
        await tx
          .selectFrom('app.home_concept_curation')
          .select(['home_concept_id', 'rank', 'featured'])
          .execute()
      ).map((row) => [row.home_concept_id, row]),
    );
    const coverByHomeConcept = await covers(tx);
    const homeEditions = await publicHomeEditionsByConcept(
      tx,
      homeConcepts.map((homeConcept) => homeConcept.id),
    );
    return homeConcepts.flatMap((homeConcept) => {
      const version = versions.get(homeConcept.id);
      if (version === undefined) return [];
      const classification = terms.get(version.id) ?? [];
      const ofKind = (kind: string) =>
        classification.filter((row) => row.kind === kind).map((row) => row.term);
      return [
        {
          id: homeConcept.id,
          title: homeConcept.title,
          brandPartnerId: homeConcept.brand_partner_id,
          brandName: homeConcept.brand_name,
          createdAt: homeConcept.created_at,
          summary: version.summary,
          lifestyles: ofKind('lifestyle'),
          styles: ofKind('architectural_style'),
          cover: coverByHomeConcept.get(homeConcept.id) ?? null,
          rank: curation.get(homeConcept.id)?.rank ?? null,
          featured: curation.get(homeConcept.id)?.featured ?? false,
          homeEditions: homeEditions.get(homeConcept.id) ?? [],
        },
      ];
    });
  },

  coverRendition: (tx, mediaId, width) =>
    rendition(tx, 'app.home_concept_media_file', mediaId, width),

  homeEditionMediaRendition: (tx, mediaId, width) =>
    rendition(tx, 'app.home_edition_media_file', mediaId, width),
};
