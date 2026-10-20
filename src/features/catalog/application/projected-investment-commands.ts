import type { CommandHandler } from '@/features/platform';
import { periodsOverlap, type HomeEditionProjectedInvestment } from '../domain/collection';
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
  endHomeEditionProjectedInvestmentInput,
  registerHomeEditionProjectedInvestmentInput,
  type EndHomeEditionProjectedInvestmentInput,
  type RegisterHomeEditionProjectedInvestmentInput,
} from './inputs';
import {
  homeEditionProjectedInvestmentResult,
  type HomeEditionProjectedInvestmentResult,
} from './results';

/**
 * `register_home_edition_projected_investment` (BR-034, TECH-033; spec catalog §17.4): a ordem de grandeza do
 * investimento total projetado para materializar uma Second Home da Home Edition — registrada pela Luxtory, nunca
 * calculada, sem modalidade, base, configuração ou Ação. Uma vigente por Home Edition, em qualquer estado material.
 * Começa agora ou no futuro — nunca reescreve o que já foi exibido. A vigente em aberto que começou antes termina no
 * início da nova; outra sobreposição → `ERR_STATE_TRANSITION`. A trava exclusiva da Brand Partner serializa os registros.
 */
export function registerHomeEditionProjectedInvestmentHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<
  RegisterHomeEditionProjectedInvestmentInput,
  HomeEditionProjectedInvestmentResult,
  Tx
> {
  return {
    command: 'register_home_edition_projected_investment',
    input: registerHomeEditionProjectedInvestmentInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'register_home_edition_projected_investment');
      const validFrom = input.valid_from === undefined ? now : new Date(input.valid_from);
      requireValid(validFrom >= now);
      const homeEdition = found(await deps.store.homeEdition(tx, input.home_edition_id));
      const homeConcept = found(await deps.store.homeConcept(tx, homeEdition.homeConceptId));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'exclusive', now);
      const value: HomeEditionProjectedInvestment = {
        id: deps.newId(),
        homeEditionId: homeEdition.id,
        amountMinor: BigInt(input.amount_minor),
        currency: input.currency,
        validFrom,
        validUntil: null,
        registeredByUserId: staff.userId,
        registeredRole: staff.role,
        operationId,
        createdAt: now,
      };
      const existing = await deps.store.homeEditionProjectedInvestments(tx, homeEdition.id);
      const open = existing.find(
        (candidate) => candidate.validUntil === null && candidate.validFrom < validFrom,
      );
      const others = existing.filter((candidate) => candidate !== open);
      requireState(!others.some((candidate) => periodsOverlap(candidate, value)));
      if (open !== undefined) {
        const closed = await deps.store.endHomeEditionProjectedInvestment(tx, open.id, validFrom);
        audit({
          objectType: 'home_edition_projected_investment',
          objectId: open.id,
          before: homeEditionProjectedInvestmentResult(open),
          after: homeEditionProjectedInvestmentResult(closed),
        });
      }
      await deps.store.insertHomeEditionProjectedInvestment(tx, value);
      const result = homeEditionProjectedInvestmentResult(value);
      audit({
        objectType: 'home_edition_projected_investment',
        objectId: value.id,
        before: null,
        after: result,
      });
      return result;
    },
  };
}

/**
 * `end_home_edition_projected_investment`: encerra agora, uma única vez, uma média que já começou. Vale mesmo com a
 * marca encerrada (reduz a exposição). Para trocar uma média futura, registra-se outra.
 */
export function endHomeEditionProjectedInvestmentHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<
  EndHomeEditionProjectedInvestmentInput,
  HomeEditionProjectedInvestmentResult,
  Tx
> {
  return {
    command: 'end_home_edition_projected_investment',
    input: endHomeEditionProjectedInvestmentInput,
    async execute({ input, now, tx, audit }) {
      const id = input.home_edition_projected_investment_id;
      const initial = found(await deps.store.homeEditionProjectedInvestment(tx, id));
      const homeEdition = found(await deps.store.homeEdition(tx, initial.homeEditionId));
      const homeConcept = found(await deps.store.homeConcept(tx, homeEdition.homeConceptId));
      await lockBrand(deps.store, tx, homeConcept.brandPartnerId);
      const value = found(await deps.store.homeEditionProjectedInvestment(tx, id));
      requireState(value.validUntil === null && value.validFrom < now);
      const ended = await deps.store.endHomeEditionProjectedInvestment(tx, id, now);
      const result = homeEditionProjectedInvestmentResult(ended);
      audit({
        objectType: 'home_edition_projected_investment',
        objectId: id,
        before: homeEditionProjectedInvestmentResult(value),
        after: result,
      });
      return result;
    },
  };
}
