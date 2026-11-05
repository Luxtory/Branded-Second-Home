import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createHoldingDirectory } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { eventValidator } from '../../support/asyncapi';
import { captureLogger } from '../../support/capture-logger';
import type { BookingHarness, Titular } from './booking-support';
import type { Admin } from './lifecycle-support';

type Handler<I, R extends JsonValue> = CommandHandler<I, R, DatabaseTransaction>;

/**
 * Executor de produção (TECH-054) com os guards reais — Titular por delegação + holding, Admin por AAL2 + papel ativo —
 * sobre o PostgreSQL do harness, com os privilégios reais do `luxtory_app`. O logger é capturado para provar o que nunca
 * vai a log (D11).
 */
export function lifecycleRunner(h: BookingHarness, maxAttempts = 1) {
  const handlers = createOwnUseLifecycleHandlers();
  const log = captureLogger();

  function executor(session: { userId: string; assurance: 'aal1' | 'aal2' }) {
    const guard = createAuthorizationGuard({
      session,
      staff: createPostgresStaffDirectory(() => h.db),
      grants: createPostgresGrantDirectory(() => h.db),
      delegations: createPostgresDelegationDirectory(() => h.db),
      holdings: createHoldingDirectory(() => h.db),
      clock: systemClock,
    });
    return createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard,
      clock: systemClock,
      limits: { maxAttempts, lockTimeoutMs: 10_000 },
      log: log.logger,
      registry: commandRegistry,
    });
  }

  function asTitular<I, R extends JsonValue>(
    titular: Titular,
    handler: Handler<I, R>,
    input: unknown,
    key: string = randomUUID(),
  ) {
    return executor({ userId: titular.userId, assurance: 'aal1' }).execute(handler, {
      actor: {
        kind: 'user',
        userId: titular.userId,
        actingPartyId: titular.partyId,
        role: 'titular',
      },
      idempotencyKey: key,
      correlationId: randomUUID(),
      input,
    });
  }

  function asAdmin<I, R extends JsonValue>(
    admin: Admin,
    handler: Handler<I, R>,
    input: unknown,
    key: string = randomUUID(),
    assurance: 'aal1' | 'aal2' = 'aal2',
  ) {
    return executor({ userId: admin.userId, assurance }).execute(handler, {
      actor: { kind: 'user', userId: admin.userId, actingPartyId: null, role: 'admin' },
      idempotencyKey: key,
      correlationId: randomUUID(),
      input,
    });
  }

  return { handlers, asTitular, asAdmin, logs: log.entries };
}

export interface OutboxRow {
  readonly id: string;
  readonly type: string;
  readonly dedup_key: string;
  readonly operation_id: string;
  readonly occurred_at: string;
  readonly payload: Record<string, unknown>;
}

export async function outboxOf(h: BookingHarness, operationId: string): Promise<OutboxRow[]> {
  const { rows } = await h.database.pool.query<OutboxRow>(
    `SELECT id, event_type AS type, dedup_key, operation_id, to_char(occurred_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at, payload
       FROM app.outbox WHERE operation_id = $1`,
    [operationId],
  );
  return rows;
}

/**
 * Exatamente um evento da operação (spec booking §10.12, D7): o tipo da matriz, `dedup_key = <tipo>:<id da transição
 * da operação>`, o destinatário = party da holding da reserva, e envelope + payload válidos contra o AsyncAPI.
 */
export async function expectLifecycleEvent(
  h: BookingHarness,
  operationId: string,
  type: string,
  bookingId: string,
): Promise<Record<string, unknown>> {
  const events = await outboxOf(h, operationId);
  expect(events).toHaveLength(1);
  const [event] = events;
  const { rows } = await h.database.pool.query<{ transition: string; party: string }>(
    `SELECT t.id AS transition, ho.party_id AS party
       FROM app.booking_state_transition t
       JOIN app.booking b ON b.id = t.booking_id
       JOIN app.holding ho ON ho.id = b.holding_id
      WHERE t.operation_id = $1 AND t.booking_id = $2`,
    [operationId, bookingId],
  );
  expect(rows).toHaveLength(1);
  expect(event!.type).toBe(type);
  expect(event!.dedup_key).toBe(`${type}:${rows[0]!.transition}`);
  expect(event!.payload).toMatchObject({
    booking_id: bookingId,
    recipient_party_id: rows[0]!.party,
  });
  const validate = eventValidator(type);
  expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  return event!.payload;
}

export async function expectNoEvent(h: BookingHarness, operationId: string): Promise<void> {
  expect(await outboxOf(h, operationId)).toEqual([]);
}

/** Linhas que um command fechado ou recusado nunca deixa (operação, chave, evento). */
export async function commandTraces(h: BookingHarness, key: string) {
  const { rows } = await h.database.pool.query<{
    operations: number;
    states: string[];
    records: number;
    events: number;
  }>(
    `SELECT (SELECT count(*)::int FROM app.operation WHERE idempotency_key = $1) AS operations,
            (SELECT coalesce(array_agg(state ORDER BY state), '{}') FROM app.operation WHERE idempotency_key = $1)
              AS states,
            (SELECT count(*)::int FROM app.idempotency_record WHERE idempotency_key = $1) AS records,
            (SELECT count(*)::int FROM app.outbox o JOIN app.operation op ON op.id = o.operation_id
              WHERE op.idempotency_key = $1) AS events`,
    [key],
  );
  return rows[0]!;
}

/** Garante que um marcador (base ou referência de incidente) não aparece em log, outbox nem resultado (D11). */
export async function expectMarkerConfined(
  h: BookingHarness,
  logs: () => Record<string, unknown>[],
  marker: string,
  results: readonly unknown[],
): Promise<void> {
  expect(JSON.stringify(logs())).not.toContain(marker);
  const { rows } = await h.database.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM app.outbox WHERE payload::text LIKE '%' || $1 || '%'`,
    [marker],
  );
  expect(rows[0]!.n).toBe(0);
  for (const result of results) expect(JSON.stringify(result)).not.toContain(marker);
}
