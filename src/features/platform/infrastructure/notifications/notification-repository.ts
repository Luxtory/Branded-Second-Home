import { randomUUID } from 'node:crypto';
import type { JsonObject } from '../../domain/json';
import type { DatabaseTransaction } from '../database/connection';

export interface NotificationDraft {
  readonly eventId: string;
  readonly recipientPartyId: string;
  readonly kind: string;
  readonly data: JsonObject;
  readonly at: Date;
}

/**
 * Notificação dentro do app, gravada por um consumidor do outbox (TECH-091). O mesmo evento nunca notifica duas vezes
 * o mesmo destinatário com o mesmo tipo; `false` = já notificado.
 */
export async function recordNotification(
  tx: DatabaseTransaction,
  draft: NotificationDraft,
): Promise<boolean> {
  const row = await tx
    .insertInto('app.notification')
    .values({
      id: randomUUID(),
      event_id: draft.eventId,
      recipient_party_id: draft.recipientPartyId,
      kind: draft.kind,
      data: JSON.stringify(draft.data),
      created_at: draft.at,
    })
    .onConflict((conflict) =>
      conflict.columns(['event_id', 'recipient_party_id', 'kind']).doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
