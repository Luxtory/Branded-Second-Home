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
import {
  approveConceptMediaHandler,
  setConceptCurationHandler,
  uploadConceptCoverHandler,
  withdrawConceptMediaHandler,
} from './media-commands';
import {
  endEditionReferenceValueHandler,
  registerEditionReferenceValueHandler,
} from './reference-value-commands';
import { createCatalogTermHandler, updateCatalogTermHandler } from './term-commands';

export type { CatalogDependencies } from './command-support';

/**
 * As 18 operações do catálogo (REQ-095; registro não crítico, `docs/specs/catalog.md`): as 9 da W3 e as 9 da Coleção
 * (§13.12 — vocabulários, capa, curadoria e valores de referência).
 */
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
    createCatalogTerm: createCatalogTermHandler(deps),
    updateCatalogTerm: updateCatalogTermHandler(deps),
    uploadConceptCover: uploadConceptCoverHandler(deps),
    approveConceptMedia: approveConceptMediaHandler(deps),
    withdrawConceptMedia: withdrawConceptMediaHandler(deps),
    setConceptCuration: setConceptCurationHandler(deps),
    registerEditionReferenceValue: registerEditionReferenceValueHandler(deps),
    endEditionReferenceValue: endEditionReferenceValueHandler(deps),
  };
}

export type CatalogHandlers<Tx> = ReturnType<typeof createCatalogHandlers<Tx>>;
