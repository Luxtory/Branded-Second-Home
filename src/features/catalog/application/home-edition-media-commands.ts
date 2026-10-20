import type { CommandHandler } from '@/features/platform';
import type { HomeConcept } from '../domain/catalog';
import { canApproveMedia, canWithdrawMedia, type HomeEditionMedia } from '../domain/collection';
import {
  type CatalogDependencies,
  found,
  lockBrand,
  lockBrandInUse,
  requireState,
  staffActor,
  validated,
} from './command-support';
import {
  approveHomeEditionMediaInput,
  uploadHomeEditionMediaInput,
  withdrawHomeEditionMediaInput,
  type ApproveHomeEditionMediaInput,
  type UploadHomeEditionMediaInput,
  type WithdrawHomeEditionMediaInput,
} from './inputs';
import { storeRenditions } from './media-commands';
import { homeEditionMediaResult, type HomeEditionMediaResult } from './results';

/**
 * Mídia da Home Edition (spec catalog §17.3, ADR-0015): imagens, renders e plantas — gestão de mídia, não alteração
 * material (BR-036). Mesmo pipeline da capa do Home Concept; várias aprovadas ao mesmo tempo; em qualquer estado
 * material. Enviar e aprovar exigem marca em uso (BR-021); retirar vale sempre.
 */
export function uploadHomeEditionMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<UploadHomeEditionMediaInput, HomeEditionMediaResult, Tx> {
  return {
    command: 'upload_home_edition_media',
    input: uploadHomeEditionMediaInput,
    async execute({ input, operationId, now, tx, audit }) {
      const homeEdition = found(await deps.store.homeEdition(tx, input.home_edition_id));
      const homeConcept = found(await deps.store.homeConcept(tx, homeEdition.homeConceptId));
      const image = validated(await deps.images.process(input.image));
      const renditions = await storeRenditions(deps, image.renditions, 'homeEdition');
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'share', now);
      const media: HomeEditionMedia = {
        id: deps.newId(),
        homeEditionId: homeEdition.id,
        kind: input.kind,
        state: 'pending',
        alt: input.alt,
        credit: input.credit ?? null,
        cropX: input.crop_x,
        cropY: input.crop_y,
        sourceSha256: image.sourceSha256,
        renditions: renditions.map(({ role, width, height }) => ({ role, width, height })),
        approval: null,
        withdrawal: null,
        operationId,
        createdAt: now,
      };
      await deps.store.insertHomeEditionMedia(tx, media, renditions);
      const result = homeEditionMediaResult(media);
      audit({ objectType: 'home_edition_media', objectId: media.id, before: null, after: result });
      return result;
    },
  };
}

/** Mídia e Home Concept, com a Brand Partner travada e a mídia relida depois da trava. */
async function lockedMedia<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  mediaId: string,
  lock: (homeConcept: HomeConcept) => Promise<unknown>,
): Promise<HomeEditionMedia> {
  const initial = found(await deps.store.homeEditionMedia(tx, mediaId));
  const homeEdition = found(await deps.store.homeEdition(tx, initial.homeEditionId));
  await lock(found(await deps.store.homeConcept(tx, homeEdition.homeConceptId)));
  return found(await deps.store.homeEditionMedia(tx, mediaId));
}

/** `approve_home_edition_media`: pendente → aprovada; pública só com a Home Edition pública. */
export function approveHomeEditionMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<ApproveHomeEditionMediaInput, HomeEditionMediaResult, Tx> {
  return {
    command: 'approve_home_edition_media',
    input: approveHomeEditionMediaInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'approve_home_edition_media');
      const media = await lockedMedia(deps, tx, input.home_edition_media_id, (homeConcept) =>
        lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'exclusive', now),
      );
      requireState(canApproveMedia(media));
      const approved = await deps.store.approveHomeEditionMedia(tx, media.id, {
        at: now,
        byUserId: staff.userId,
        role: staff.role,
        operationId,
      });
      const result = homeEditionMediaResult(approved);
      audit({
        objectType: 'home_edition_media',
        objectId: media.id,
        before: homeEditionMediaResult(media),
        after: result,
      });
      return result;
    },
  };
}

/** `withdraw_home_edition_media`: pendente ou aprovada → retirada, com base; vale mesmo com a marca encerrada. */
export function withdrawHomeEditionMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<WithdrawHomeEditionMediaInput, HomeEditionMediaResult, Tx> {
  return {
    command: 'withdraw_home_edition_media',
    input: withdrawHomeEditionMediaInput,
    async execute({ input, operationId, now, tx, audit }) {
      const media = await lockedMedia(deps, tx, input.home_edition_media_id, (homeConcept) =>
        lockBrand(deps.store, tx, homeConcept.brandPartnerId),
      );
      requireState(canWithdrawMedia(media));
      const withdrawn = await deps.store.withdrawHomeEditionMedia(tx, media.id, {
        at: now,
        basis: input.withdrawal_basis,
        operationId,
      });
      const result = homeEditionMediaResult(withdrawn);
      audit({
        objectType: 'home_edition_media',
        objectId: media.id,
        before: homeEditionMediaResult(media),
        after: result,
      });
      return result;
    },
  };
}
