import type { AuditRecord, CommandHandler } from '@/features/platform';
import type { Concept } from '../domain/catalog';
import {
  canApproveMedia,
  canWithdrawMedia,
  displayRenditions,
  mediaObjectKey,
  SUPERSEDED_COVER_BASIS,
  supportsFeatured,
  type ConceptCuration,
  type ConceptMedia,
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
  approveConceptMediaInput,
  setConceptCurationInput,
  uploadConceptCoverInput,
  withdrawConceptMediaInput,
  type ApproveConceptMediaInput,
  type SetConceptCurationInput,
  type UploadConceptCoverInput,
  type WithdrawConceptMediaInput,
} from './inputs';
import type { ProcessedRendition, StoredRendition } from './ports';
import {
  conceptCurationResult,
  conceptMediaResult,
  type ConceptCurationResult,
  type ConceptMediaResult,
} from './results';

/** Grava as versões no Storage antes do registro: chave por conteúdo, então repetir (nova tentativa) é inofensivo. */
async function storeRenditions<Tx>(
  deps: CatalogDependencies<Tx>,
  renditions: readonly ProcessedRendition[],
): Promise<StoredRendition[]> {
  return Promise.all(
    renditions.map(async ({ bytes, ...rendition }) => {
      const storageKey = mediaObjectKey(rendition.sha256);
      await deps.media.put(storageKey, bytes, rendition.contentType);
      return { ...rendition, byteSize: bytes.byteLength, storageKey };
    }),
  );
}

/**
 * `upload_concept_cover` (spec catalog §13.12, ADR-0015): reencoda a imagem e grava os binários no Storage antes de
 * qualquer trava; o banco registra a capa pendente com as referências e os metadados de cada versão. Só para marca em
 * uso (BR-021); a capa não aparece até ser aprovada.
 */
export function uploadConceptCoverHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<UploadConceptCoverInput, ConceptMediaResult, Tx> {
  return {
    command: 'upload_concept_cover',
    input: uploadConceptCoverInput,
    async execute({ input, operationId, now, tx, audit }) {
      const concept = found(await deps.store.concept(tx, input.concept_id));
      const image = validated(await deps.images.process(input.image));
      const renditions = await storeRenditions(deps, image.renditions);
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'share', now);
      const media: ConceptMedia = {
        id: deps.newId(),
        conceptId: concept.id,
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
      await deps.store.insertConceptMedia(tx, media, renditions);
      const result = conceptMediaResult(media);
      audit({ objectType: 'concept_media', objectId: media.id, before: null, after: result });
      return result;
    },
  };
}

/** Mídia e Concept, com a Brand Partner travada (exclusiva) e a mídia relida depois da trava. */
async function lockedMedia<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  mediaId: string,
  lock: (concept: Concept) => Promise<unknown>,
): Promise<{ readonly media: ConceptMedia; readonly concept: Concept }> {
  const initial = found(await deps.store.conceptMedia(tx, mediaId));
  const concept = found(await deps.store.concept(tx, initial.conceptId));
  await lock(concept);
  // Relida depois da trava: outra aprovação ou retirada pode ter terminado enquanto esperávamos.
  return { media: found(await deps.store.conceptMedia(tx, mediaId)), concept };
}

/**
 * `approve_concept_media`: pendente → aprovada. Um Concept tem uma capa vigente: a aprovada anterior é retirada na mesma
 * operação, antes da nova (índice único do banco). Aprovar expõe a marca: exige marca em uso (BR-021).
 */
export function approveConceptMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<ApproveConceptMediaInput, ConceptMediaResult, Tx> {
  return {
    command: 'approve_concept_media',
    input: approveConceptMediaInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'approve_concept_media');
      const { media, concept } = await lockedMedia(deps, tx, input.concept_media_id, (target) =>
        lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(canApproveMedia(media));
      const previous = await deps.store.currentCover(tx, concept.id);
      if (previous !== null) {
        const withdrawn = await deps.store.withdrawConceptMedia(tx, previous.id, {
          at: now,
          basis: SUPERSEDED_COVER_BASIS,
          operationId,
        });
        audit({
          objectType: 'concept_media',
          objectId: previous.id,
          before: conceptMediaResult(previous),
          after: conceptMediaResult(withdrawn),
        });
      }
      const approved = await deps.store.approveConceptMedia(tx, media.id, {
        at: now,
        byUserId: staff.userId,
        role: staff.role,
        operationId,
      });
      const result = conceptMediaResult(approved);
      audit({
        objectType: 'concept_media',
        objectId: media.id,
        before: conceptMediaResult(media),
        after: result,
      });
      // A capa nova pode servir ao card sem sustentar o destaque: nunca promovida além da qualidade que suporta.
      if (!supportsFeatured(displayRenditions(approved))) {
        await unfeature(deps, tx, concept.id, { operationId, now, audit });
      }
      return result;
    },
  };
}

/** Tira o destaque do Concept, se houver, com auditoria (retirada da capa ou capa nova sem resolução de destaque). */
async function unfeature<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  conceptId: string,
  context: {
    readonly operationId: string;
    readonly now: Date;
    readonly audit: (record: AuditRecord) => void;
  },
): Promise<void> {
  const curation = await deps.store.conceptCuration(tx, conceptId);
  if (curation?.featured !== true) return;
  const unfeatured: ConceptCuration = {
    ...curation,
    featured: false,
    operationId: context.operationId,
    updatedAt: context.now,
  };
  await deps.store.saveConceptCuration(tx, unfeatured);
  context.audit({
    objectType: 'concept_curation',
    objectId: conceptId,
    before: conceptCurationResult(curation),
    after: conceptCurationResult(unfeatured),
  });
}

/**
 * `withdraw_concept_media`: pendente ou aprovada → retirada, com base. Vale mesmo com a marca encerrada (reduz a
 * exposição). Sem capa vigente, o Concept deixa de ser destaque na mesma operação.
 */
export function withdrawConceptMediaHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<WithdrawConceptMediaInput, ConceptMediaResult, Tx> {
  return {
    command: 'withdraw_concept_media',
    input: withdrawConceptMediaInput,
    async execute({ input, operationId, now, tx, audit }) {
      const { media, concept } = await lockedMedia(deps, tx, input.concept_media_id, (target) =>
        lockBrand(deps.store, tx, target.brandPartnerId),
      );
      requireState(canWithdrawMedia(media));
      const withdrawn = await deps.store.withdrawConceptMedia(tx, media.id, {
        at: now,
        basis: input.withdrawal_basis,
        operationId,
      });
      if (media.state === 'approved')
        await unfeature(deps, tx, concept.id, { operationId, now, audit });
      const result = conceptMediaResult(withdrawn);
      audit({
        objectType: 'concept_media',
        objectId: media.id,
        before: conceptMediaResult(media),
        after: result,
      });
      return result;
    },
  };
}

/**
 * `set_concept_curation`: posição na curadoria e destaque editorial explícito. Destaque exige capa aprovada; marcar um
 * novo tira o destaque do anterior na mesma operação (no máximo um), serializado pela trava do destaque.
 */
export function setConceptCurationHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<SetConceptCurationInput, ConceptCurationResult, Tx> {
  return {
    command: 'set_concept_curation',
    input: setConceptCurationInput,
    async execute({ input, operationId, now, tx, audit }) {
      const concept = found(await deps.store.concept(tx, input.concept_id));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'exclusive', now);
      if (input.featured) {
        // Destaque só com capa aprovada que sustente o quadro de destaque em DPR 2 (spec §13.12).
        const cover = await deps.store.currentCover(tx, concept.id);
        requireState(cover !== null && supportsFeatured(displayRenditions(cover)));
        await deps.store.lockFeaturedSlot(tx);
        const previous = await deps.store.featuredCuration(tx);
        if (previous !== null && previous.conceptId !== concept.id) {
          const unfeatured = { ...previous, featured: false, operationId, updatedAt: now };
          await deps.store.saveConceptCuration(tx, unfeatured);
          audit({
            objectType: 'concept_curation',
            objectId: previous.conceptId,
            before: conceptCurationResult(previous),
            after: conceptCurationResult(unfeatured),
          });
        }
      }
      const before = await deps.store.conceptCuration(tx, concept.id);
      const curation: ConceptCuration = {
        conceptId: concept.id,
        rank: input.rank,
        featured: input.featured,
        operationId,
        updatedAt: now,
      };
      await deps.store.saveConceptCuration(tx, curation);
      const result = conceptCurationResult(curation);
      audit({
        objectType: 'concept_curation',
        objectId: concept.id,
        before: before === null ? null : conceptCurationResult(before),
        after: result,
      });
      return result;
    },
  };
}
