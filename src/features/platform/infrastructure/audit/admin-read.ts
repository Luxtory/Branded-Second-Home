import type { Actor } from '../../application/commands/actor';
import type { Database, DatabaseTransaction } from '../database/connection';

export interface AdminReadRecord {
  readonly actor: Extract<Actor, { kind: 'user' }>;
  readonly objectType: string;
  readonly objectId: string;
  /** Papel de staff ou grant que autorizou a leitura (TECH-002). */
  readonly authorizationRef: string;
  readonly at: Date;
}

/** Leitura administrativa é evento próprio do `audit_log` (TECH-092): quem leu, com qual papel e base, e o quê. */
export async function recordAdminRead(
  db: Database | DatabaseTransaction,
  record: AdminReadRecord,
): Promise<void> {
  await db
    .insertInto('app.audit_log')
    .values({
      event_type: 'admin_read',
      operation_id: null,
      occurred_at: record.at,
      actor_user_id: record.actor.userId,
      acting_party_id: record.actor.actingPartyId,
      role: record.actor.role,
      object_type: record.objectType,
      object_id: record.objectId,
      authorization_ref: record.authorizationRef,
      before: null,
      after: null,
    })
    .execute();
}
