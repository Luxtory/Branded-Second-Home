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
import { createPostgresGrantDirectory } from '../infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '../infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';
import { withAuth } from './server-auth';

export type TitularCommandResult<R> = CommandOutcome<R> | { readonly status: 'unauthenticated' };

/**
 * Server Action de um command do próprio usuário na Área do Titular (W7: ativação da delegação): sessão verificada →
 * guard → executor (TECH-054). O ator é o usuário com papel `titular`, sem party representada — a delegação pendente
 * ainda não o autoriza a representar ninguém.
 */
export async function executeTitularCommand<I, R extends JsonValue>(
  handler: CommandHandler<I, R, DatabaseTransaction>,
  input: unknown,
  key: string,
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
      clock: systemClock,
    });
    const executor = createProductionExecutor({ guard, log, database: database() });
    const outcome = await executor.execute(handler, {
      actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: 'titular' },
      idempotencyKey: key,
      correlationId,
      input,
    });
    if (outcome.status === 'committed' && !outcome.replayed) dispatchOutboxAfterCommit(log);
    return outcome;
  });
}
