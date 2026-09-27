import type { CommandHandler } from '@/features/platform';
import {
  authorizationCovers,
  type Edition,
  type InvestorAuthorization,
  type Residence,
} from '../domain/catalog';
import {
  type CatalogDependencies,
  found,
  lockBrandInUse,
  presentInState,
  requireState,
  staffActor,
} from './command-support';
import {
  createEditionInput,
  registerInvestorAuthorizationInput,
  registerResidenceInput,
  revokeInvestorAuthorizationInput,
  type CreateEditionInput,
  type RegisterInvestorAuthorizationInput,
  type RegisterResidenceInput,
  type RevokeInvestorAuthorizationInput,
} from './inputs';
import {
  editionResult,
  investorAuthorizationResult,
  residenceResult,
  type EditionResult,
  type InvestorAuthorizationResult,
  type ResidenceResult,
} from './results';

/** `register_investor_authorization` (BR-310, D-W3-1): Concept, instrumento e vigência; sem dado pessoal. */
export function registerInvestorAuthorizationHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterInvestorAuthorizationInput, InvestorAuthorizationResult, Tx> {
  return {
    command: 'register_investor_authorization',
    input: registerInvestorAuthorizationInput,
    async execute({ input, actor, operationId, now, tx, audit }) {
      const staff = staffActor(actor, 'register_investor_authorization');
      const concept = found(await deps.store.concept(tx, input.concept_id));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'share', now);
      const authorization: InvestorAuthorization = {
        id: deps.newId(),
        conceptId: concept.id,
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

/** `revoke_investor_authorization`: revogação única, com base; Residences já registradas não mudam. */
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

/**
 * `create_edition` (BR-004, BR-031, BR-032): só para Concept com versão aprovada — uma Edition de Concept não aprovado
 * nunca teria Residence (BR-003). Alteração de modalidade e trava da estrutura chegam na W8.
 */
export function createEditionHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<CreateEditionInput, EditionResult, Tx> {
  return {
    command: 'create_edition',
    input: createEditionInput,
    async execute({ input, operationId, now, tx, audit }) {
      const concept = found(await deps.store.concept(tx, input.concept_id));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'share', now);
      presentInState(await deps.store.currentApprovedVersion(tx, concept.id));
      const edition: Edition = {
        id: deps.newId(),
        conceptId: concept.id,
        region: input.region,
        modality: input.modality,
        commercialConditions: input.commercial_conditions,
        operationId,
        createdAt: now,
      };
      await deps.store.insertEdition(tx, edition);
      const result = editionResult(edition);
      audit({ objectType: 'edition', objectId: edition.id, before: null, after: result });
      return result;
    },
  };
}

/**
 * `register_residence` (REQ-020, REQ-027, BR-025): é o evento de aprovação comercial — grava o instante e fixa a versão
 * vigente do Concept (ADR-0010 §2). Com Investor, exige autorização do mesmo Concept, vigente e não revogada.
 */
export function registerResidenceHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterResidenceInput, ResidenceResult, Tx> {
  return {
    command: 'register_residence',
    input: registerResidenceInput,
    async execute({ input, operationId, now, tx, audit }) {
      const edition = found(await deps.store.edition(tx, input.edition_id));
      const concept = found(await deps.store.concept(tx, edition.conceptId));
      await lockBrandInUse(deps.store, tx, concept.brandPartnerId, 'share', now);
      const investorId = input.investor_authorization_id ?? null;
      if (investorId !== null) {
        const authorization = found(
          await deps.store.investorAuthorization(tx, investorId, 'share'),
        );
        requireState(authorizationCovers(authorization, concept.id, now));
      }
      const current = presentInState(await deps.store.currentApprovedVersion(tx, concept.id));
      const residence: Residence = {
        id: deps.newId(),
        editionId: edition.id,
        conceptId: concept.id,
        conceptVersionId: current.id,
        commerciallyApprovedAt: now,
        label: input.label,
        timezone: input.timezone,
        investorAuthorizationId: investorId,
        operationId,
      };
      await deps.store.insertResidence(tx, residence);
      const result = residenceResult(residence, current.version);
      audit({ objectType: 'residence', objectId: residence.id, before: null, after: result });
      return result;
    },
  };
}
