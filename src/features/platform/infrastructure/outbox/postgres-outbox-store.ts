import { sql } from 'kysely';
import type { OutboxEvent } from '../../application/outbox/consumers';
import type { OutboxStore } from '../../application/outbox/dispatcher';
import type { JsonObject } from '../../domain/json';
import type { Database, DatabaseTransaction } from '../database/connection';

const CONSUMER_SAVEPOINT = sql.raw('outbox_consumer');

/** Outbox no schema `app` (TECH-091): um evento por transação, travado com `FOR UPDATE SKIP LOCKED`. */
export function createPostgresOutboxStore(db: Database): OutboxStore<DatabaseTransaction> {
  return {
    withNextPending(skip, work) {
      return db
        .transaction()
        .setIsolationLevel('read committed')
        .execute(async (tx) => {
          let query = tx
            .selectFrom('app.outbox')
            .select(['id', 'event_type', 'dedup_key', 'operation_id', 'occurred_at', 'payload'])
            .where('delivered_at', 'is', null);
          if (skip.length > 0) query = query.where('id', 'not in', skip);
          const row = await query
            .orderBy('occurred_at')
            .orderBy('id')
            .limit(1)
            .forUpdate()
            .skipLocked()
            .executeTakeFirst();
          if (row === undefined) return null;
          const event: OutboxEvent = {
            id: row.id,
            type: row.event_type,
            dedupKey: row.dedup_key,
            operationId: row.operation_id,
            occurredAt: row.occurred_at,
            // A coluna só aceita objeto JSON (CHECK jsonb_typeof = 'object').
            payload: row.payload as JsonObject,
          };
          return { event, value: await work(event, tx) };
        });
    },

    async isolated(tx, work) {
      await sql`SAVEPOINT ${CONSUMER_SAVEPOINT}`.execute(tx);
      try {
        await work();
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT ${CONSUMER_SAVEPOINT}`.execute(tx);
        throw error;
      }
      await sql`RELEASE SAVEPOINT ${CONSUMER_SAVEPOINT}`.execute(tx);
    },

    async claimReceipt(tx, eventId, consumer, at) {
      const row = await tx
        .insertInto('app.outbox_receipt')
        .values({ event_id: eventId, consumer, received_at: at })
        .onConflict((conflict) => conflict.columns(['event_id', 'consumer']).doNothing())
        .returning('event_id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async markDelivered(tx, eventId, at) {
      await tx
        .updateTable('app.outbox')
        .set((eb) => ({ delivered_at: at, attempts: eb('attempts', '+', 1) }))
        .where('id', '=', eventId)
        .execute();
    },

    async markFailed(tx, eventId, errorName) {
      await tx
        .updateTable('app.outbox')
        .set((eb) => ({ last_error: errorName, attempts: eb('attempts', '+', 1) }))
        .where('id', '=', eventId)
        .execute();
    },
  };
}
