import type { AuditRecord, CommandHandler } from '@/features/platform';
import type { HomeConcept } from '../domain/catalog';
import {
  canApproveMedia,
  canWithdrawMedia,
  displayRenditions,
  mediaObjectKey,
  SUPERSEDED_COVER_BASIS,
  supportsFeatured,
  type HomeConceptCuration,
  type MediaOwner,
  type HomeConceptMedia,
} from '../domain/collection';
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
  approveHomeConceptMediaInput,
  setHomeConceptCurationInput,
  uploadHomeConceptCoverInput,
  withdrawHomeConceptMediaInput,
  type ApproveHomeConceptMediaInput,
  type SetHomeConceptCurationInput,
  type UploadHomeConceptCoverInput,
  type WithdrawHomeConceptMediaInput,
} from './inputs';
import type { ProcessedRendition, StoredRendition } from './ports';
import {
  homeConceptCurationResult,
  homeConceptMediaResult,
  type HomeConceptCurationResult,
  type HomeConceptMediaResult,
} from './results';

/** Grava as versões no Storage antes do registro: chave por conteúdo, então repetir (nova tentativa) é inofensivo. */
export async function storeRenditions<Tx>(
  deps: CatalogDependencies<Tx>,
  renditions: readonly ProcessedRendition[],
  owner: MediaOwner,
): Promise<StoredRendition[]> {
  return Promise.all(
    renditions.map(async ({ bytes, ...rendition }) => {
      const storageKey = mediaObjectKey(owner, rendition.sha256);
      await deps.media.put(storageKey, bytes, rendition.contentType);
      return { ...rendition, byteSize: bytes.byteLength, storageKey };
    }),
  );
}

/**
 * `upload_home_concept_cover` (spec catalog §13.12, ADR-0015): reencoda a imagem e grava os binários no Storage antes de
 * qualquer trava; o banco registra a capa pendente com as referências e os metadados de cada versão. Só para marca em
 * uso (BR-021); a capa não aparece até ser aprovada.
 */
export function uploadHomeConceptCoverHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<UploadHomeConceptCoverInput, HomeConceptMediaResult, Tx> {
  return {
    command: 'upload_home_concept_cover',
    input: uploadHomeConceptCoverInput,
    async execute({ input, operationId, now, tx, audit }) {
      const homeConcept = found(await deps.store.homeConcept(tx, input.home_concept_id));
      const image = validated(await deps.images.process(input.image));
      const renditions = await storeRenditions(deps, image.renditions, 'homeConcept');
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'share', now);
      const media: HomeConceptMedia = {
        id: deps.newId(),
        homeConceptId: homeConcept.id,
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
      await deps.store.insertHomeConceptMedia(tx, media, renditions);
      const result = homeConceptMediaResult(media);
      audit({ objectType: 'home_concept_media', objectId: media.id, before: null, after: result });
      return result;
    },
  };
}

/** Mídia e Home Concept, com a Brand Partner travada (exclusiva) e a mídia relida depois da trava. */
async function lockedMedia<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  mediaId: string,
  lock: (homeConcept: HomeConcept) => Promise<unknown>,
): Promise<{ readonly media: HomeConceptMedia; readonly homeConcept: HomeConcept }> {
  const initial = found(await deps.store.homeConceptMedia(tx, mediaId));
  const homeConcept = found(await deps.store.homeConcept(tx, initial.homeConceptId));
  await lock(homeConcept);
  // Relida depois da trava: outra aprovação ou retirada pode ter terminado enquanto esperávamos.
  return { media: found(await deps.store.homeConceptMedia(tx, mediaId)), homeConcept };
}

/**
 * `approve_home_concept_media`: pendente → aprovada. Um Home Concept tem uma capa vigente: a aprovada anterior é retirada na mesma
 * operação, antes da nova (índice único do banco). Aprovar expõe a marca: exige marca em uso (BR-021).
 */
export function approveHomeConceptMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<ApproveHomeConceptMediaInput, HomeConceptMediaResult, Tx> {
  return {
    command: 'approve_home_concept_media',
    input: approveHomeConceptMediaInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'approve_home_concept_media');
      const { media, homeConcept } = await lockedMedia(
        deps,
        tx,
        input.home_concept_media_id,
        (target) => lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(canApproveMedia(media));
      const previous = await deps.store.currentCover(tx, homeConcept.id);
      if (previous !== null) {
        const withdrawn = await deps.store.withdrawHomeConceptMedia(tx, previous.id, {
          at: now,
          basis: SUPERSEDED_COVER_BASIS,
          operationId,
        });
        audit({
          objectType: 'home_concept_media',
          objectId: previous.id,
          before: homeConceptMediaResult(previous),
          after: homeConceptMediaResult(withdrawn),
        });
      }
      const approved = await deps.store.approveHomeConceptMedia(tx, media.id, {
        at: now,
        byUserId: staff.userId,
        role: staff.role,
        operationId,
      });
      const result = homeConceptMediaResult(approved);
      audit({
        objectType: 'home_concept_media',
        objectId: media.id,
        before: homeConceptMediaResult(media),
        after: result,
      });
      // A capa nova pode servir ao card sem sustentar o destaque: nunca promovida além da qualidade que suporta.
      if (!supportsFeatured(displayRenditions(approved))) {
        await unfeature(deps, tx, homeConcept.id, { operationId, now, audit });
      }
      return result;
    },
  };
}

/** Tira o destaque do Home Concept, se houver, com auditoria (retirada da capa ou capa nova sem resolução de destaque). */
async function unfeature<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  homeConceptId: string,
  context: {
    readonly operationId: string;
    readonly now: Date;
    readonly audit: (record: AuditRecord) => void;
  },
): Promise<void> {
  const curation = await deps.store.homeConceptCuration(tx, homeConceptId);
  if (curation?.featured !== true) return;
  const unfeatured: HomeConceptCuration = {
    ...curation,
    featured: false,
    operationId: context.operationId,
    updatedAt: context.now,
  };
  await deps.store.saveHomeConceptCuration(tx, unfeatured);
  context.audit({
    objectType: 'home_concept_curation',
    objectId: homeConceptId,
    before: homeConceptCurationResult(curation),
    after: homeConceptCurationResult(unfeatured),
  });
}

/**
 * `withdraw_home_concept_media`: pendente ou aprovada → retirada, com base. Vale mesmo com a marca encerrada (reduz a
 * exposição). Sem capa vigente, o Home Concept deixa de ser destaque na mesma operação.
 */
export function withdrawHomeConceptMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<WithdrawHomeConceptMediaInput, HomeConceptMediaResult, Tx> {
  return {
    command: 'withdraw_home_concept_media',
    input: withdrawHomeConceptMediaInput,
    async execute({ input, operationId, now, tx, audit }) {
      const { media, homeConcept } = await lockedMedia(
        deps,
        tx,
        input.home_concept_media_id,
        (target) => lockBrand(deps.store, tx, target.brandPartnerId),
      );
      requireState(canWithdrawMedia(media));
      const withdrawn = await deps.store.withdrawHomeConceptMedia(tx, media.id, {
        at: now,
        basis: input.withdrawal_basis,
        operationId,
      });
      if (media.state === 'approved')
        await unfeature(deps, tx, homeConcept.id, { operationId, now, audit });
      const result = homeConceptMediaResult(withdrawn);
      audit({
        objectType: 'home_concept_media',
        objectId: media.id,
        before: homeConceptMediaResult(media),
        after: result,
      });
      return result;
    },
  };
}

/**
 * `set_home_concept_curation`: posição na curadoria e destaque editorial explícito. Destaque exige capa aprovada; marcar um
 * novo tira o destaque do anterior na mesma operação (no máximo um), serializado pela trava do destaque.
 */
export function setHomeConceptCurationHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<SetHomeConceptCurationInput, HomeConceptCurationResult, Tx> {
  return {
    command: 'set_home_concept_curation',
    input: setHomeConceptCurationInput,
    async execute({ input, operationId, now, tx, audit }) {
      const homeConcept = found(await deps.store.homeConcept(tx, input.home_concept_id));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'exclusive', now);
      if (input.featured) {
        // Destaque só com capa aprovada que sustente o quadro de destaque em DPR 2 (spec §13.12).
        const cover = await deps.store.currentCover(tx, homeConcept.id);
        requireState(cover !== null && supportsFeatured(displayRenditions(cover)));
        await deps.store.lockFeaturedSlot(tx);
        const previous = await deps.store.featuredCuration(tx);
        if (previous !== null && previous.homeConceptId !== homeConcept.id) {
          const unfeatured = { ...previous, featured: false, operationId, updatedAt: now };
          await deps.store.saveHomeConceptCuration(tx, unfeatured);
          audit({
            objectType: 'home_concept_curation',
            objectId: previous.homeConceptId,
            before: homeConceptCurationResult(previous),
            after: homeConceptCurationResult(unfeatured),
          });
        }
      }
      const before = await deps.store.homeConceptCuration(tx, homeConcept.id);
      const curation: HomeConceptCuration = {
        homeConceptId: homeConcept.id,
        rank: input.rank,
        featured: input.featured,
        operationId,
        updatedAt: now,
      };
      await deps.store.saveHomeConceptCuration(tx, curation);
      const result = homeConceptCurationResult(curation);
      audit({
        objectType: 'home_concept_curation',
        objectId: homeConcept.id,
        before: before === null ? null : homeConceptCurationResult(before),
        after: result,
      });
      return result;
    },
  };
}
