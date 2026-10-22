import type { CommandHandler } from '@/features/platform';
import type { InvestorAuthorization } from '../domain/catalog';
import {
  type CatalogDependencies,
  found,
  lockBrandInUse,
  requireState,
  staffActor,
} from './command-support';
import {
  registerInvestorAuthorizationInput,
  revokeInvestorAuthorizationInput,
  type RegisterInvestorAuthorizationInput,
  type RevokeInvestorAuthorizationInput,
} from './inputs';
import { investorAuthorizationResult, type InvestorAuthorizationResult } from './results';

/**
 * `register_investor_authorization` (BR-310, D-W3-1): Home Concept, instrumento, vigência e a party do Investor — já
 * cadastrada, resolvida pelo HMAC do CPF/CNPJ (W7). O documento nunca é gravado; no hash de idempotência entra só o
 * pseudônimo chaveado.
 */
export function registerInvestorAuthorizationHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterInvestorAuthorizationInput, InvestorAuthorizationResult, Tx> {
  return {
    command: 'register_investor_authorization',
    input: registerInvestorAuthorizationInput,
    fingerprint: {
      activeKeyId: () => deps.parties.fingerprint.activeKeyId(),
      payload: (input, keyId) => ({
        ...input,
        investor_document: deps.parties.fingerprint.payload(input.investor_document, keyId),
      }),
    },
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'register_investor_authorization');
      const homeConcept = found(await deps.store.homeConcept(tx, input.home_concept_id));
      await lockBrandInUse(deps.store, tx, homeConcept.brandPartnerId, 'share', now);
      const partyId = found(await deps.parties.resolve(tx, input.investor_document));
      const authorization: InvestorAuthorization = {
        id: deps.newId(),
        homeConceptId: homeConcept.id,
        partyId,
        instrumentRef: input.instrument_ref,
        validFrom: new Date(input.valid_from),
        validUntil: input.valid_until === undefined ? null : new Date(input.valid_until),
        registeredByUserId: staff.userId,
        registeredRole: staff.role,
        operationId,
        createdAt: now,
        revokedAt: null,
        revocationBasis: null,
      };
      await deps.store.insertInvestorAuthorization(tx, authorization);
      const result = investorAuthorizationResult(authorization);
      audit({
        objectType: 'investor_authorization',
        objectId: authorization.id,
        before: null,
        after: result,
      });
      return result;
    },
  };
}

/** `revoke_investor_authorization`: revogação única, com base; Second Homes já registradas não mudam. */
export function revokeInvestorAuthorizationHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RevokeInvestorAuthorizationInput, InvestorAuthorizationResult, Tx> {
  return {
    command: 'revoke_investor_authorization',
    input: revokeInvestorAuthorizationInput,
    async execute({ input, now, tx, audit }) {
      const id = input.investor_authorization_id;
      const authorization = found(await deps.store.investorAuthorization(tx, id, 'exclusive'));
      requireState(authorization.revokedAt === null);
      const revoked = await deps.store.revokeInvestorAuthorization(tx, id, {
        at: now,
        basis: input.revocation_basis,
      });
      const result = investorAuthorizationResult(revoked);
      audit({
        objectType: 'investor_authorization',
        objectId: id,
        before: investorAuthorizationResult(authorization),
        after: result,
      });
      return result;
    },
  };
}
