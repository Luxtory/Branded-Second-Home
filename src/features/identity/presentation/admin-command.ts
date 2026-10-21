import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import {
  commandResponse,
  createProductionExecutor,
  dispatchOutboxAfterCommit,
  errorResponse,
  getDatabase,
  idempotencyKey,
  isSameOrigin,
  resolveCorrelationId,
  systemClock,
  unavailableKeys,
  type Clock,
  type CommandHandler,
  type CommandOutcome,
  type Database,
  type DatabaseTransaction,
  type EnvSource,
  type JsonValue,
  type LogPort,
  type RouteContext,
} from '@/features/platform';
import { createAuthorizationGuard } from '../application/authorization-guard';
import type { VerifiedSession } from '../domain/session';
import type { StaffRole } from '../domain/staff';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';
import type { CookieJar } from '../infrastructure/auth/cookie-jar';
import { createPostgresGrantDirectory } from '../infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '../infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';
import { withAuth } from './server-auth';

/**
 * Entrada única dos commands do Admin (ADR-0008, ADR-0010 §6): a rota REST e a Server Action passam pelo mesmo caminho
 * — sessão verificada → guard → executor (TECH-054). O papel exercido é **explícito** e fica na `operation` e no
 * `audit_log`; Admin e Super Admin não são hierárquicos (o guard só aceita o papel que a autoridade pede).
 */
export interface AdminCommand<I, R extends JsonValue> {
  readonly handler: CommandHandler<I, R, DatabaseTransaction>;
  readonly role: StaffRole;
}

export interface AdminCommandDependencies {
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly database?: () => Database;
}

export type AdminCommandResult<R> = CommandOutcome<R> | { readonly status: 'unauthenticated' };

interface CommandCall {
  readonly input: unknown;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly log: LogPort;
}

async function runAdminCommand<I, R extends JsonValue>(
  session: VerifiedSession | null,
  command: AdminCommand<I, R>,
  call: CommandCall,
  { source, clock = systemClock, database = () => getDatabase(source) }: AdminCommandDependencies,
): Promise<AdminCommandResult<R>> {
  if (session === null) return { status: 'unauthenticated' };
  const guard = createAuthorizationGuard({
    session,
    staff: createPostgresStaffDirectory(database),
    grants: createPostgresGrantDirectory(database),
    delegations: createPostgresDelegationDirectory(database),
    clock,
  });
  const executor = createProductionExecutor({ guard, log: call.log, source, database: database() });
  return executor.execute(command.handler, {
    actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: command.role },
    idempotencyKey: call.idempotencyKey,
    correlationId: call.correlationId,
    input: call.input,
  });
}

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

export interface AdminCommandRouteOptions<I, R extends JsonValue> extends AdminCommandDependencies {
  /** Command do request (montado a cada request: o registro e as dependências podem ser injetados). */
  readonly command: () => AdminCommand<I, R>;
  readonly successStatus: number;
  /** Corpo JSON + parâmetros do caminho → entrada do command. Padrão: o corpo. */
  readonly input?: (body: unknown, params: Readonly<Record<string, string>>) => unknown;
  /** Disparo do outbox depois de um commit novo; padrão: `after()` do Next (TECH-091). */
  readonly afterCommit?: (log: LogPort) => void;
}

type RouteSegment = { readonly params: Promise<Readonly<Record<string, string>>> };

/**
 * `POST /v1/admin/*`: origem (TECH-100) → sessão → corpo → pipeline de commands. Configuração ausente ou ambiente
 * recusado → 503.
 */
export function createAdminCommandRoute<I, R extends JsonValue>(
  options: AdminCommandRouteOptions<I, R>,
) {
  const toInput = options.input ?? ((body: unknown) => body);
  return async (request: Request, { correlationId, log }: RouteContext, segment?: RouteSegment) => {
    if (!isSameOrigin(request)) return errorResponse('ERR_PERMISSION', correlationId);
    try {
      const auth = createAuthGateway(
        requestCookies(request),
        options.source,
        options.clock ?? systemClock,
      );
      const session = await auth.session();
      if (session === null) return errorResponse('ERR_UNAUTHENTICATED', correlationId);
      const body = await readJson(request);
      if (!body.ok) return errorResponse('ERR_VALIDATION', correlationId);
      const params = segment === undefined ? {} : await segment.params;
      const outcome = await runAdminCommand(
        session,
        options.command(),
        {
          input: toInput(body.value, params),
          idempotencyKey: idempotencyKey(request),
          correlationId,
          log,
        },
        options,
      );
      if (outcome.status === 'unauthenticated')
        return errorResponse('ERR_UNAUTHENTICATED', correlationId);
      return commandResponse(outcome, {
        correlationId,
        successStatus: options.successStatus,
        log,
        ...(options.afterCommit === undefined ? {} : { afterCommit: options.afterCommit }),
      });
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('admin command unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
  };
}

/**
 * Server Action de um formulário do Admin: mesma entrada da API, com a sessão do request. Configuração ausente ou Auth
 * recusado no ambiente → `'unavailable'`.
 */
export async function executeAdminCommand<I, R extends JsonValue>(
  command: AdminCommand<I, R>,
  input: unknown,
  key: string,
): Promise<AdminCommandResult<R> | 'unavailable'> {
  const correlationId = resolveCorrelationId(await headers());
  return withAuth(false, async (gateway, log) => {
    const outcome = await runAdminCommand(
      await gateway.session(),
      command,
      { input, idempotencyKey: key, correlationId, log },
      {},
    );
    if (outcome.status === 'committed' && !outcome.replayed) dispatchOutboxAfterCommit(log);
    return outcome;
  });
}
