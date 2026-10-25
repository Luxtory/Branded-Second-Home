import { sql } from 'kysely';
import { CommandRejection, type Actor, type DatabaseTransaction } from '@/features/platform';

const STAFF_REFERENCE =
  /^staff_role:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Transactionally revalidate the exact Admin assignment that authorized the command (ADR-0021). */
export async function assertTransactionalAdminAuthority(
  tx: DatabaseTransaction,
  actor: Actor,
  authorizationRef: string,
): Promise<void> {
  const match = STAFF_REFERENCE.exec(authorizationRef);
  if (actor.kind !== 'user' || actor.role !== 'admin' || match?.[1] === undefined) {
    throw new CommandRejection('ERR_PERMISSION');
  }
  // PostgreSQL returns lowercase UUIDs: all representations must use the canonical revoke key (ADR-0021).
  const roleId = match[1].toLowerCase();
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended('app.staff_role:' || ${roleId}::text, 0))`.execute(
    tx,
  );
  // READ COMMITTED: this statement, after the lock, sees any revocation that won the race.
  const role = await tx
    .selectFrom('app.staff_role')
    .select('id')
    .where('id', '=', roleId)
    .where('user_id', '=', actor.userId)
    .where('role', '=', 'admin')
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (role === undefined) throw new CommandRejection('ERR_PERMISSION');
}
