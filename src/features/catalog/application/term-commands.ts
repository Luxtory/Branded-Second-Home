import type { CommandHandler } from '@/features/platform';
import { termSlug, type CatalogTerm } from '../domain/collection';
import { type CatalogDependencies, found, requireState } from './command-support';
import {
  createCatalogTermInput,
  updateCatalogTermInput,
  type CreateCatalogTermInput,
  type UpdateCatalogTermInput,
} from './inputs';
import { catalogTermResult, type CatalogTermResult } from './results';

/**
 * `create_catalog_term` (spec catalog §13.12): termo ativo de um vocabulário controlado, com o slug derivado do rótulo.
 * Slug ou rótulo já usados no mesmo vocabulário → `ERR_STATE_TRANSITION` (o índice único do banco fecha a corrida).
 */
export function createCatalogTermHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CreateCatalogTermInput, CatalogTermResult, Tx> {
  return {
    command: 'create_catalog_term',
    input: createCatalogTermInput,
    async execute({ input, operationId, now, tx, audit }) {
      const slug = termSlug(input.label);
      requireState(
        (await deps.store.conflictingTerm(tx, {
          kind: input.kind,
          label: input.label,
          slug,
          exceptId: null,
        })) === null,
      );
      const term: CatalogTerm = {
        id: deps.newId(),
        kind: input.kind,
        slug,
        label: input.label,
        active: true,
        operationId,
        createdAt: now,
      };
      await deps.store.insertCatalogTerm(tx, term);
      const result = catalogTermResult(term);
      audit({ objectType: 'catalog_term', objectId: term.id, before: null, after: result });
      return result;
    },
  };
}

/**
 * `update_catalog_term`: grava rótulo e estado ativo; o slug e o vocabulário não mudam e o termo nunca é apagado.
 * Desativado, sai da Coleção pública e não classifica versões novas; as versões que já o usam não mudam.
 */
export function updateCatalogTermHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<UpdateCatalogTermInput, CatalogTermResult, Tx> {
  return {
    command: 'update_catalog_term',
    input: updateCatalogTermInput,
    async execute({ input, tx, audit }) {
      const [current] = await deps.store.catalogTerms(tx, [input.catalog_term_id], 'exclusive');
      const term = found(current ?? null);
      requireState(
        (await deps.store.conflictingTerm(tx, {
          kind: term.kind,
          label: input.label,
          slug: null,
          exceptId: term.id,
        })) === null,
      );
      const updated = await deps.store.updateCatalogTerm(tx, term.id, {
        label: input.label,
        active: input.active,
      });
      const result = catalogTermResult(updated);
      audit({
        objectType: 'catalog_term',
        objectId: term.id,
        before: catalogTermResult(term),
        after: result,
      });
      return result;
    },
  };
}
