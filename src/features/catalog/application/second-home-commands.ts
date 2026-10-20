import type { CommandHandler } from '@/features/platform';
import { authorizationCovers, canOriginateSecondHome, type SecondHome } from '../domain/catalog';
import {
  type CatalogDependencies,
  found,
  lockBrandInUse,
  presentInState,
  requireState,
} from './command-support';
import { registerSecondHomeInput, type RegisterSecondHomeInput } from './inputs';
import { secondHomeResult, type SecondHomeResult } from './results';

/**
 * `register_second_home` (REQ-020, REQ-027, BR-025, BR-035): é o evento de aprovação comercial — grava o instante e
 * fixa a Home Edition e a versão vigente do Home Concept (ADR-0010 §2). Exige Home Edition materialmente finalizada
 * (`02` v4.3 REQ-022; ADR-0019 §5): a visibilidade pública não é condição. Com Investor, exige autorização do mesmo
 * Home Concept, vigente e não revogada.
 */
export function registerSecondHomeHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterSecondHomeInput, SecondHomeResult, Tx> {
  return {
    command: 'register_second_home',
    input: registerSecondHomeInput,
    async execute({ input, operationId, now, tx, audit }) {
      const initial = found(await deps.store.homeEdition(tx, input.home_edition_id));
      const homeConcept = found(await deps.store.homeConcept(tx, initial.homeConceptId));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'share', now);
      // Relida depois da trava: a finalização trava a Brand Partner em modo exclusivo.
      const homeEdition = found(await deps.store.homeEdition(tx, input.home_edition_id));
      requireState(canOriginateSecondHome(homeEdition));
      const investorId = input.investor_authorization_id ?? null;
      if (investorId !== null) {
        const authorization = found(
          await deps.store.investorAuthorization(tx, investorId, 'share'),
        );
        requireState(authorizationCovers(authorization, homeConcept.id, now));
      }
      const current = presentInState(await deps.store.currentApprovedVersion(tx, homeConcept.id));
      const secondHome: SecondHome = {
        id: deps.newId(),
        homeEditionId: homeEdition.id,
        homeConceptId: homeConcept.id,
        homeConceptVersionId: current.id,
        commerciallyApprovedAt: now,
        label: input.label,
        timezone: input.timezone,
        investorAuthorizationId: investorId,
        operationId,
      };
      await deps.store.insertSecondHome(tx, secondHome);
      const result = secondHomeResult(secondHome, current.version);
      audit({ objectType: 'second_home', objectId: secondHome.id, before: null, after: result });
      return result;
    },
  };
}
