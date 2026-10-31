import { headers } from 'next/headers';
import {
  createProductionExecutor,
  dispatchOutboxAfterCommit,
  getDatabase,
  resolveCorrelationId,
  systemClock,
  type CommandHandler,
  type CommandOutcome,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { createAuthorizationGuard } from '../application/authorization-guard';
import type { HoldingDirectory } from '../application/party-ports';
import { createPostgresGrantDirectory } from '../infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '../infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';
import { withAuth } from './server-auth';

export type TitularCommandResult<R> = CommandOutcome<R> | { readonly status: 'unauthenticated' };

/**
 * Party que o usuário representa no command (W12): o guard confere a delegação vigente e a holding dela pelo diretório
 * injetado por quem executa (o identity não importa o ownership).
 */
export interface TitularRepresentation {
  readonly partyId: string;
  readonly holdings: HoldingDirectory;
}

/**
 * Server Action de um command do próprio usuário na Área do Titular: sessão verificada → guard → executor (TECH-054).
 * Sem representação (W7: ativação da delegação), o ator não representa ninguém; com ela (W12: uso próprio), representa
 * a party informada, o que o guard só aceita com delegação e holding vigentes.
 */
export async function executeTitularCommand<I, R extends JsonValue>(
  handler: CommandHandler<I, R, DatabaseTransaction>,
  input: unknown,
  key: string,
  representation?: TitularRepresentation,
): Promise<TitularCommandResult<R> | 'unavailable'> {
  const correlationId = resolveCorrelationId(await headers());
  return withAuth(false, async (gateway, log) => {
    const session = await gateway.session();
    if (session === null) return { status: 'unauthenticated' } as const;
    const database = () => getDatabase();
    const guard = createAuthorizationGuard({
      session,
      staff: createPostgresStaffDirectory(database),
      grants: createPostgresGrantDirectory(database),
      delegations: createPostgresDelegationDirectory(database),
      holdings: representation?.holdings,
      clock: systemClock,
    });
    const executor = createProductionExecutor({ guard, log, database: database() });
    const outcome = await executor.execute(handler, {
      actor: {
        kind: 'user',
        userId: session.userId,
        actingPartyId: representation?.partyId ?? null,
        role: 'titular',
      },
      idempotencyKey: key,
      correlationId,
      input,
    });
    if (outcome.status === 'committed' && !outcome.replayed) dispatchOutboxAfterCommit(log);
    return outcome;
  });
}
