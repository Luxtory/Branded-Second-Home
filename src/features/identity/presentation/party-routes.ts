import { withRoute, type JsonValue, type LogPort } from '@/features/platform';
import {
  createAdminCommandRoute,
  type AdminCommand,
  type AdminCommandDependencies,
} from './admin-command';
import { createPartyHandlers, type PartyHandlerDependencies } from './party-handlers';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

export interface PartyRouteDependencies extends AdminCommandDependencies, PartyHandlerDependencies {
  readonly afterCommit?: (log: LogPort) => void;
}

/** Corpo + id do caminho, no campo do command: o id do caminho vale sobre o corpo. */
const withPathId = (field: string) => (body: unknown, params: Readonly<Record<string, string>>) =>
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? { ...body, [field]: params.id }
    : body;

/**
 * Rotas `POST /v1/admin/*` da W7 (OpenAPI, tag `identity`), sem o `withRoute` (injeção nos testes). Autoridade "Admin"
 * (REQ-095): o papel exercido é Admin; sem hierarquia, Super Admin sozinho não opera (ADR-0008).
 */
export function createPartyRoutes(dependencies: PartyRouteDependencies = {}) {
  const handlers = createPartyHandlers(dependencies);
  const route = <I, R extends JsonValue>(
    handler: AdminCommand<I, R>['handler'],
    successStatus: number,
    pathId?: string,
  ) =>
    createAdminCommandRoute({
      ...dependencies,
      successStatus,
      command: () => ({ handler, role: 'admin' }),
      ...(pathId === undefined ? {} : { input: withPathId(pathId) }),
    });
  return {
    registerParty: route(handlers.registerParty, HTTP_CREATED),
    createPartyDelegation: route(handlers.createPartyDelegation, HTTP_CREATED, 'party_id'),
    revokePartyDelegation: route(handlers.revokePartyDelegation, HTTP_OK, 'party_delegation_id'),
  };
}

const routes = createPartyRoutes();
export const registerParty = withRoute(routes.registerParty);
export const createPartyDelegation = withRoute(routes.createPartyDelegation);
export const revokePartyDelegation = withRoute(routes.revokePartyDelegation);
