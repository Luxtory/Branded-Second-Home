import {
  authorizeBrandExposureHandler,
  registerBrandPartnerHandler,
  terminateBrandPartnerHandler,
} from './brand-partner-commands';
import type { CatalogDependencies } from './command-support';
import { approveConceptVersionHandler, createConceptVersionHandler } from './concept-commands';
import {
  createEditionHandler,
  registerInvestorAuthorizationHandler,
  registerResidenceHandler,
  revokeInvestorAuthorizationHandler,
} from './offer-commands';

export type { CatalogDependencies } from './command-support';

/** As 9 operações do catálogo (REQ-095; registro não crítico, `docs/specs/catalog.md`). */
export function createCatalogHandlers<Tx>(deps: CatalogDependencies<Tx>) {
  return {
    registerBrandPartner: registerBrandPartnerHandler(deps),
    authorizeBrandExposure: authorizeBrandExposureHandler(deps),
    terminateBrandPartner: terminateBrandPartnerHandler(deps),
    createConceptVersion: createConceptVersionHandler(deps),
    approveConceptVersion: approveConceptVersionHandler(deps),
    registerInvestorAuthorization: registerInvestorAuthorizationHandler(deps),
    revokeInvestorAuthorization: revokeInvestorAuthorizationHandler(deps),
    createEdition: createEditionHandler(deps),
    registerResidence: registerResidenceHandler(deps),
  };
}

export type CatalogHandlers<Tx> = ReturnType<typeof createCatalogHandlers<Tx>>;
