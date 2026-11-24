import { z } from 'zod';
import {
  CapabilityNotActivatedError,
  commandResponse,
  createProductionExecutor,
  errorResponse,
  getDatabase,
  idempotencyKey,
  isSameOrigin,
  systemClock,
  unavailableKeys,
  type Clock,
  type CommandHandler,
  type Database,
  type DatabaseTransaction,
  type EnvSource,
  type JsonValue,
  type LogPort,
  type RouteContext,
} from '@/features/platform';
import { createAuthorizationGuard } from '../application/authorization-guard';
import type { HoldingDirectory } from '../application/party-ports';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';
import { postgresMembershipGate } from '../infrastructure/postgres-membership';
import { createPostgresGrantDirectory } from '../infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '../infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';
import { readCommandBody, requestCookies } from './admin-command';

const representation = z.object({ party_id: z.uuid() }).loose();

export interface TitularCommandRouteOptions<I, R extends JsonValue> {
  readonly handler: () => CommandHandler<I, R, DatabaseTransaction>;
  /** Holdings da party representada (o identity não importa o ownership: quem monta a rota injeta). */
  readonly holdings: (database: () => Database) => HoldingDirectory;
  readonly successStatus: number;
  readonly maxBodyBytes: number;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly database?: () => Database;
  /** Disparo do outbox depois de um commit novo; padrão: `after()` do Next (TECH-091). */
  readonly afterCommit?: (log: LogPort) => void;
}

/**
 * `POST /v1/*` de um command do próprio Titular (W20; TECH-050, TECH-054, TECH-056, TECH-100): mesma origem → sessão
 * verificada → corpo JSON limitado → `party_id` representada (delegação e holding vigentes, revalidadas pelo guard e na
 * transação) → executor com a verificação de Membership. O corpo sem `party_id` é a entrada do command. Funcionalidade
 * fechada (capability sem linha) → 503 `ERR_UNAVAILABLE`, nada gravado; configuração ausente → 503.
 */
export function createTitularCommandRoute<I, R extends JsonValue>(
  options: TitularCommandRouteOptions<I, R>,
) {
  const database = options.database ?? (() => getDatabase(options.source));
  const clock = options.clock ?? systemClock;
  return async (request: Request, { correlationId, log }: RouteContext) => {
    if (!isSameOrigin(request)) return errorResponse('ERR_PERMISSION', correlationId);
    try {
      const session = await createAuthGateway(
        requestCookies(request),
        options.source,
        clock,
      ).session();
      if (session === null) return errorResponse('ERR_UNAUTHENTICATED', correlationId);
      const body = await readCommandBody(request, options.maxBodyBytes);
      if (!body.ok) return errorResponse(body.code, correlationId);
      const parsed = representation.safeParse(body.value);
      if (!parsed.success) return errorResponse('ERR_VALIDATION', correlationId);
      const { party_id: partyId, ...input } = parsed.data;
      const guard = createAuthorizationGuard({
        session,
        staff: createPostgresStaffDirectory(database),
        grants: createPostgresGrantDirectory(database),
        delegations: createPostgresDelegationDirectory(database),
        holdings: options.holdings(database),
        clock,
      });
      const executor = createProductionExecutor({
        guard,
        log,
        source: options.source,
        database: database(),
        membership: postgresMembershipGate,
      });
      const outcome = await executor.execute(options.handler(), {
        actor: { kind: 'user', userId: session.userId, actingPartyId: partyId, role: 'titular' },
        idempotencyKey: idempotencyKey(request),
        correlationId,
        input,
      });
      return commandResponse(outcome, {
        correlationId,
        successStatus: options.successStatus,
        log,
        ...(options.afterCommit === undefined ? {} : { afterCommit: options.afterCommit }),
      });
    } catch (error) {
      if (error instanceof CapabilityNotActivatedError) {
        log.info('titular command not activated', { capability: error.capability });
        return errorResponse('ERR_UNAVAILABLE', correlationId);
      }
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('titular command unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
  };
}
