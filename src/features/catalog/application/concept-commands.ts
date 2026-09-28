import type { AuditRecord, CommandHandler } from '@/features/platform';
import { canApprove, type Concept, type ConceptVersion } from '../domain/catalog';
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

type VersionContent = Pick<
  CreateConceptVersionInput,
  'essential_elements' | 'preservation_premises' | 'specification'
>;

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
