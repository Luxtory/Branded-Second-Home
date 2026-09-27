import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  commandRegistry,
  commandResponse,
  createProductionExecutor,
  errorResponse,
  getDatabase,
  idempotencyKey,
  isSameOrigin,
  systemClock,
  unavailableKeys,
  withRoute,
  type Clock,
  type CommandRegistry,
  type Database,
  type LogPort,
  type EnvSource,
  type RouteContext,
} from '@/features/platform';
import { createAuthorizationGuard } from '../application/authorization-guard';
import { createGrantAuthorizationHandler } from '../application/grant-authorization';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';
import type { CookieJar } from '../infrastructure/auth/cookie-jar';
import {
  createPostgresGrantDirectory,
  postgresGrantWriter,
} from '../infrastructure/postgres-grants';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';

export interface AdminCommandRouteDependencies {
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly database?: () => Database;
  readonly registry?: CommandRegistry;
  /** Disparo do outbox depois de um commit novo; padrão: `after()` do Next (TECH-091). */
  readonly afterCommit?: (log: LogPort) => void;
}

const HTTP_CREATED = 201;

// A sessão já foi renovada pelo `proxy.ts`; aqui os cookies só são lidos. Só os headers: o corpo fica intacto.
function requestCookies(request: Request): CookieJar {
  const cookies = new NextRequest(request.url, { headers: request.headers }).cookies;
  return { getAll: () => cookies.getAll(), setAll: () => undefined };
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

/**
 * `POST /v1/admin/authorization-grants` (OpenAPI `createAuthorizationGrant`): origem → sessão → corpo → pipeline de
 * commands com o guard do TECH-050/051 (REQ-014, REQ-095). Configuração ausente ou ambiente recusado → 503.
 */
export function createAuthorizationGrantRoute({
  source,
  clock = systemClock,
  database = () => getDatabase(source),
  registry = commandRegistry,
  afterCommit,
}: AdminCommandRouteDependencies = {}) {
  return async (request: Request, { correlationId, log }: RouteContext) => {
    if (!isSameOrigin(request)) return errorResponse('ERR_PERMISSION', correlationId);
    try {
      const session = await createAuthGateway(requestCookies(request), source, clock).session();
      if (session === null) return errorResponse('ERR_UNAUTHENTICATED', correlationId);
      const body = await readJson(request);
      if (!body.ok) return errorResponse('ERR_VALIDATION', correlationId);
      const guard = createAuthorizationGuard({
        session,
        staff: createPostgresStaffDirectory(database),
        grants: createPostgresGrantDirectory(database),
        clock,
      });
      const handler = createGrantAuthorizationHandler({
        registry,
        grants: postgresGrantWriter,
        newId: randomUUID,
      });
      const executor = createProductionExecutor({ guard, log, source, database: database() });
      const outcome = await executor.execute(handler, {
        // Papel exercido fixo porque a autoridade de `grant_authorization` é só "Admin"; o guard confere que ele está
        // ativo. Rota de command "Admin ou Super Admin" precisa deixar o staff escolher o papel exercido (ADR-0008).
        actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: 'admin' },
        idempotencyKey: idempotencyKey(request),
        correlationId,
        input: body.value,
      });
      return commandResponse(outcome, {
        correlationId,
        successStatus: HTTP_CREATED,
        log,
        ...(afterCommit === undefined ? {} : { afterCommit }),
      });
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('admin command unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
  };
}

export const createAuthorizationGrant = withRoute(createAuthorizationGrantRoute());
