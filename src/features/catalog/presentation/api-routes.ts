import { randomUUID } from 'node:crypto';
import {
  createAdminCommandRoute,
  type AdminCommand,
  type AdminCommandDependencies,
} from '@/features/identity';
import {
  withRoute,
  type DatabaseTransaction,
  type JsonValue,
  type LogPort,
} from '@/features/platform';
import { createCatalogHandlers } from '../application/handlers';
import type { CoverImageProcessor, MediaStorage } from '../application/ports';
import { runtimeMediaStorage } from '../infrastructure/media-storage';
import { postgresCatalogStore } from '../infrastructure/postgres-catalog-store';
import { sharpCoverProcessor } from '../infrastructure/sharp-cover-processor';
import { CATALOG_ROLE } from './handlers';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

export interface CatalogRouteDependencies extends AdminCommandDependencies {
  readonly newId?: () => string;
  readonly images?: CoverImageProcessor;
  readonly media?: MediaStorage;
  readonly afterCommit?: (log: LogPort) => void;
}

/** Corpo + id do caminho: o id do caminho vale sobre o corpo. */
const withPathId = (field: string) => (body: unknown, params: Readonly<Record<string, string>>) =>
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? { ...body, [field]: params.id }
    : body;

/** Rotas `POST /v1/admin/*` do catálogo (OpenAPI, tag `catalog`), sem o `withRoute` (injeção nos testes). */
export function createCatalogRoutes({
  newId = randomUUID,
  images = sharpCoverProcessor,
  media = runtimeMediaStorage,
  ...dependencies
}: CatalogRouteDependencies = {}) {
  const handlers = createCatalogHandlers<DatabaseTransaction>({
    store: postgresCatalogStore,
    images,
    media,
    newId,
  });
  const route = <I, R extends JsonValue>(
    handler: AdminCommand<I, R>['handler'],
    successStatus: number,
    pathId?: string,
  ) =>
    createAdminCommandRoute({
      ...dependencies,
      successStatus,
      command: () => ({ handler, role: CATALOG_ROLE }),
      ...(pathId === undefined ? {} : { input: withPathId(pathId) }),
    });
  return {
    registerBrandPartner: route(handlers.registerBrandPartner, HTTP_CREATED),
    authorizeBrandExposure: route(handlers.authorizeBrandExposure, HTTP_OK, 'brand_partner_id'),
    terminateBrandPartner: route(handlers.terminateBrandPartner, HTTP_OK, 'brand_partner_id'),
    createHomeConceptVersion: route(handlers.createHomeConceptVersion, HTTP_CREATED),
    approveHomeConceptVersion: route(
      handlers.approveHomeConceptVersion,
      HTTP_OK,
      'home_concept_version_id',
    ),
    registerInvestorAuthorization: route(handlers.registerInvestorAuthorization, HTTP_CREATED),
    revokeInvestorAuthorization: route(
      handlers.revokeInvestorAuthorization,
      HTTP_OK,
      'investor_authorization_id',
    ),
    createHomeEdition: route(handlers.createHomeEdition, HTTP_CREATED),
    updateHomeEditionDraft: route(handlers.updateHomeEditionDraft, HTTP_OK, 'home_edition_id'),
    finalizeHomeEdition: route(handlers.finalizeHomeEdition, HTTP_OK, 'home_edition_id'),
    publishHomeEdition: route(handlers.publishHomeEdition, HTTP_OK, 'home_edition_id'),
    withdrawHomeEdition: route(handlers.withdrawHomeEdition, HTTP_OK, 'home_edition_id'),
    correctHomeEditionEditorial: route(
      handlers.correctHomeEditionEditorial,
      HTTP_OK,
      'home_edition_id',
    ),
    uploadHomeEditionMedia: route(handlers.uploadHomeEditionMedia, HTTP_CREATED, 'home_edition_id'),
    approveHomeEditionMedia: route(
      handlers.approveHomeEditionMedia,
      HTTP_OK,
      'home_edition_media_id',
    ),
    withdrawHomeEditionMedia: route(
      handlers.withdrawHomeEditionMedia,
      HTTP_OK,
      'home_edition_media_id',
    ),
    registerSecondHome: route(handlers.registerSecondHome, HTTP_CREATED),
    createCatalogTerm: route(handlers.createCatalogTerm, HTTP_CREATED),
    updateCatalogTerm: route(handlers.updateCatalogTerm, HTTP_OK, 'catalog_term_id'),
    uploadHomeConceptCover: route(handlers.uploadHomeConceptCover, HTTP_CREATED, 'home_concept_id'),
    approveHomeConceptMedia: route(
      handlers.approveHomeConceptMedia,
      HTTP_OK,
      'home_concept_media_id',
    ),
    withdrawHomeConceptMedia: route(
      handlers.withdrawHomeConceptMedia,
      HTTP_OK,
      'home_concept_media_id',
    ),
    setHomeConceptCuration: route(handlers.setHomeConceptCuration, HTTP_OK, 'home_concept_id'),
    registerHomeEditionProjectedInvestment: route(
      handlers.registerHomeEditionProjectedInvestment,
      HTTP_CREATED,
      'home_edition_id',
    ),
    endHomeEditionProjectedInvestment: route(
      handlers.endHomeEditionProjectedInvestment,
      HTTP_OK,
      'home_edition_projected_investment_id',
    ),
  };
}

const routes = createCatalogRoutes();

export const registerBrandPartner = withRoute(routes.registerBrandPartner);
export const authorizeBrandExposure = withRoute(routes.authorizeBrandExposure);
export const terminateBrandPartner = withRoute(routes.terminateBrandPartner);
export const createHomeConceptVersion = withRoute(routes.createHomeConceptVersion);
export const approveHomeConceptVersion = withRoute(routes.approveHomeConceptVersion);
export const registerInvestorAuthorization = withRoute(routes.registerInvestorAuthorization);
export const revokeInvestorAuthorization = withRoute(routes.revokeInvestorAuthorization);
export const createHomeEdition = withRoute(routes.createHomeEdition);
export const updateHomeEditionDraft = withRoute(routes.updateHomeEditionDraft);
export const finalizeHomeEdition = withRoute(routes.finalizeHomeEdition);
export const publishHomeEdition = withRoute(routes.publishHomeEdition);
export const withdrawHomeEdition = withRoute(routes.withdrawHomeEdition);
export const correctHomeEditionEditorial = withRoute(routes.correctHomeEditionEditorial);
export const uploadHomeEditionMedia = withRoute(routes.uploadHomeEditionMedia);
export const approveHomeEditionMedia = withRoute(routes.approveHomeEditionMedia);
export const withdrawHomeEditionMedia = withRoute(routes.withdrawHomeEditionMedia);
export const registerSecondHome = withRoute(routes.registerSecondHome);
export const createCatalogTerm = withRoute(routes.createCatalogTerm);
export const updateCatalogTerm = withRoute(routes.updateCatalogTerm);
export const uploadHomeConceptCover = withRoute(routes.uploadHomeConceptCover);
export const approveHomeConceptMedia = withRoute(routes.approveHomeConceptMedia);
export const withdrawHomeConceptMedia = withRoute(routes.withdrawHomeConceptMedia);
export const setHomeConceptCuration = withRoute(routes.setHomeConceptCuration);
export const registerHomeEditionProjectedInvestment = withRoute(
  routes.registerHomeEditionProjectedInvestment,
);
export const endHomeEditionProjectedInvestment = withRoute(
  routes.endHomeEditionProjectedInvestment,
);
