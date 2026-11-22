import { createAdminCommandRoute, type AdminCommandDependencies } from '@/features/identity';
import { withRoute, type LogPort } from '@/features/platform';
import { createPolicyHandlers } from '../policies';

const HTTP_CREATED = 201;
/** Corpo efetivo até 16 KiB: o esquema v1 com 5 faixas cabe com folga (STRIDE T-1807; o mesmo limite do banco). */
const MAX_BODY_BYTES = 16_384;

/**
 * Rota `POST /v1/admin/policies` da W18 (OpenAPI `publishPolicy`, tag `pricing`; ADR-0034 §3): adaptador mínimo da
 * entrada única do Admin sobre o mesmo handler da Server Action. Papel Admin; AAL2 e papel revalidados (TECH-050).
 */
export interface PolicyRouteDependencies extends AdminCommandDependencies {
  /** Disparo do outbox depois do commit; padrão: o da plataforma (injetável nos testes). */
  readonly afterCommit?: (log: LogPort) => void;
}

export function createPolicyRoutes(dependencies: PolicyRouteDependencies = {}) {
  const handlers = createPolicyHandlers();
  return {
    publishPolicy: createAdminCommandRoute({
      ...dependencies,
      successStatus: HTTP_CREATED,
      maxBodyBytes: MAX_BODY_BYTES,
      command: () => ({ handler: handlers.publishPolicy, role: 'admin' }),
    }),
  };
}

const routes = createPolicyRoutes();
export const publishPolicy = withRoute(routes.publishPolicy);
