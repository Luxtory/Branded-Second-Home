import type { DatabaseTransaction } from '@/features/platform';
import type { CatalogStore } from '../application/ports';
import { toHomeEditionMedia } from './rows';

/**
 * Mídia da Home Edition (spec catalog §17.3, ADR-0015) como `luxtory_app`, na transação do command: metadados e
 * referências das versões guardadas no Storage; os bytes nunca passam pelo banco.
 */
type Tx = DatabaseTransaction;

type HomeEditionMediaStore = Pick<
  CatalogStore<Tx>,
  | 'homeEditionMedia'
  | 'insertHomeEditionMedia'
  | 'approveHomeEditionMedia'
  | 'withdrawHomeEditionMedia'
>;

function mediaFiles(tx: Tx, mediaId: string) {
  return tx
    .selectFrom('app.home_edition_media_file')
    .select(['role', 'width', 'height'])
    .where('media_id', '=', mediaId)
    .orderBy('width')
    .execute();
}

export const postgresHomeEditionMediaStore: HomeEditionMediaStore = {
  async homeEditionMedia(tx, id) {
    const row = await tx
      .selectFrom('app.home_edition_media')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toHomeEditionMedia(row, await mediaFiles(tx, row.id));
  },

  async insertHomeEditionMedia(tx, media, renditions) {
    await tx
      .insertInto('app.home_edition_media')
      .values({
        id: media.id,
        home_edition_id: media.homeEditionId,
        kind: media.kind,
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
      .insertInto('app.home_edition_media_file')
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

  async approveHomeEditionMedia(tx, id, approval) {
    const row = await tx
      .updateTable('app.home_edition_media')
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
    return toHomeEditionMedia(row, await mediaFiles(tx, id));
  },

  async withdrawHomeEditionMedia(tx, id, withdrawal) {
    const row = await tx
      .updateTable('app.home_edition_media')
      .set({
        state: 'withdrawn',
        withdrawn_at: withdrawal.at,
        withdrawal_basis: withdrawal.basis,
        withdrawal_operation_id: withdrawal.operationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEditionMedia(row, await mediaFiles(tx, id));
  },
};
