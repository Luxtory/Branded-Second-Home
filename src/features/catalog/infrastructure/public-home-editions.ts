import type { DatabaseTransaction } from '@/features/platform';
import type {
  PublicCollectionHomeEdition,
  PublicProjectedInvestment,
} from '../application/collection-views';
import { mainImage } from '../application/public-media';
import type { PublicHomeEditionMedia } from '../application/public-views';
import type {
  CropStep,
  HomeEditionMediaKind,
  ProjectedInvestmentCurrency,
} from '../domain/collection';

/**
 * Leituras públicas da Home Edition como `anon` (ADR-0014; spec catalog §17.7): só as colunas concedidas a `anon`; as
 * linhas visíveis — Home Edition pública de Home Concept público, mídia aprovada, média vigente — vêm da RLS, sem
 * nenhuma regra repetida aqui. Os CHECKs do banco garantem os valores dos enums.
 */
type Tx = DatabaseTransaction;

/** Imagens antes de renders, plantas por último; dentro de cada tipo, a ordem de aprovação. */
const KIND_ORDER: readonly HomeEditionMediaKind[] = ['image', 'render', 'floor_plan'];

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group === undefined) groups.set(key(item), [item]);
    else group.push(item);
  }
  return groups;
}

/** Mídia aprovada das Home Editions informadas, por Home Edition, com as larguras de exibição. */
export async function publicHomeEditionMedia(
  tx: Tx,
  homeEditionIds: readonly string[],
): Promise<Map<string, PublicHomeEditionMedia[]>> {
  if (homeEditionIds.length === 0) return new Map();
  const media = await tx
    .selectFrom('app.home_edition_media')
    .select(['id', 'home_edition_id', 'kind', 'alt', 'credit', 'crop_x', 'crop_y', 'approved_at'])
    .where('home_edition_id', 'in', [...homeEditionIds])
    .orderBy('approved_at')
    .orderBy('id')
    .execute();
  const files = groupBy(
    media.length === 0
      ? []
      : await tx
          .selectFrom('app.home_edition_media_file')
          .select(['media_id', 'width', 'height'])
          .where('role', '=', 'display')
          .where(
            'media_id',
            'in',
            media.map((row) => row.id),
          )
          .orderBy('width')
          .execute(),
    (file) => file.media_id,
  );
  const items = media
    .map((row) => ({
      homeEditionId: row.home_edition_id,
      item: {
        mediaId: row.id,
        kind: row.kind as HomeEditionMediaKind,
        alt: row.alt,
        credit: row.credit,
        cropX: row.crop_x as CropStep,
        cropY: row.crop_y as CropStep,
        widths: (files.get(row.id) ?? []).map(({ width, height }) => ({ width, height })),
      },
    }))
    .sort((a, b) => KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind));
  const byEdition = new Map<string, PublicHomeEditionMedia[]>();
  for (const { homeEditionId, item } of items) {
    byEdition.set(homeEditionId, [...(byEdition.get(homeEditionId) ?? []), item]);
  }
  return byEdition;
}

/** A média projetada vigente de cada Home Edition informada (no máximo uma, BR-034). */
export async function publicProjectedInvestments(
  tx: Tx,
  homeEditionIds: readonly string[],
): Promise<Map<string, PublicProjectedInvestment>> {
  if (homeEditionIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.home_edition_projected_investment')
    .select(['home_edition_id', 'amount_minor', 'currency'])
    .where('home_edition_id', 'in', [...homeEditionIds])
    .execute();
  return new Map(
    rows.map((row) => [
      row.home_edition_id,
      {
        // `bigint` chega como texto do driver; nunca passa por ponto flutuante (TECH-033).
        amountMinor: BigInt(row.amount_minor),
        currency: row.currency as ProjectedInvestmentCurrency,
      },
    ]),
  );
}

/** Home Editions públicas dos Home Concepts informados, por Home Concept, na ordem de registro. */
export async function publicHomeEditionsByConcept(
  tx: Tx,
  homeConceptIds: readonly string[],
): Promise<Map<string, PublicCollectionHomeEdition[]>> {
  if (homeConceptIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.home_edition')
    .select([
      'id',
      'home_concept_id',
      'name',
      'typology',
      'guests_max',
      'suites',
      'projected_area_m2',
      'created_at',
    ])
    .where('home_concept_id', 'in', [...homeConceptIds])
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const ids = rows.map((row) => row.id);
  const [media, investments] = [
    await publicHomeEditionMedia(tx, ids),
    await publicProjectedInvestments(tx, ids),
  ];
  const byConcept = new Map<string, PublicCollectionHomeEdition[]>();
  for (const row of rows) {
    const homeEdition: PublicCollectionHomeEdition = {
      id: row.id,
      name: row.name,
      typology: row.typology,
      guestsMax: row.guests_max,
      suites: row.suites,
      projectedAreaM2: row.projected_area_m2,
      projectedInvestment: investments.get(row.id) ?? null,
      cover: mainImage(media.get(row.id) ?? []),
      createdAt: row.created_at,
    };
    byConcept.set(row.home_concept_id, [
      ...(byConcept.get(row.home_concept_id) ?? []),
      homeEdition,
    ]);
  }
  return byConcept;
}
