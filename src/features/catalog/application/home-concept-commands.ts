import { CommandRejection, type AuditRecord, type CommandHandler } from '@/features/platform';
import { canApprove, type HomeConcept, type HomeConceptVersion } from '../domain/catalog';
import type { CatalogTermKind } from '../domain/collection';
import {
  type CatalogDependencies,
  found,
  lockBrandInUse,
  requireState,
  staffActor,
} from './command-support';
import {
  approveHomeConceptVersionInput,
  createHomeConceptVersionInput,
  type ApproveHomeConceptVersionInput,
  type CreateHomeConceptVersionInput,
} from './inputs';
import {
  homeConceptResult,
  homeConceptVersionResult,
  type HomeConceptVersionResult,
} from './results';

type VersionContent = Omit<
  CreateHomeConceptVersionInput,
  'brand_partner_id' | 'title' | 'home_concept_id'
>;

function newVersion(
  id: string,
  homeConceptId: string,
  number: number,
  content: VersionContent,
  operationId: string,
  now: Date,
): HomeConceptVersion {
  return {
    id,
    homeConceptId,
    version: number,
    essentialElements: content.essential_elements,
    preservationPremises: content.preservation_premises,
    specification: content.specification,
    attributes: {
      summary: content.summary ?? null,
    },
    lifestyleIds: content.lifestyle_ids ?? [],
    architecturalStyleIds: content.architectural_style_ids ?? [],
    state: 'not_approved',
    approval: null,
    operationId,
    createdAt: now,
  };
}

const versionAudit = (version: HomeConceptVersion, homeConcept: HomeConcept): AuditRecord => ({
  objectType: 'home_concept_version',
  objectId: version.id,
  before: null,
  after: homeConceptVersionResult(version, homeConcept),
});

/**
 * Classificações da versão (spec §13.12): cada id é um termo do vocabulário da posição (senão `ERR_NOT_FOUND`) e ativo
 * (senão `ERR_STATE_TRANSITION`). A trava `share` impede a desativação concorrente até o commit.
 */
async function requireActiveTerms<Tx>(
  deps: CatalogDependencies<Tx>,
  tx: Tx,
  content: VersionContent,
): Promise<void> {
  const wanted: readonly (readonly [string, CatalogTermKind])[] = [
    ...(content.lifestyle_ids ?? []).map((id) => [id, 'lifestyle'] as const),
    ...(content.architectural_style_ids ?? []).map((id) => [id, 'architectural_style'] as const),
  ];
  if (wanted.length === 0) return;
  const terms = await deps.store.catalogTerms(
    tx,
    wanted.map(([id]) => id),
    'share',
  );
  for (const [id, kind] of wanted) {
    const term = terms.find((candidate) => candidate.id === id && candidate.kind === kind);
    if (term === undefined) throw new CommandRejection('ERR_NOT_FOUND');
    requireState(term.active);
  }
}

/**
 * `create_home_concept_version` (BR-013, BR-014): sem `home_concept_id`, registra o Home Concept com a versão 1; com `home_concept_id`, a
 * versão seguinte. A trava exclusiva da Brand Partner serializa a numeração. Toda versão nasce "Não aprovado".
 */
export function createHomeConceptVersionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CreateHomeConceptVersionInput, HomeConceptVersionResult, Tx> {
  return {
    command: 'create_home_concept_version',
    input: createHomeConceptVersionInput,
    async execute({ input, operationId, now, tx, audit }) {
      let homeConcept: HomeConcept;
      let number = 1;
      if ('home_concept_id' in input) {
        homeConcept = found(await deps.store.homeConcept(tx, input.home_concept_id));
        await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'exclusive', now);
        number = ((await deps.store.latestVersionNumber(tx, homeConcept.id)) ?? 0) + 1;
      } else {
        await lockBrandInUse(deps.store, tx, input.brand_partner_id, 'share', now);
        homeConcept = {
          id: deps.newId(),
          brandPartnerId: input.brand_partner_id,
          title: input.title,
          operationId,
          createdAt: now,
        };
        await deps.store.insertHomeConcept(tx, homeConcept);
        audit({
          objectType: 'home_concept',
          objectId: homeConcept.id,
          before: null,
          after: homeConceptResult(homeConcept),
        });
      }
      await requireActiveTerms(deps, tx, input);
      const version = newVersion(deps.newId(), homeConcept.id, number, input, operationId, now);
      await deps.store.insertHomeConceptVersion(tx, version);
      audit(versionAudit(version, homeConcept));
      return homeConceptVersionResult(version, homeConcept);
    },
  };
}

/**
 * `approve_home_concept_version` (REQ-096, BR-010, BR-018): só uma versão não aprovada e maior que a vigente, com as
 * referências das aprovações. A trava exclusiva da Brand Partner serializa aprovações e registros de Second Home.
 */
export function approveHomeConceptVersionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<ApproveHomeConceptVersionInput, HomeConceptVersionResult, Tx> {
  return {
    command: 'approve_home_concept_version',
    input: approveHomeConceptVersionInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'approve_home_concept_version');
      const initial = found(await deps.store.homeConceptVersion(tx, input.home_concept_version_id));
      const homeConcept = found(await deps.store.homeConcept(tx, initial.homeConceptId));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'exclusive', now);
      // Relida depois da trava: outra aprovação pode ter terminado enquanto esperávamos.
      const target = found(await deps.store.homeConceptVersion(tx, input.home_concept_version_id));
      requireState(canApprove(target, await deps.store.currentApprovedVersion(tx, homeConcept.id)));
      const approved = await deps.store.approveHomeConceptVersion(tx, target.id, {
        approvalRefs: input.approval_refs,
        approvedAt: now,
        approvedByUserId: staff.userId,
        approvedRole: staff.role,
        approvalOperationId: operationId,
      });
      const result = homeConceptVersionResult(approved, homeConcept);
      audit({
        objectType: 'home_concept_version',
        objectId: target.id,
        before: homeConceptVersionResult(target, homeConcept),
        after: result,
      });
      return result;
    },
  };
}
