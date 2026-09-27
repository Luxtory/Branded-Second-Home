import { randomUUID } from 'node:crypto';
import {
  commandRegistry,
  withRoute,
  type CommandRegistry,
  type LogPort,
} from '@/features/platform';
import { createGrantAuthorizationHandler } from '../application/grant-authorization';
import { postgresGrantWriter } from '../infrastructure/postgres-grants';
import { createAdminCommandRoute, type AdminCommandDependencies } from './admin-command';

export interface AdminCommandRouteDependencies extends AdminCommandDependencies {
  readonly registry?: CommandRegistry;
  /** Disparo do outbox depois de um commit novo; padrão: `after()` do Next (TECH-091). */
  readonly afterCommit?: (log: LogPort) => void;
}

const HTTP_CREATED = 201;

/**
 * `POST /v1/admin/authorization-grants` (OpenAPI `createAuthorizationGrant`), pela entrada única dos commands do Admin
 * (REQ-014, REQ-095). A autoridade de `grant_authorization` é só "Admin": o papel exercido é Admin (ADR-0008).
 */
export function createAuthorizationGrantRoute({
  registry = commandRegistry,
  ...dependencies
}: AdminCommandRouteDependencies = {}) {
  return createAdminCommandRoute({
    ...dependencies,
    successStatus: HTTP_CREATED,
    command: () => ({
      handler: createGrantAuthorizationHandler({
        registry,
        grants: postgresGrantWriter,
        newId: randomUUID,
      }),
      role: 'admin',
    }),
  });
}

export const createAuthorizationGrant = withRoute(createAuthorizationGrantRoute());
