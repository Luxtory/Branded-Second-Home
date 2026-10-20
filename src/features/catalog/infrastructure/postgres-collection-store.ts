import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { CatalogStore } from '../application/ports';
import {
  toCatalogTerm,
  toHomeConceptCuration,
  toHomeConceptMedia,
  toHomeEditionProjectedInvestment,
} from './rows';

/**
 * Persistência da Coleção (spec catalog §13.12, ADR-0015) como `luxtory_app`, na transação do command. Os bytes da capa
 * só são escritos aqui; as leituras de metadados nunca carregam os bytes.
 */
type Tx = DatabaseTransaction;

type CollectionStore = Pick<
  CatalogStore<Tx>,
  | 'catalogTerms'
  | 'conflictingTerm'
  | 'insertCatalogTerm'
  | 'updateCatalogTerm'
  | 'homeConceptMedia'
  | 'currentCover'
  | 'insertHomeConceptMedia'
  | 'approveHomeConceptMedia'
  | 'withdrawHomeConceptMedia'
  | 'homeConceptCuration'
  | 'lockFeaturedSlot'
  | 'featuredCuration'
  | 'saveHomeConceptCuration'
  | 'homeEditionProjectedInvestment'
  | 'homeEditionProjectedInvestments'
  | 'insertHomeEditionProjectedInvestment'
  | 'endHomeEditionProjectedInvestment'
>;

/** Chave da trava consultiva que serializa a troca do destaque (no máximo um Home Concept em destaque). */
const FEATURED_SLOT_LOCK = 'app.home_concept_curation.featured';

function mediaFiles(tx: Tx, mediaId: string) {
  return tx
    .selectFrom('app.home_concept_media_file')
    .select(['role', 'width', 'height'])
    .where('media_id', '=', mediaId)
    .orderBy('width')
    .execute();
}

async function mediaWhere(
  tx: Tx,
  column: 'id' | 'home_concept_id',
  value: string,
  approvedOnly: boolean,
) {
  let query = tx.selectFrom('app.home_concept_media').selectAll().where(column, '=', value);
  if (approvedOnly) query = query.where('state', '=', 'approved');
  const row = await query.executeTakeFirst();
  return row === undefined ? null : toHomeConceptMedia(row, await mediaFiles(tx, row.id));
}

export const postgresCollectionStore: CollectionStore = {
  async catalogTerms(tx, ids, lock) {
    if (ids.length === 0) return [];
    let query = tx
      .selectFrom('app.catalog_term')
      .selectAll()
      .where('id', 'in', [...ids]);
    query = lock === 'share' ? query.forShare() : query.forNoKeyUpdate();
    return (await query.execute()).map(toCatalogTerm);
  },

  async conflictingTerm(tx, { kind, label, slug, exceptId }) {
    let query = tx
      .selectFrom('app.catalog_term')
      .selectAll()
      .where('kind', '=', kind)
      .where((eb) =>
        eb.or([
          eb(sql`lower(label)`, '=', sql`lower(${label})`),
          ...(slug === null ? [] : [eb('slug', '=', slug)]),
        ]),
      );
    if (exceptId !== null) query = query.where('id', '<>', exceptId);
    const row = await query.limit(1).executeTakeFirst();
    return row === undefined ? null : toCatalogTerm(row);
  },

  async insertCatalogTerm(tx, term) {
    await tx
      .insertInto('app.catalog_term')
      .values({
        id: term.id,
        kind: term.kind,
        slug: term.slug,
        label: term.label,
        active: term.active,
        operation_id: term.operationId,
        created_at: term.createdAt,
      })
      .execute();
  },

  async updateCatalogTerm(tx, id, change) {
    const row = await tx
      .updateTable('app.catalog_term')
      .set({ label: change.label, active: change.active })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toCatalogTerm(row);
  },

  homeConceptMedia: (tx, id) => mediaWhere(tx, 'id', id, false),

  currentCover: (tx, homeConceptId) => mediaWhere(tx, 'home_concept_id', homeConceptId, true),

  async insertHomeConceptMedia(tx, media, renditions) {
    await tx
      .insertInto('app.home_concept_media')
      .values({
        id: media.id,
        home_concept_id: media.homeConceptId,
        state: media.state,
        alt: media.alt,
        credit: media.credit,
        crop_x: media.cropX,
        crop_y: media.cropY,
        source_sha256: media.sourceSha256,
        operation_id: media.operationId,
        created_at: media.createdAt,
      })
      .execute();
    await tx
      .insertInto('app.home_concept_media_file')
      .values(
        renditions.map((rendition) => ({
          media_id: media.id,
          role: rendition.role,
          width: rendition.width,
          height: rendition.height,
          content_type: rendition.contentType,
          byte_size: rendition.byteSize,
          sha256: rendition.sha256,
          storage_key: rendition.storageKey,
        })),
      )
      .execute();
  },

  async approveHomeConceptMedia(tx, id, approval) {
    const row = await tx
      .updateTable('app.home_concept_media')
      .set({
        state: 'approved',
        approved_at: approval.at,
        approved_by_user_id: approval.byUserId,
        approved_role: approval.role,
        approval_operation_id: approval.operationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeConceptMedia(row, await mediaFiles(tx, id));
  },

  async withdrawHomeConceptMedia(tx, id, withdrawal) {
    const row = await tx
      .updateTable('app.home_concept_media')
      .set({
        state: 'withdrawn',
        withdrawn_at: withdrawal.at,
        withdrawal_basis: withdrawal.basis,
        withdrawal_operation_id: withdrawal.operationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeConceptMedia(row, await mediaFiles(tx, id));
  },

  async homeConceptCuration(tx, homeConceptId) {
    const row = await tx
      .selectFrom('app.home_concept_curation')
      .selectAll()
      .where('home_concept_id', '=', homeConceptId)
      .executeTakeFirst();
    return row === undefined ? null : toHomeConceptCuration(row);
  },

  async lockFeaturedSlot(tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${FEATURED_SLOT_LOCK}, 0))`.execute(tx);
  },

  async featuredCuration(tx) {
    const row = await tx
      .selectFrom('app.home_concept_curation')
      .selectAll()
      .where('featured', '=', true)
      .executeTakeFirst();
    return row === undefined ? null : toHomeConceptCuration(row);
  },

  async saveHomeConceptCuration(tx, curation) {
    const change = {
      rank: curation.rank,
      featured: curation.featured,
      operation_id: curation.operationId,
      updated_at: curation.updatedAt,
    };
    await tx
      .insertInto('app.home_concept_curation')
      .values({ home_concept_id: curation.homeConceptId, ...change })
      .onConflict((conflict) => conflict.column('home_concept_id').doUpdateSet(change))
      .execute();
  },

  async homeEditionProjectedInvestment(tx, id) {
    const row = await tx
      .selectFrom('app.home_edition_projected_investment')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toHomeEditionProjectedInvestment(row);
  },

  async homeEditionProjectedInvestments(tx, homeEditionId) {
    const rows = await tx
      .selectFrom('app.home_edition_projected_investment')
      .selectAll()
      .where('home_edition_id', '=', homeEditionId)
      .orderBy('valid_from')
      .execute();
    return rows.map(toHomeEditionProjectedInvestment);
  },

  async insertHomeEditionProjectedInvestment(tx, value) {
    await tx
      .insertInto('app.home_edition_projected_investment')
      .values({
        id: value.id,
        home_edition_id: value.homeEditionId,
        amount_minor: value.amountMinor.toString(),
        currency: value.currency,
        valid_from: value.validFrom,
        valid_until: value.validUntil,
        registered_by_user_id: value.registeredByUserId,
        registered_role: value.registeredRole,
        operation_id: value.operationId,
        created_at: value.createdAt,
      })
      .execute();
  },

  async endHomeEditionProjectedInvestment(tx, id, at) {
    const row = await tx
      .updateTable('app.home_edition_projected_investment')
      .set({ valid_until: at })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEditionProjectedInvestment(row);
  },
};
