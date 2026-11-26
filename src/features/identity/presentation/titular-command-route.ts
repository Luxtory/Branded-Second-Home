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
  type CommandOutcome,
  type JsonValue,
  type LogPort,
  type RouteContext,
} from '@/features/platform';
import type { VerifiedSession } from '../domain/session';
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
  /** W21: a entrada do command mantém `party_id` (escopo `party` do guard do solicitante). */
  readonly includePartyId?: boolean;
  /** W21: campos da entrada vindos do caminho (ex.: id da Request); `null` → 400 `ERR_VALIDATION`. */
  readonly pathInput?: (request: Request) => Record<string, unknown> | null;
  /**
   * W21: efeito depois do desfecho (recusa, commit ou falha técnica — `null`), agendado para depois da resposta
   * (`after()` do Next, padrão): estornos, recuperação de pagamento e disparos. Nunca muda o desfecho do command.
   */
  readonly afterOutcome?: (
    outcome: CommandOutcome<R> | null,
    details: {
      readonly input: unknown;
      readonly partyId: string;
      readonly userId: string;
      readonly log: LogPort;
      readonly correlationId: string;
    },
  ) => void;
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
      const { party_id: partyId, ...rest } = parsed.data;
      const fromPath = options.pathInput === undefined ? {} : options.pathInput(request);
      if (fromPath === null) return errorResponse('ERR_VALIDATION', correlationId);
      const input = {
        ...rest,
        ...fromPath,
        ...(options.includePartyId === true ? { party_id: partyId } : {}),
      };
      const details = { input, partyId, userId: session.userId, log, correlationId };
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
      let outcome: CommandOutcome<R>;
      try {
        outcome = await executor.execute(options.handler(), {
          actor: { kind: 'user', userId: session.userId, actingPartyId: partyId, role: 'titular' },
          idempotencyKey: idempotencyKey(request),
          correlationId,
          input,
        });
      } catch (error) {
        if (!(error instanceof CapabilityNotActivatedError)) options.afterOutcome?.(null, details);
        throw error;
      }
      options.afterOutcome?.(outcome, details);
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

export interface TitularSessionRouteOptions {
  readonly maxBodyBytes: number;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Trabalho da rota com a sessão verificada e o corpo JSON lido (limite já conferido). */
  readonly run: (context: {
    readonly request: Request;
    readonly session: VerifiedSession;
    readonly body: unknown;
    readonly correlationId: string;
    readonly log: LogPort;
  }) => Promise<Response>;
}

/**
 * `POST /v1/*` do Titular que não é um command (W21: prévia e pagamento da Taxa da Request): mesma origem → sessão
 * verificada → corpo JSON limitado → trabalho da rota, que revalida a representação. Funcionalidade fechada ou
 * configuração ausente → 503 `ERR_UNAVAILABLE`, nada gravado.
 */
export function createTitularSessionRoute(options: TitularSessionRouteOptions) {
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
      return await options.run({ request, session, body: body.value, correlationId, log });
    } catch (error) {
      if (error instanceof CapabilityNotActivatedError) {
        log.info('titular route not activated', { capability: error.capability });
        return errorResponse('ERR_UNAVAILABLE', correlationId);
      }
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('titular route unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
  };
}
