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
    createConceptVersion: route(handlers.createConceptVersion, HTTP_CREATED),
    approveConceptVersion: route(handlers.approveConceptVersion, HTTP_OK, 'concept_version_id'),
    registerInvestorAuthorization: route(handlers.registerInvestorAuthorization, HTTP_CREATED),
    revokeInvestorAuthorization: route(
      handlers.revokeInvestorAuthorization,
      HTTP_OK,
      'investor_authorization_id',
    ),
    createEdition: route(handlers.createEdition, HTTP_CREATED),
    registerResidence: route(handlers.registerResidence, HTTP_CREATED),
    createCatalogTerm: route(handlers.createCatalogTerm, HTTP_CREATED),
    updateCatalogTerm: route(handlers.updateCatalogTerm, HTTP_OK, 'catalog_term_id'),
    uploadConceptCover: route(handlers.uploadConceptCover, HTTP_CREATED, 'concept_id'),
    approveConceptMedia: route(handlers.approveConceptMedia, HTTP_OK, 'concept_media_id'),
    withdrawConceptMedia: route(handlers.withdrawConceptMedia, HTTP_OK, 'concept_media_id'),
    setConceptCuration: route(handlers.setConceptCuration, HTTP_OK, 'concept_id'),
    registerEditionReferenceValue: route(
      handlers.registerEditionReferenceValue,
      HTTP_CREATED,
      'edition_id',
    ),
    endEditionReferenceValue: route(
      handlers.endEditionReferenceValue,
      HTTP_OK,
      'edition_reference_value_id',
    ),
  };
}

const routes = createCatalogRoutes();

export const registerBrandPartner = withRoute(routes.registerBrandPartner);
export const authorizeBrandExposure = withRoute(routes.authorizeBrandExposure);
export const terminateBrandPartner = withRoute(routes.terminateBrandPartner);
export const createConceptVersion = withRoute(routes.createConceptVersion);
export const approveConceptVersion = withRoute(routes.approveConceptVersion);
export const registerInvestorAuthorization = withRoute(routes.registerInvestorAuthorization);
export const revokeInvestorAuthorization = withRoute(routes.revokeInvestorAuthorization);
export const createEdition = withRoute(routes.createEdition);
export const registerResidence = withRoute(routes.registerResidence);
export const createCatalogTerm = withRoute(routes.createCatalogTerm);
export const updateCatalogTerm = withRoute(routes.updateCatalogTerm);
export const uploadConceptCover = withRoute(routes.uploadConceptCover);
export const approveConceptMedia = withRoute(routes.approveConceptMedia);
export const withdrawConceptMedia = withRoute(routes.withdrawConceptMedia);
export const setConceptCuration = withRoute(routes.setConceptCuration);
export const registerEditionReferenceValue = withRoute(routes.registerEditionReferenceValue);
export const endEditionReferenceValue = withRoute(routes.endEditionReferenceValue);
