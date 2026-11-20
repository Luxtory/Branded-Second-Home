import { withRoute, type JsonValue, type LogPort } from '@/features/platform';
import {
  createAdminCommandRoute,
  type AdminCommand,
  type AdminCommandDependencies,
} from './admin-command';
import {
  createMembershipHandlers,
  type MembershipHandlerDependencies,
} from './membership-handlers';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

export interface MembershipRouteDependencies
  extends AdminCommandDependencies, MembershipHandlerDependencies {
  /** Disparo do outbox depois do commit; padrão: o da plataforma (injetável nos testes, como nas rotas da W7). */
  readonly afterCommit?: (log: LogPort) => void;
}

/** Corpo + id da party do caminho: o id do caminho vale sobre o corpo. */
const withPartyId = (body: unknown, params: Readonly<Record<string, string>>) =>
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? { ...body, party_id: params.id }
    : body;

/**
 * Rotas `POST /v1/admin/parties/{id}/membership/*` da W15 (OpenAPI, tag `identity`), sem o `withRoute` (injeção nos
 * testes). Papel exercido Admin (REQ-095), AAL2, sem hierarquia (ADR-0008).
 */
export function createMembershipRoutes(dependencies: MembershipRouteDependencies = {}) {
  const handlers = createMembershipHandlers(dependencies);
  const route = <I, R extends JsonValue>(
    handler: AdminCommand<I, R>['handler'],
    successStatus: number,
  ) =>
    createAdminCommandRoute({
      ...dependencies,
      successStatus,
      command: () => ({ handler, role: 'admin' }),
      input: withPartyId,
    });
  return {
    activateMembership: route(handlers.activateMembership, HTTP_CREATED),
    suspendMembership: route(handlers.suspendMembership, HTTP_OK),
    reactivateMembership: route(handlers.reactivateMembership, HTTP_OK),
    endMembership: route(handlers.endMembership, HTTP_OK),
  };
}

const routes = createMembershipRoutes();
export const activateMembership = withRoute(routes.activateMembership);
export const suspendMembership = withRoute(routes.suspendMembership);
export const reactivateMembership = withRoute(routes.reactivateMembership);
export const endMembership = withRoute(routes.endMembership);
