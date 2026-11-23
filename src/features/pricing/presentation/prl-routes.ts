import { createAdminCommandRoute, type AdminCommandDependencies } from '@/features/identity';
import { withRoute, type LogPort } from '@/features/platform';
import { createPrlHandlers } from '../prl';

const HTTP_CREATED = 201;
/** Corpo efetivo até 64 KiB: 366 noites cabem com folga (STRIDE T-1609). */
const MAX_BODY_BYTES = 65_536;

export interface PrlRouteDependencies extends AdminCommandDependencies {
  /** Disparo do outbox depois do commit; padrão: o da plataforma (injetável nos testes). */
  readonly afterCommit?: (log: LogPort) => void;
}

/**
 * Rotas `POST /v1/admin/prl` e `POST /v1/admin/prl/changes` da W16 (OpenAPI, tag `pricing`; D2 da ADR-0032): adaptadores
 * mínimos da entrada única do Admin sobre os mesmos handlers das Server Actions. PRL inicial: Admin ou Super Admin
 * (primeiro papel ativo, nessa ordem); alteração: só Super Admin (BR-181). AAL2 e papel revalidados (TECH-050).
 */
export function createPrlRoutes(dependencies: PrlRouteDependencies = {}) {
  const handlers = createPrlHandlers();
  return {
    publishInitialPrl: createAdminCommandRoute({
      ...dependencies,
      successStatus: HTTP_CREATED,
      maxBodyBytes: MAX_BODY_BYTES,
      command: () => ({ handler: handlers.publishInitialPrl, role: ['admin', 'super_admin'] }),
    }),
    changePublishedPrl: createAdminCommandRoute({
      ...dependencies,
      successStatus: HTTP_CREATED,
      maxBodyBytes: MAX_BODY_BYTES,
      command: () => ({ handler: handlers.changePublishedPrl, role: 'super_admin' }),
    }),
  };
}

const routes = createPrlRoutes();
export const publishInitialPrl = withRoute(routes.publishInitialPrl);
export const changePublishedPrl = withRoute(routes.changePublishedPrl);
