import { CommandRejection, type AuditRecord, type CommandHandler } from '@/features/platform';
import { canApprove, type Concept, type ConceptVersion } from '../domain/catalog';
import type { CatalogTermKind } from '../domain/collection';
import {
  type CatalogDependencies,
  found,
  lockBrandInUse,
  requireState,
  staffActor,
} from './command-support';
import {
  approveConceptVersionInput,
  createConceptVersionInput,
  type ApproveConceptVersionInput,
  type CreateConceptVersionInput,
} from './inputs';
import { conceptResult, conceptVersionResult, type ConceptVersionResult } from './results';

type VersionContent = Omit<CreateConceptVersionInput, 'brand_partner_id' | 'title' | 'concept_id'>;

function newVersion(
  id: string,
  conceptId: string,
  number: number,
  content: VersionContent,
  operationId: string,
  now: Date,
): ConceptVersion {
  return {
    id,
    conceptId,
    version: number,
    essentialElements: content.essential_elements,
    preservationPremises: content.preservation_premises,
    specification: content.specification,
    attributes: {
      summary: content.summary ?? null,
      guestsMax: content.guests_max ?? null,
      suites: content.suites ?? null,
      builtAreaM2: content.built_area_m2 ?? null,
    },
    lifestyleIds: content.lifestyle_ids ?? [],
    architecturalStyleIds: content.architectural_style_ids ?? [],
    state: 'not_approved',
    approval: null,
    operationId,
    createdAt: now,
  };
}

const versionAudit = (version: ConceptVersion, concept: Concept): AuditRecord => ({
  objectType: 'concept_version',
  objectId: version.id,
  before: null,
  after: conceptVersionResult(version, concept),
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
 * `create_concept_version` (BR-013, BR-014): sem `concept_id`, registra o Concept com a versão 1; com `concept_id`, a
 * versão seguinte. A trava exclusiva da Brand Partner serializa a numeração. Toda versão nasce "Não aprovado".
 */
export function createConceptVersionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CreateConceptVersionInput, ConceptVersionResult, Tx> {
  return {
    command: 'create_concept_version',
    input: createConceptVersionInput,
    async execute({ input, operationId, now, tx, audit }) {
      let concept: Concept;
      let number = 1;
      if ('concept_id' in input) {
        concept = found(await deps.store.concept(tx, input.concept_id));
        await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'exclusive', now);
        number = ((await deps.store.latestVersionNumber(tx, concept.id)) ?? 0) + 1;
      } else {
        await lockBrandInUse(deps.store, tx, input.brand_partner_id, 'share', now);
        concept = {
          id: deps.newId(),
          brandPartnerId: input.brand_partner_id,
          title: input.title,
          operationId,
          createdAt: now,
        };
        await deps.store.insertConcept(tx, concept);
        audit({
          objectType: 'concept',
          objectId: concept.id,
          before: null,
          after: conceptResult(concept),
        });
      }
      await requireActiveTerms(deps, tx, input);
      const version = newVersion(deps.newId(), concept.id, number, input, operationId, now);
      await deps.store.insertConceptVersion(tx, version);
      audit(versionAudit(version, concept));
      return conceptVersionResult(version, concept);
    },
  };
}

/**
 * `approve_concept_version` (REQ-096, BR-010, BR-018): só uma versão não aprovada e maior que a vigente, com as
 * referências das aprovações. A trava exclusiva da Brand Partner serializa aprovações e registros de Residence.
 */
export function approveConceptVersionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<ApproveConceptVersionInput, ConceptVersionResult, Tx> {
  return {
    command: 'approve_concept_version',
    input: approveConceptVersionInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'approve_concept_version');
      const initial = found(await deps.store.conceptVersion(tx, input.concept_version_id));
      const concept = found(await deps.store.concept(tx, initial.conceptId));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'exclusive', now);
      // Relida depois da trava: outra aprovação pode ter terminado enquanto esperávamos.
      const target = found(await deps.store.conceptVersion(tx, input.concept_version_id));
      requireState(canApprove(target, await deps.store.currentApprovedVersion(tx, concept.id)));
      const approved = await deps.store.approveConceptVersion(tx, target.id, {
        approvalRefs: input.approval_refs,
        approvedAt: now,
        approvedByUserId: staff.userId,
        approvedRole: staff.role,
        approvalOperationId: operationId,
      });
      const result = conceptVersionResult(approved, concept);
      audit({
        objectType: 'concept_version',
        objectId: target.id,
        before: conceptVersionResult(target, concept),
        after: result,
      });
      return result;
    },
  };
}
