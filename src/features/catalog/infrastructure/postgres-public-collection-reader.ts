import type { DatabaseTransaction } from '@/features/platform';
import type {
  PublicCollectionEdition,
  PublicCollectionReader,
  PublicCover,
  PublicTerm,
} from '../application/collection-views';
import type { EditionModality } from '../domain/catalog';
import {
  basesForModality,
  type CropStep,
  type ReferenceValueBasis,
  type ReferenceValueCurrency,
} from '../domain/collection';

/**
 * Leituras da Coleção como `anon`, dentro de `withPublicRead` (ADR-0014, ADR-0015). Só as colunas concedidas a `anon`
 * (migration `catalog_collection_public_read`); as linhas visíveis — Concepts públicos, versões aprovadas, termos ativos,
 * capa aprovada e valores vigentes — vêm da RLS, sem nenhuma regra repetida aqui.
 */
type Tx = DatabaseTransaction;

// Os CHECKs do banco garantem os valores dos enums.
const asModality = (value: string) => value as EditionModality;
const asBasis = (value: string) => value as ReferenceValueBasis;
const asCurrency = (value: string) => value as ReferenceValueCurrency;
const asCrop = (value: number) => value as CropStep;

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group === undefined) groups.set(key(item), [item]);
    else group.push(item);
  }
  return groups;
}

/** Versão vigente de cada Concept = a aprovada de maior número (a RLS só entrega versões aprovadas). */
function currentVersions(tx: Tx) {
  return tx
    .selectFrom('app.concept_version')
    .select(['id', 'concept_id', 'summary', 'guests_max', 'suites', 'built_area_m2'])
    .distinctOn('concept_id')
    .orderBy('concept_id')
    .orderBy('version', 'desc')
    .execute();
}

async function versionTerms(tx: Tx, versionIds: readonly string[]) {
  if (versionIds.length === 0) return new Map<string, { kind: string; term: PublicTerm }[]>();
  // Junção interna: termo desativado (invisível para `anon`) some da classificação.
  const rows = await tx
    .selectFrom('app.concept_version_term as classification')
    .innerJoin('app.catalog_term as term', 'term.id', 'classification.term_id')
    .select([
      'classification.concept_version_id',
      'classification.kind',
      'classification.position',
      'term.slug',
      'term.label',
    ])
    .where('classification.concept_version_id', 'in', [...versionIds])
    .orderBy('classification.position')
    .execute();
  return groupBy(
    rows.map((row) => ({
      versionId: row.concept_version_id,
      kind: row.kind,
      term: { slug: row.slug, label: row.label },
    })),
    (row) => row.versionId,
  );
}

async function covers(tx: Tx): Promise<Map<string, PublicCover>> {
  const media = await tx
    .selectFrom('app.concept_media')
    .select(['id', 'concept_id', 'alt', 'credit', 'crop_x', 'crop_y'])
    .execute();
  const files = groupBy(
    await tx
      .selectFrom('app.concept_media_file')
      .select(['media_id', 'width', 'height'])
      .where('role', '=', 'display')
      .orderBy('width')
      .execute(),
    (file) => file.media_id,
  );
  return new Map(
    media.map((row) => [
      row.concept_id,
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

async function editions(tx: Tx): Promise<Map<string, PublicCollectionEdition[]>> {
  const rows = await tx
    .selectFrom('app.edition')
    .select(['id', 'concept_id', 'region', 'modality'])
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const values = groupBy(
    await tx
      .selectFrom('app.edition_reference_value')
      .select(['edition_id', 'basis', 'amount_minor', 'currency'])
      .execute(),
    (value) => value.edition_id,
  );
  const byConcept = new Map<string, PublicCollectionEdition[]>();
  for (const row of rows) {
    const modality = asModality(row.modality);
    const offered = basesForModality(modality);
    const edition: PublicCollectionEdition = {
      id: row.id,
      region: row.region,
      modality,
      values: (values.get(row.id) ?? [])
        .map((value) => ({
          basis: asBasis(value.basis),
          amountMinor: BigInt(value.amount_minor),
          currency: asCurrency(value.currency),
        }))
        .filter((value) => offered.includes(value.basis))
        .sort((a, b) => offered.indexOf(a.basis) - offered.indexOf(b.basis)),
    };
    byConcept.set(row.concept_id, [...(byConcept.get(row.concept_id) ?? []), edition]);
  }
  return byConcept;
}

export const postgresPublicCollectionReader: PublicCollectionReader<Tx> = {
  async entries(tx) {
    const concepts = await tx
      .selectFrom('app.concept as concept')
      .innerJoin('app.brand_partner as partner', 'partner.id', 'concept.brand_partner_id')
      .select([
        'concept.id',
        'concept.title',
        'concept.created_at',
        'concept.brand_partner_id',
        'partner.brand_name',
      ])
      .orderBy('concept.created_at')
      .orderBy('concept.id')
      .execute();
    const versions = new Map((await currentVersions(tx)).map((row) => [row.concept_id, row]));
    const terms = await versionTerms(
      tx,
      [...versions.values()].map((version) => version.id),
    );
    const curation = new Map(
      (
        await tx
          .selectFrom('app.concept_curation')
          .select(['concept_id', 'rank', 'featured'])
          .execute()
      ).map((row) => [row.concept_id, row]),
    );
    const [coverByConcept, editionsByConcept] = [await covers(tx), await editions(tx)];
    return concepts.flatMap((concept) => {
      const version = versions.get(concept.id);
      if (version === undefined) return [];
      const classification = terms.get(version.id) ?? [];
      const ofKind = (kind: string) =>
        classification.filter((row) => row.kind === kind).map((row) => row.term);
      return [
        {
          id: concept.id,
          title: concept.title,
          brandPartnerId: concept.brand_partner_id,
          brandName: concept.brand_name,
          createdAt: concept.created_at,
          summary: version.summary,
          guestsMax: version.guests_max,
          suites: version.suites,
          builtAreaM2: version.built_area_m2,
          lifestyles: ofKind('lifestyle'),
          styles: ofKind('architectural_style'),
          cover: coverByConcept.get(concept.id) ?? null,
          rank: curation.get(concept.id)?.rank ?? null,
          featured: curation.get(concept.id)?.featured ?? false,
          editions: editionsByConcept.get(concept.id) ?? [],
        },
      ];
    });
  },

  async coverRendition(tx, mediaId, width) {
    const row = await tx
      .selectFrom('app.concept_media_file')
      .select(['content_type', 'storage_key'])
      .where('media_id', '=', mediaId)
      .where('role', '=', 'display')
      .where('width', '=', width)
      .executeTakeFirst();
    return row === undefined
      ? null
      : { contentType: row.content_type, storageKey: row.storage_key };
  },
};
