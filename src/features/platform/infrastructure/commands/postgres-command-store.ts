import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { actorRole } from '../../application/commands/actor';
import type {
  AuditRecord,
  CommandStore,
  IdempotencyEntry,
  OperationDraft,
  OutboxEventDraft,
  StoredResponse,
} from '../../application/commands/ports';
import type { RejectionCode } from '../../domain/errors';
import type { JsonValue } from '../../domain/json';
import type { Database, DatabaseTransaction } from '../database/connection';
import { isTransientDatabaseError, violatedConstraint } from '../database/errors';

// jsonb sempre como texto JSON: o `pg` converteria arrays JavaScript em arrays do PostgreSQL.
const jsonb = (value: JsonValue): string => JSON.stringify(value);

const operationRow = (draft: OperationDraft, state: 'pending' | 'failed') => ({
  id: draft.id,
  command: draft.command,
  actor_user_id: draft.actor.kind === 'user' ? draft.actor.userId : null,
  acting_party_id: draft.actor.kind === 'user' ? draft.actor.actingPartyId : null,
  role: actorRole(draft.actor),
  second_home_id: draft.secondHomeId,
  idempotency_key: draft.idempotencyKey,
  correlation_id: draft.correlationId,
  authorization_ref: draft.authorizationRef,
  state,
  created_at: draft.at,
  updated_at: draft.at,
});

const auditRow = (draft: OperationDraft, record: AuditRecord) => ({
  event_type: 'command',
  operation_id: draft.id,
  occurred_at: draft.at,
  actor_user_id: draft.actor.kind === 'user' ? draft.actor.userId : null,
  acting_party_id: draft.actor.kind === 'user' ? draft.actor.actingPartyId : null,
  role: actorRole(draft.actor),
  object_type: record.objectType,
  object_id: record.objectId,
  authorization_ref: draft.authorizationRef,
  before: record.before === null ? null : jsonb(record.before),
  after: record.after === null ? null : jsonb(record.after),
});

const outboxRow = (draft: OperationDraft, event: OutboxEventDraft) => ({
  id: randomUUID(),
  operation_id: draft.id,
  event_type: event.type,
  dedup_key: event.dedupKey,
  payload: jsonb(event.payload),
  occurred_at: draft.at,
});

function storedResponse(outcome: string | null, response: unknown): StoredResponse | null {
  if (outcome === null || response === null || typeof response !== 'object') return null;
  const body = response as { result?: JsonValue; code?: RejectionCode };
  if (outcome === 'committed') return { outcome, result: body.result ?? null };
  return body.code === undefined ? null : { outcome: 'rejected', code: body.code };
}

// Chave usada por outra transação que já comitou: desfaz a gravação da recusa.
class RejectionKeyTaken extends Error {}

/** Persistência do pipeline de commands no schema `app` (ADR-0006). */
export function createPostgresCommandStore(db: Database): CommandStore<DatabaseTransaction> {
  const reserveKey = (tx: DatabaseTransaction, draft: OperationDraft, extra: object = {}) =>
    tx
      .insertInto('app.idempotency_record')
      .values({
        scope: draft.scope,
        idempotency_key: draft.idempotencyKey,
        command: draft.command,
        request_hash: draft.requestHash,
        operation_id: draft.id,
        created_at: draft.at,
        ...extra,
      })
      .onConflict((conflict) => conflict.columns(['scope', 'idempotency_key']).doNothing())
      .returning('operation_id')
      .executeTakeFirst();

  return {
    async findIdempotency(scope, idempotencyKey): Promise<IdempotencyEntry | null> {
      const row = await db
        .selectFrom('app.idempotency_record')
        .select(['command', 'request_hash', 'operation_id', 'outcome', 'response'])
        .where('scope', '=', scope)
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();
      if (row === undefined) return null;
      return {
        command: row.command,
        requestHash: row.request_hash,
        operationId: row.operation_id,
        response: storedResponse(row.outcome, row.response),
      };
    },

    transaction(lockTimeoutMs, work) {
      return db
        .transaction()
        .setIsolationLevel('read committed')
        .execute(async (tx) => {
          await sql`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`.execute(tx);
          return work(tx);
        });
    },

    async reserve(tx, draft) {
      await tx.insertInto('app.operation').values(operationRow(draft, 'pending')).execute();
      return (await reserveKey(tx, draft)) !== undefined;
    },

    async complete(tx, draft, result, audit, events) {
      await tx
        .insertInto('app.audit_log')
        .values(audit.map((record) => auditRow(draft, record)))
        .execute();
      if (events.length > 0) {
        await tx
          .insertInto('app.outbox')
          .values(events.map((event) => outboxRow(draft, event)))
          .onConflict((conflict) => conflict.column('dedup_key').doNothing())
          .execute();
      }
      await tx
        .updateTable('app.operation')
        .set({ state: 'committed', updated_at: draft.at })
        .where('id', '=', draft.id)
        .execute();
      await tx
        .updateTable('app.idempotency_record')
        .set({ outcome: 'committed', response: jsonb({ result }) })
        .where('scope', '=', draft.scope)
        .where('idempotency_key', '=', draft.idempotencyKey)
        .execute();
    },

    async recordRejection(draft, code) {
      try {
        return await db
          .transaction()
          .setIsolationLevel('read committed')
          .execute(async (tx) => {
            await tx.insertInto('app.operation').values(operationRow(draft, 'failed')).execute();
            const extra = { outcome: 'rejected', response: jsonb({ code }) };
            if ((await reserveKey(tx, draft, extra)) === undefined) throw new RejectionKeyTaken();
            return true;
          });
      } catch (error) {
        if (error instanceof RejectionKeyTaken) return false;
        throw error;
      }
    },

    isTransient: isTransientDatabaseError,
    violatedConstraint,
  };
}
