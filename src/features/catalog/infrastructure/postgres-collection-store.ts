import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { CatalogStore } from '../application/ports';
import { toCatalogTerm, toConceptCuration, toConceptMedia, toEditionReferenceValue } from './rows';

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
  | 'conceptMedia'
  | 'currentCover'
  | 'insertConceptMedia'
  | 'approveConceptMedia'
  | 'withdrawConceptMedia'
  | 'conceptCuration'
  | 'lockFeaturedSlot'
  | 'featuredCuration'
  | 'saveConceptCuration'
  | 'editionReferenceValue'
  | 'editionReferenceValues'
  | 'insertEditionReferenceValue'
  | 'endEditionReferenceValue'
>;

/** Chave da trava consultiva que serializa a troca do destaque (no máximo um Concept em destaque). */
const FEATURED_SLOT_LOCK = 'app.concept_curation.featured';

function mediaFiles(tx: Tx, mediaId: string) {
  return tx
    .selectFrom('app.concept_media_file')
    .select(['role', 'width', 'height'])
    .where('media_id', '=', mediaId)
    .orderBy('width')
    .execute();
}

async function mediaWhere(
  tx: Tx,
  column: 'id' | 'concept_id',
  value: string,
  approvedOnly: boolean,
) {
  let query = tx.selectFrom('app.concept_media').selectAll().where(column, '=', value);
  if (approvedOnly) query = query.where('state', '=', 'approved');
  const row = await query.executeTakeFirst();
  return row === undefined ? null : toConceptMedia(row, await mediaFiles(tx, row.id));
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

  conceptMedia: (tx, id) => mediaWhere(tx, 'id', id, false),

  currentCover: (tx, conceptId) => mediaWhere(tx, 'concept_id', conceptId, true),

  async insertConceptMedia(tx, media, renditions) {
    await tx
      .insertInto('app.concept_media')
      .values({
        id: media.id,
        concept_id: media.conceptId,
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
      .insertInto('app.concept_media_file')
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

  async approveConceptMedia(tx, id, approval) {
    const row = await tx
      .updateTable('app.concept_media')
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
    return toConceptMedia(row, await mediaFiles(tx, id));
  },

  async withdrawConceptMedia(tx, id, withdrawal) {
    const row = await tx
      .updateTable('app.concept_media')
      .set({
        state: 'withdrawn',
        withdrawn_at: withdrawal.at,
        withdrawal_basis: withdrawal.basis,
        withdrawal_operation_id: withdrawal.operationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toConceptMedia(row, await mediaFiles(tx, id));
  },

  async conceptCuration(tx, conceptId) {
    const row = await tx
      .selectFrom('app.concept_curation')
      .selectAll()
      .where('concept_id', '=', conceptId)
      .executeTakeFirst();
    return row === undefined ? null : toConceptCuration(row);
  },

  async lockFeaturedSlot(tx) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${FEATURED_SLOT_LOCK}, 0))`.execute(tx);
  },

  async featuredCuration(tx) {
    const row = await tx
      .selectFrom('app.concept_curation')
      .selectAll()
      .where('featured', '=', true)
      .executeTakeFirst();
    return row === undefined ? null : toConceptCuration(row);
  },

  async saveConceptCuration(tx, curation) {
    const change = {
      rank: curation.rank,
      featured: curation.featured,
      operation_id: curation.operationId,
      updated_at: curation.updatedAt,
    };
    await tx
      .insertInto('app.concept_curation')
      .values({ concept_id: curation.conceptId, ...change })
      .onConflict((conflict) => conflict.column('concept_id').doUpdateSet(change))
      .execute();
  },

  async editionReferenceValue(tx, id) {
    const row = await tx
      .selectFrom('app.edition_reference_value')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toEditionReferenceValue(row);
  },

  async editionReferenceValues(tx, { editionId, basis, currency }) {
    const rows = await tx
      .selectFrom('app.edition_reference_value')
      .selectAll()
      .where('edition_id', '=', editionId)
      .where('basis', '=', basis)
      .where('currency', '=', currency)
      .orderBy('valid_from')
      .execute();
    return rows.map(toEditionReferenceValue);
  },

  async insertEditionReferenceValue(tx, value) {
    await tx
      .insertInto('app.edition_reference_value')
      .values({
        id: value.id,
        edition_id: value.editionId,
        basis: value.basis,
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

  async endEditionReferenceValue(tx, id, at) {
    const row = await tx
      .updateTable('app.edition_reference_value')
      .set({ valid_until: at })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toEditionReferenceValue(row);
  },
};
