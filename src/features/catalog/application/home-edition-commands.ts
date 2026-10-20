import type { CommandHandler } from '@/features/platform';
import {
  canCorrectEditorial,
  canFinalize,
  canPublish,
  canWithdraw,
  isInPreparation,
  type HomeConcept,
  type HomeEdition,
  type HomeEditionEditorial,
  type HomeEditionMaterial,
} from '../domain/catalog';
import {
  type CatalogDependencies,
  found,
  lockBrand,
  lockBrandInUse,
  presentInState,
  requireState,
  requireValid,
  staffActor,
} from './command-support';
import {
  correctHomeEditionEditorialInput,
  createHomeEditionInput,
  finalizeHomeEditionInput,
  publishHomeEditionInput,
  updateHomeEditionDraftInput,
  withdrawHomeEditionInput,
  type CorrectHomeEditionEditorialInput,
  type CreateHomeEditionInput,
  type FinalizeHomeEditionInput,
  type PublishHomeEditionInput,
  type UpdateHomeEditionDraftInput,
  type WithdrawHomeEditionInput,
} from './inputs';
import { homeEditionResult, type HomeEditionResult } from './results';

/**
 * Snapshot da auditoria (TECH-092): a chave `name` é sempre redigida como possível dado pessoal; o nome da Home Edition é
 * texto de produto e entra como `home_edition_name`, para o antes e o depois da correção editorial ficarem auditáveis.
 */
function audited(result: HomeEditionResult) {
  const { name, ...rest } = result;
  return { ...rest, home_edition_name: name };
}

/**
 * Ciclo da Home Edition (spec catalog §17.3, ADR-0019 §3; `02` v4.3 REQ-022, BR-036): preparação editável, finalização
 * material uma vez e sem volta, visibilidade pública separada e correção editorial. Toda mudança trava a Brand Partner
 * (ADR-0010 §8) e relê a Home Edition depois da trava; o banco reforça as transições em qualquer caminho.
 */
type Content = CreateHomeEditionInput | UpdateHomeEditionDraftInput;

function material(content: Content): HomeEditionMaterial & HomeEditionEditorial {
  return {
    name: content.name,
    description: content.description,
    typology: content.typology,
    spatialConfiguration: content.spatial_configuration,
    projectedAreaM2: content.projected_area_m2,
    suites: content.suites,
    guestsMax: content.guests_max,
    rooms: content.rooms ?? null,
    amenities: content.amenities ?? null,
    characteristics: content.characteristics ?? null,
  };
}

/** Home Edition e Home Concept, com a Brand Partner travada e a Home Edition relida depois da trava. */
async function lockedHomeEdition<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  id: string,
  lock: (homeConcept: HomeConcept) => Promise<unknown>,
): Promise<{ readonly homeEdition: HomeEdition; readonly homeConcept: HomeConcept }> {
  const initial = found(await deps.store.homeEdition(tx, id));
  const homeConcept = found(await deps.store.homeConcept(tx, initial.homeConceptId));
  await lock(homeConcept);
  return { homeEdition: found(await deps.store.homeEdition(tx, id, 'exclusive')), homeConcept };
}

/**
 * `create_home_edition` (BR-031): Home Edition em preparação (`draft`) e fora do público (`hidden`), só para Home
 * Concept com versão aprovada e marca em uso (BR-003, BR-021). Sem localização, modalidade nem condições comerciais.
 */
export function createHomeEditionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CreateHomeEditionInput, HomeEditionResult, Tx> {
  return {
    command: 'create_home_edition',
    input: createHomeEditionInput,
    async execute({ input, operationId, now, tx, audit }) {
      const homeConcept = found(await deps.store.homeConcept(tx, input.home_concept_id));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'share', now);
      presentInState(await deps.store.currentApprovedVersion(tx, homeConcept.id));
      const homeEdition: HomeEdition = {
        id: deps.newId(),
        homeConceptId: homeConcept.id,
        ...material(input),
        materialState: 'draft',
        finalization: null,
        visibility: 'hidden',
        withdrawalBasis: null,
        operationId,
        createdAt: now,
      };
      await deps.store.insertHomeEdition(tx, homeEdition);
      const result = homeEditionResult(homeEdition);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: null,
        after: audited(result),
      });
      return result;
    },
  };
}

/** `update_home_edition_draft`: completa e corrige a preparação; depois da finalização, recusado (BR-036). */
export function updateHomeEditionDraftHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<UpdateHomeEditionDraftInput, HomeEditionResult, Tx> {
  return {
    command: 'update_home_edition_draft',
    input: updateHomeEditionDraftInput,
    async execute({ input, now, tx, audit }) {
      const { homeEdition } = await lockedHomeEdition(deps, tx, input.home_edition_id, (target) =>
        lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(isInPreparation(homeEdition));
      const updated = await deps.store.updateHomeEditionDraft(tx, homeEdition.id, material(input));
      const result = homeEditionResult(updated);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: audited(homeEditionResult(homeEdition)),
        after: audited(result),
      });
      return result;
    },
  };
}

/**
 * `finalize_home_edition` (BR-036): marco de estabilização, uma vez e sem volta — a definição material passa a ser
 * imutável e a Home Edition pode originar Second Homes e ser publicada. Exige marca em uso e versão aprovada.
 */
export function finalizeHomeEditionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<FinalizeHomeEditionInput, HomeEditionResult, Tx> {
  return {
    command: 'finalize_home_edition',
    input: finalizeHomeEditionInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'finalize_home_edition');
      const { homeEdition, homeConcept } = await lockedHomeEdition(
        deps,
        tx,
        input.home_edition_id,
        (target) => lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(canFinalize(homeEdition));
      presentInState(await deps.store.currentApprovedVersion(tx, homeConcept.id));
      const finalized = await deps.store.finalizeHomeEdition(tx, homeEdition.id, {
        at: now,
        byUserId: staff.userId,
        role: staff.role,
        operationId,
      });
      const result = homeEditionResult(finalized);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: audited(homeEditionResult(homeEdition)),
        after: audited(result),
      });
      return result;
    },
  };
}

/** `publish_home_edition`: `hidden` → `public`; exige finalização, marca em uso e versão aprovada. */
export function publishHomeEditionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<PublishHomeEditionInput, HomeEditionResult, Tx> {
  return {
    command: 'publish_home_edition',
    input: publishHomeEditionInput,
    async execute({ input, now, tx, audit }) {
      const { homeEdition, homeConcept } = await lockedHomeEdition(
        deps,
        tx,
        input.home_edition_id,
        (target) => lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(canPublish(homeEdition));
      presentInState(await deps.store.currentApprovedVersion(tx, homeConcept.id));
      const published = await deps.store.setHomeEditionVisibility(tx, homeEdition.id, {
        visibility: 'public',
        withdrawalBasis: null,
      });
      const result = homeEditionResult(published);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: audited(homeEditionResult(homeEdition)),
        after: audited(result),
      });
      return result;
    },
  };
}

/**
 * `withdraw_home_edition`: `public` → `hidden`, com base; vale mesmo com a marca encerrada (reduz a exposição). Não
 * reabre a definição material e não toca Second Homes existentes (BR-025).
 */
export function withdrawHomeEditionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<WithdrawHomeEditionInput, HomeEditionResult, Tx> {
  return {
    command: 'withdraw_home_edition',
    input: withdrawHomeEditionInput,
    async execute({ input, tx, audit }) {
      const { homeEdition } = await lockedHomeEdition(deps, tx, input.home_edition_id, (target) =>
        lockBrand(deps.store, tx, target.brandPartnerId),
      );
      requireState(canWithdraw(homeEdition));
      const withdrawn = await deps.store.setHomeEditionVisibility(tx, homeEdition.id, {
        visibility: 'hidden',
        withdrawalBasis: input.withdrawal_basis,
      });
      const result = homeEditionResult(withdrawn);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: audited(homeEditionResult(homeEdition)),
        after: audited(result),
      });
      return result;
    },
  };
}

/**
 * `correct_home_edition_editorial` (BR-036): nome e/ou descrição de uma Home Edition finalizada, com base registrada no
 * `audit_log` (antes e depois). Nunca altera a definição material; sem mudança efetiva → `ERR_VALIDATION`.
 */
export function correctHomeEditionEditorialHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CorrectHomeEditionEditorialInput, HomeEditionResult, Tx> {
  return {
    command: 'correct_home_edition_editorial',
    input: correctHomeEditionEditorialInput,
    async execute({ input, now, tx, audit }) {
      const { homeEdition } = await lockedHomeEdition(deps, tx, input.home_edition_id, (target) =>
        lockBrandInUse(deps.store, tx, target.brandPartnerId, 'exclusive', now),
      );
      requireState(canCorrectEditorial(homeEdition));
      const editorial: HomeEditionEditorial = {
        name: input.name ?? homeEdition.name,
        description: input.description ?? homeEdition.description,
      };
      requireValid(
        editorial.name !== homeEdition.name || editorial.description !== homeEdition.description,
      );
      const corrected = await deps.store.correctHomeEditionEditorial(tx, homeEdition.id, editorial);
      const result = homeEditionResult(corrected);
      audit({
        objectType: 'home_edition',
        objectId: homeEdition.id,
        before: { ...audited(homeEditionResult(homeEdition)), correction_basis: null },
        after: { ...audited(result), correction_basis: input.correction_basis },
      });
      return result;
    },
  };
}
