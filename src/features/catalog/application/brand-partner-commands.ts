import type { CommandHandler } from '@/features/platform';
import type { BrandPartner } from '../domain/catalog';
import { type CatalogDependencies, found, lockBrandInUse, requireState } from './command-support';
import {
  authorizeBrandExposureInput,
  registerBrandPartnerInput,
  terminateBrandPartnerInput,
  type AuthorizeBrandExposureInput,
  type RegisterBrandPartnerInput,
  type TerminateBrandPartnerInput,
} from './inputs';
import { brandPartnerResult, type BrandPartnerResult } from './results';

const OBJECT = 'brand_partner';

/** `register_brand_partner` (BR-010…016): a autorização de exposição (BR-015) é opcional no registro. */
export function registerBrandPartnerHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<RegisterBrandPartnerInput, BrandPartnerResult, Tx> {
  return {
    command: 'register_brand_partner',
    input: registerBrandPartnerInput,
    async execute({ input, operationId, now, tx, audit }) {
      const ref = input.exposure_authorization_ref ?? null;
      const partner: BrandPartner = {
        id: deps.newId(),
        brandName: input.brand_name,
        exposureAuthorizationRef: ref,
        exposureAuthorizedAt: ref === null ? null : now,
        terminatedEffectiveAt: null,
        terminationBasis: null,
        terminationRegisteredAt: null,
        operationId,
        createdAt: now,
      };
      await deps.store.insertBrandPartner(tx, partner);
      const result = brandPartnerResult(partner);
      audit({ objectType: OBJECT, objectId: partner.id, before: null, after: result });
      return result;
    },
  };
}

/** `authorize_brand_exposure` (BR-015, D-W3-3): uma vez, antes da eficácia do encerramento; nunca apagada. */
export function authorizeBrandExposureHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<AuthorizeBrandExposureInput, BrandPartnerResult, Tx> {
  return {
    command: 'authorize_brand_exposure',
    input: authorizeBrandExposureInput,
    async execute({ input, now, tx, audit }) {
      const partner = await lockBrandInUse(
        deps.store,
        tx,
        input.brand_partner_id,
        'exclusive',
        now,
      );
      requireState(partner.exposureAuthorizedAt === null);
      const updated = await deps.store.recordExposure(
        tx,
        partner.id,
        input.exposure_authorization_ref,
        now,
      );
      const result = brandPartnerResult(updated);
      audit({
        objectType: OBJECT,
        objectId: partner.id,
        before: brandPartnerResult(partner),
        after: result,
      });
      return result;
    },
  };
}

/**
 * `terminate_brand_partner` (BR-021): registra eficácia e base, uma vez. Não apaga a autorização de exposição nem muda
 * o que já existe (BR-022).
 */
export function terminateBrandPartnerHandler<Tx>(
  deps: CatalogDependencies<Tx>,
): CommandHandler<TerminateBrandPartnerInput, BrandPartnerResult, Tx> {
  return {
    command: 'terminate_brand_partner',
    input: terminateBrandPartnerInput,
    async execute({ input, now, tx, audit }) {
      const partner = found(await deps.store.brandPartner(tx, input.brand_partner_id, 'exclusive'));
      requireState(partner.terminationRegisteredAt === null);
      const updated = await deps.store.recordTermination(tx, partner.id, {
        effectiveAt: new Date(input.terminated_effective_at),
        basis: input.termination_basis,
        registeredAt: now,
      });
      const result = brandPartnerResult(updated);
      audit({
        objectType: OBJECT,
        objectId: partner.id,
        before: brandPartnerResult(partner),
        after: result,
      });
      return result;
    },
  };
}
