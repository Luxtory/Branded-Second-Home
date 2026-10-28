import { randomUUID } from 'node:crypto';
import type { JsonObject, JsonValue } from '../../domain/json';
import type { DatabaseTransaction } from '../database/connection';

/** Evento seguinte enfileirado por um consumidor na própria transação (ADR-0022 §5). */
export interface ConsumerEventDraft {
  /** Operação de origem (TECH-002): a mesma do evento recebido. */
  readonly operationId: string;
  readonly type: string;
  readonly dedupKey: string;
  readonly payload: JsonObject;
  readonly occurredAt: Date;
  /** Primeiro instante de entrega; ausente = imediato. */
  readonly availableAt?: Date;
}

/**
 * Mesma deduplicação dos commands (`dedup_key` único, `ON CONFLICT DO NOTHING`): reentrega do consumidor não duplica
 * o evento. `false` = já enfileirado.
 */
export async function enqueueOutboxEvent(
  tx: DatabaseTransaction,
  draft: ConsumerEventDraft,
): Promise<boolean> {
  const row = await tx
    .insertInto('app.outbox')
    .values({
      id: randomUUID(),
      operation_id: draft.operationId,
      event_type: draft.type,
      dedup_key: draft.dedupKey,
      payload: JSON.stringify(draft.payload),
      occurred_at: draft.occurredAt,
      available_at: draft.availableAt ?? null,
    })
    .onConflict((conflict) => conflict.column('dedup_key').doNothing())
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

export interface SystemAuditRecord {
  readonly operationId: string;
  readonly at: Date;
  readonly objectType: string;
  readonly objectId: string;
  /** Base registrada do efeito (TECH-002), por exemplo o evento de origem. */
  readonly authorizationRef: string;
  readonly before: JsonValue | null;
  readonly after: JsonValue | null;
}

/** Auditoria de efeito de consumidor (TECH-092): papel `system`, sem ator humano, na operação de origem. */
export async function recordSystemAudit(
  tx: DatabaseTransaction,
  record: SystemAuditRecord,
): Promise<void> {
  await tx
    .insertInto('app.audit_log')
    .values({
      event_type: 'command',
      operation_id: record.operationId,
      occurred_at: record.at,
      actor_user_id: null,
      acting_party_id: null,
      role: 'system',
      object_type: record.objectType,
      object_id: record.objectId,
      authorization_ref: record.authorizationRef,
      before: record.before === null ? null : JSON.stringify(record.before),
      after: record.after === null ? null : JSON.stringify(record.after),
    })
    .execute();
}
