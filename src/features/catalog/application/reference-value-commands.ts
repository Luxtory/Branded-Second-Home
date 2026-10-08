import type { CommandHandler } from '@/features/platform';
import { basesForModality, periodsOverlap, type EditionReferenceValue } from '../domain/collection';
import {
  type CatalogDependencies,
  found,
  lockBrand,
  lockBrandInUse,
  requireState,
  requireValid,
  staffActor,
} from './command-support';
import {
  endEditionReferenceValueInput,
  registerEditionReferenceValueInput,
  type EndEditionReferenceValueInput,
  type RegisterEditionReferenceValueInput,
} from './inputs';
import { editionReferenceValueResult, type EditionReferenceValueResult } from './results';

/**
 * `register_edition_reference_value` (BR-031, REQ-094, TECH-033; spec catalog §13.12): valor registrado pela Luxtory,
 * nunca calculado, numa base que a modalidade da Edition oferece. Começa agora ou no futuro — nunca reescreve o que já
 * foi exibido. Um valor em aberto da mesma base que começou antes é encerrado no início do novo; outra sobreposição →
 * `ERR_STATE_TRANSITION`. A trava exclusiva da Brand Partner serializa os registros.
 */
export function registerEditionReferenceValueHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterEditionReferenceValueInput, EditionReferenceValueResult, Tx> {
  return {
    command: 'register_edition_reference_value',
    input: registerEditionReferenceValueInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'register_edition_reference_value');
      const validFrom = input.valid_from === undefined ? now : new Date(input.valid_from);
      requireValid(validFrom >= now);
      const edition = found(await deps.store.edition(tx, input.edition_id));
      const concept = found(await deps.store.concept(tx, edition.conceptId));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'exclusive', now);
      requireState(basesForModality(edition.modality).includes(input.basis));
      const value: EditionReferenceValue = {
        id: deps.newId(),
        editionId: edition.id,
        basis: input.basis,
        amountMinor: BigInt(input.amount_minor),
        currency: input.currency,
        validFrom,
        validUntil: null,
        registeredByUserId: staff.userId,
        registeredRole: staff.role,
        operationId,
        createdAt: now,
      };
      const existing = await deps.store.editionReferenceValues(tx, {
        editionId: edition.id,
        basis: input.basis,
        currency: input.currency,
      });
      const open = existing.find(
        (candidate) => candidate.validUntil === null && candidate.validFrom < validFrom,
      );
      const others = existing.filter((candidate) => candidate !== open);
      requireState(!others.some((candidate) => periodsOverlap(candidate, value)));
      if (open !== undefined) {
        const closed = await deps.store.endEditionReferenceValue(tx, open.id, validFrom);
        audit({
          objectType: 'edition_reference_value',
          objectId: open.id,
          before: editionReferenceValueResult(open),
          after: editionReferenceValueResult(closed),
        });
      }
      await deps.store.insertEditionReferenceValue(tx, value);
      const result = editionReferenceValueResult(value);
      audit({
        objectType: 'edition_reference_value',
        objectId: value.id,
        before: null,
        after: result,
      });
      return result;
    },
  };
}

/**
 * `end_edition_reference_value`: encerra agora, uma única vez, um valor que já começou. Vale mesmo com a marca encerrada
 * (reduz a exposição). Para trocar um valor futuro, registra-se outro.
 */
export function endEditionReferenceValueHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<EndEditionReferenceValueInput, EditionReferenceValueResult, Tx> {
  return {
    command: 'end_edition_reference_value',
    input: endEditionReferenceValueInput,
    async execute({ input, now, tx, audit }) {
      const id = input.edition_reference_value_id;
      const initial = found(await deps.store.editionReferenceValue(tx, id));
      const edition = found(await deps.store.edition(tx, initial.editionId));
      const concept = found(await deps.store.concept(tx, edition.conceptId));
      await lockBrand(deps.store, tx, concept.brandPartnerId);
      const value = found(await deps.store.editionReferenceValue(tx, id));
      requireState(value.validUntil === null && value.validFrom < now);
      const ended = await deps.store.endEditionReferenceValue(tx, id, now);
      const result = editionReferenceValueResult(ended);
      audit({
        objectType: 'edition_reference_value',
        objectId: id,
        before: editionReferenceValueResult(value),
        after: result,
      });
      return result;
    },
  };
}
