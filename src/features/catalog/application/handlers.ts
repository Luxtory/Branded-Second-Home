import {
  authorizeBrandExposureHandler,
  registerBrandPartnerHandler,
  terminateBrandPartnerHandler,
} from './brand-partner-commands';
import type { CatalogDependencies } from './command-support';
import {
  approveHomeConceptVersionHandler,
  createHomeConceptVersionHandler,
} from './home-concept-commands';
import {
  correctHomeEditionEditorialHandler,
  createHomeEditionHandler,
  finalizeHomeEditionHandler,
  publishHomeEditionHandler,
  updateHomeEditionDraftHandler,
  withdrawHomeEditionHandler,
} from './home-edition-commands';
import {
  approveHomeEditionMediaHandler,
  uploadHomeEditionMediaHandler,
  withdrawHomeEditionMediaHandler,
} from './home-edition-media-commands';
import {
  registerInvestorAuthorizationHandler,
  revokeInvestorAuthorizationHandler,
} from './investor-commands';
import {
  approveHomeConceptMediaHandler,
  setHomeConceptCurationHandler,
  uploadHomeConceptCoverHandler,
  withdrawHomeConceptMediaHandler,
} from './media-commands';
import {
  endHomeEditionProjectedInvestmentHandler,
  registerHomeEditionProjectedInvestmentHandler,
} from './projected-investment-commands';
import { registerSecondHomeHandler } from './second-home-commands';
import { createCatalogTermHandler, updateCatalogTermHandler } from './term-commands';

export type { CatalogDependencies } from './command-support';

/**
 * As 25 operações do catálogo (REQ-095; registro não crítico, `docs/specs/catalog.md` §5, §13.12, §17.6): Brand
 * Partner, Home Concept e versões, Investor, ciclo e mídia da Home Edition, média projetada, Second Home, vocabulários,
 * capa e curadoria.
 */
export function createCatalogHandlers<Tx>(deps: CatalogDependencies<Tx>) {
  return {
    registerBrandPartner: registerBrandPartnerHandler(deps),
    authorizeBrandExposure: authorizeBrandExposureHandler(deps),
    terminateBrandPartner: terminateBrandPartnerHandler(deps),
    createHomeConceptVersion: createHomeConceptVersionHandler(deps),
    approveHomeConceptVersion: approveHomeConceptVersionHandler(deps),
    registerInvestorAuthorization: registerInvestorAuthorizationHandler(deps),
    revokeInvestorAuthorization: revokeInvestorAuthorizationHandler(deps),
    createHomeEdition: createHomeEditionHandler(deps),
    updateHomeEditionDraft: updateHomeEditionDraftHandler(deps),
    finalizeHomeEdition: finalizeHomeEditionHandler(deps),
    publishHomeEdition: publishHomeEditionHandler(deps),
    withdrawHomeEdition: withdrawHomeEditionHandler(deps),
    correctHomeEditionEditorial: correctHomeEditionEditorialHandler(deps),
    uploadHomeEditionMedia: uploadHomeEditionMediaHandler(deps),
    approveHomeEditionMedia: approveHomeEditionMediaHandler(deps),
    withdrawHomeEditionMedia: withdrawHomeEditionMediaHandler(deps),
    registerHomeEditionProjectedInvestment: registerHomeEditionProjectedInvestmentHandler(deps),
    endHomeEditionProjectedInvestment: endHomeEditionProjectedInvestmentHandler(deps),
    registerSecondHome: registerSecondHomeHandler(deps),
    createCatalogTerm: createCatalogTermHandler(deps),
    updateCatalogTerm: updateCatalogTermHandler(deps),
    uploadHomeConceptCover: uploadHomeConceptCoverHandler(deps),
    approveHomeConceptMedia: approveHomeConceptMediaHandler(deps),
    withdrawHomeConceptMedia: withdrawHomeConceptMediaHandler(deps),
    setHomeConceptCuration: setHomeConceptCurationHandler(deps),
  };
}

export type CatalogHandlers<Tx> = ReturnType<typeof createCatalogHandlers<Tx>>;
