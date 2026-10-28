import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform/application/commands/executor';
import {
  ConsumerRegistry,
  type OutboxConsumer,
} from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import type {
  Database,
  DatabaseTransaction,
} from '@/features/platform/infrastructure/database/connection';
import { recordNotification } from '@/features/platform/infrastructure/notifications/notification-repository';
import {
  enqueueOutboxEvent,
  recordSystemAudit,
} from '@/features/platform/infrastructure/outbox/consumer-effects';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import {
  ADMIN,
  appDatabase,
  deferred,
  testClock,
  testExecutor,
} from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

const RECIPIENT = '00000000-0000-4000-8000-0000000000c1';
type Consumer = OutboxConsumer<DatabaseTransaction>;

/** Command de teste que só audita e emite `count` eventos. */
const emitting: CommandHandler<{ count: number }, null, DatabaseTransaction> = {
  command: 'test_command',
  input: z.object({ count: z.number() }),
  execute: ({ input, operationId, audit, emit }) => {
    audit({ objectType: 'test_event', objectId: operationId, before: null, after: null });
    for (let i = 0; i < input.count; i += 1) {
      emit({ type: 'platform.test_happened', dedupKey: `${operationId}:${i}`, payload: { i } });
    }
    return Promise.resolve(null);
  },
};

function notifyingConsumer(onHandle: () => Promise<void> = () => Promise.resolve()): Consumer {
  return {
    name: 'test_notifier',
    eventTypes: ['platform.test_happened'],
    handle: vi.fn(async (event, tx) => {
      await onHandle();
      await recordNotification(tx, {
        eventId: event.id,
        recipientPartyId: RECIPIENT,
        kind: 'platform.test',
        data: { i: event.payload.i ?? null },
        at: testClock.now(),
      });
    }),
  };
}

describe('outbox em PostgreSQL real (TECH-091)', () => {
  let database: TestDatabase;
  let db: Database;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const emit = (count: number, key: string) =>
    testExecutor(db).executor.execute(emitting, {
      actor: ADMIN,
      idempotencyKey: key,
      correlationId: 'corr-outbox',
      input: { count },
    });
  const dispatch = (consumers: readonly Consumer[], batchSize = 10) =>
    dispatchOutbox({
      store: createPostgresOutboxStore(db),
      consumers: new ConsumerRegistry(consumers),
      clock: testClock,
      batchSize,
      log,
    });
  const scalar = async (query: string) =>
    (await database.pool.query<{ v: unknown }>(query)).rows[0]?.v;

  it('[TECH-091] outbox entrega ao menos uma vez, o consumidor ignora duplicatas e falha de entrega não desfaz o domínio', async () => {
    await emit(1, 'k-deliver');
    let failing = true;
    const flaky: Consumer = {
      name: 'test_flaky',
      eventTypes: ['platform.test_happened'],
      handle: vi.fn(() =>
        failing ? Promise.reject(new TypeError('boom com dado')) : Promise.resolve(),
      ),
    };
    const notifier = notifyingConsumer();

    expect(await dispatch([notifier, flaky])).toEqual({ delivered: 0, failed: 1 });
    expect(
      await scalar(
        `SELECT row(attempts, last_error, delivered_at IS NULL)::text AS v FROM app.outbox`,
      ),
    ).toBe('(1,TypeError,t)');
    expect(await scalar(`SELECT state AS v FROM app.operation`)).toBe('committed');

    failing = false;
    expect(await dispatch([notifier, flaky])).toEqual({ delivered: 1, failed: 0 });
    // Entrega repetida (queda antes de marcar entregue): o recibo impede um segundo efeito.
    await database.pool.query('UPDATE app.outbox SET delivered_at = NULL');
    expect(await dispatch([notifier, flaky])).toEqual({ delivered: 1, failed: 0 });

    expect(notifier.handle).toHaveBeenCalledTimes(1);
    expect(flaky.handle).toHaveBeenCalledTimes(2);
    expect(await scalar('SELECT count(*)::int AS v FROM app.notification')).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      'outbox delivery failed',
      expect.objectContaining({ consumer: 'test_flaky', error_name: 'TypeError' }),
    );
  });

  it('[CONC-12] duas varreduras em paralelo entregam cada evento uma única vez', async () => {
    await emit(1, 'k-parallel');
    const secondDone = deferred();
    const firstInside = deferred();
    const notifier = notifyingConsumer(async () => {
      firstInside.resolve();
      // A 2ª varredura roda inteira enquanto a 1ª segura o evento.
      await secondDone.promise;
    });

    const first = dispatch([notifier]);
    await firstInside.promise;
    const second = await dispatch([notifier]);
    secondDone.resolve();

    expect(second).toEqual({ delivered: 0, failed: 0 });
    expect(await first).toEqual({ delivered: 1, failed: 0 });
    expect(notifier.handle).toHaveBeenCalledTimes(1);
    expect(await scalar('SELECT count(*)::int AS v FROM app.notification')).toBe(1);
  });

  it('[ADR-0021] respeita lote/retry e retém eventos sem consumidor sem novas tentativas ou recibos', async () => {
    await emit(3, 'k-batch');
    const alwaysFailing: Consumer = {
      name: 'test_broken',
      eventTypes: ['platform.test_happened'],
      handle: () => Promise.reject(new Error('x')),
    };

    expect(await dispatch([alwaysFailing], 2)).toEqual({ delivered: 0, failed: 2 });
    const before = await database.pool.query('SELECT * FROM app.outbox ORDER BY id');
    expect(await dispatch([], 10)).toEqual({ delivered: 0, failed: 0 });
    expect((await database.pool.query('SELECT * FROM app.outbox ORDER BY id')).rows).toEqual(
      before.rows,
    );
    expect(await scalar('SELECT count(*)::int AS v FROM app.outbox_receipt')).toBe(0);
    expect(
      await scalar('SELECT count(*)::int AS v FROM app.outbox WHERE delivered_at IS NULL'),
    ).toBe(3);
  });

  it('[ADR-0021] desconhecidos anteriores maiores que o lote não bloqueiam conhecidos e ficam elegíveis com consumidor futuro', async () => {
    await emit(5, 'k-unknown');
    await database.pool.query(
      "UPDATE app.outbox SET event_type = 'platform.future_event', occurred_at = occurred_at - interval '1 second'",
    );
    const before = await database.pool.query('SELECT * FROM app.outbox ORDER BY id');
    await emit(1, 'k-known');

    expect(await dispatch([notifyingConsumer()], 2)).toEqual({ delivered: 1, failed: 0 });
    expect(
      (
        await database.pool.query(
          "SELECT * FROM app.outbox WHERE event_type = 'platform.future_event' ORDER BY id",
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await scalar('SELECT count(*)::int AS v FROM app.outbox_receipt')).toBe(1);

    const future: Consumer = {
      name: 'future_notifier',
      eventTypes: ['platform.future_event'],
      handle: vi.fn(() => Promise.resolve()),
    };
    expect(await dispatch([future], 10)).toEqual({ delivered: 5, failed: 0 });
    expect(future.handle).toHaveBeenCalledTimes(5);
    expect(
      await scalar('SELECT count(*)::int AS v FROM app.outbox WHERE delivered_at IS NULL'),
    ).toBe(0);
    expect(await scalar('SELECT count(*)::int AS v FROM app.outbox_receipt')).toBe(6);
  });

  it('[ADR-0021] lista vazia no store não abre transação nem seleciona eventos', async () => {
    const work = vi.fn();
    const transaction = vi.spyOn(db, 'transaction');
    await expect(createPostgresOutboxStore(db).withNextPending([], [], work)).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it('[TECH-091] a mesma notificação não é gravada duas vezes', async () => {
    await emit(1, 'k-notify');
    const eventId = String(await scalar('SELECT id AS v FROM app.outbox'));
    const draft = {
      eventId,
      recipientPartyId: RECIPIENT,
      kind: 'platform.test',
      data: {},
      at: testClock.now(),
    };

    const results = await db
      .transaction()
      .execute(async (tx) => [
        await recordNotification(tx, draft),
        await recordNotification(tx, draft),
      ]);

    expect(results).toEqual([true, false]);
  });

  // W9 (ADR-0022): elegibilidade temporal, ordem por tentativas, falha no COMMIT e seams de consumidor.
  const at = (offsetMs: number) => new Date(testClock.now().getTime() + offsetMs);
  const HOUR = 3_600_000;
  const dispatchAt = (consumers: readonly Consumer[], now: Date, batchSize = 10) =>
    dispatchOutbox({
      store: createPostgresOutboxStore(db),
      consumers: new ConsumerRegistry(consumers),
      clock: { now: () => now },
      batchSize,
      log,
    });
  const originOperation = async () => {
    await emit(1, `k-origin-${Math.random()}`);
    await database.pool.query("UPDATE app.outbox SET event_type = 'platform.origin_only'");
    return String(
      await scalar('SELECT id AS v FROM app.operation ORDER BY created_at DESC LIMIT 1'),
    );
  };

  it('[ADR-0022] evento com available_at futuro não ocupa o lote nem gera tentativa e é entregue no vencimento', async () => {
    const operationId = await originOperation();
    const enqueued = await db.transaction().execute(async (tx) => [
      await enqueueOutboxEvent(tx, {
        operationId,
        type: 'platform.test_happened',
        dedupKey: 'later',
        payload: { i: 1 },
        occurredAt: testClock.now(),
        availableAt: at(HOUR),
      }),
      await enqueueOutboxEvent(tx, {
        operationId,
        type: 'platform.test_happened',
        dedupKey: 'later',
        payload: { i: 1 },
        occurredAt: testClock.now(),
        availableAt: at(HOUR),
      }),
    ]);
    expect(enqueued).toEqual([true, false]);
    await emit(1, 'k-now');
    const notifier = notifyingConsumer();
    expect(await dispatchAt([notifier], at(0), 1)).toEqual({ delivered: 1, failed: 0 });
    expect(
      await scalar(
        "SELECT row(attempts, last_error IS NULL, delivered_at IS NULL)::text AS v FROM app.outbox WHERE dedup_key = 'later'",
      ),
    ).toBe('(0,t,t)');
    expect(await dispatchAt([notifier], at(HOUR - 1), 10)).toEqual({ delivered: 0, failed: 0 });
    expect(await dispatchAt([notifier], at(HOUR), 10)).toEqual({ delivered: 1, failed: 0 });
    expect(await scalar('SELECT count(*)::int AS v FROM app.outbox_receipt')).toBe(2);
  });

  it('[ADR-0022] falhas recorrentes de eventos devidos cedem a vez a eventos independentes', async () => {
    await emit(2, 'k-chronic');
    await database.pool.query(
      "UPDATE app.outbox SET event_type = 'platform.chronic', occurred_at = occurred_at - interval '1 minute'",
    );
    await emit(1, 'k-independent');
    const chronic: Consumer = {
      name: 'test_chronic',
      eventTypes: ['platform.chronic'],
      handle: () => Promise.reject(new RangeError('always')),
    };
    const notifier = notifyingConsumer();
    // Lote cheio de falhas: a primeira varredura só tenta os dois eventos mais antigos.
    expect(await dispatchAt([chronic, notifier], at(0), 2)).toEqual({ delivered: 0, failed: 2 });
    // Com mais tentativas, cedem a vez: o evento independente é entregue na varredura seguinte.
    expect(await dispatchAt([chronic, notifier], at(0), 2)).toEqual({ delivered: 1, failed: 1 });
    expect(notifier.handle).toHaveBeenCalledTimes(1);
    expect(
      await scalar(
        "SELECT max(attempts)::int AS v FROM app.outbox WHERE event_type = 'platform.chronic'",
      ),
    ).toBe(2);
  });

  it('[ADR-0022] falha no COMMIT da transação de um evento é registrada e a varredura continua', async () => {
    await database.pool.query(`
      CREATE TABLE app.test_deferred (id int);
      CREATE FUNCTION app.test_deferred_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'deferred failure' USING ERRCODE = 'check_violation'; END $$;
      CREATE CONSTRAINT TRIGGER test_deferred_fail AFTER INSERT ON app.test_deferred
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.test_deferred_fail();
      GRANT INSERT ON app.test_deferred TO luxtory_app;`);
    await emit(1, 'k-commit-fails');
    await database.pool.query(
      "UPDATE app.outbox SET event_type = 'platform.commit_fails', occurred_at = occurred_at - interval '1 minute'",
    );
    await emit(1, 'k-after');
    const commitFails: Consumer = {
      name: 'test_commit_fails',
      eventTypes: ['platform.commit_fails'],
      handle: async (_event, tx) => {
        // Passa no savepoint; a constraint diferida só falha no COMMIT da transação do evento.
        await sql`INSERT INTO app.test_deferred VALUES (1)`.execute(tx);
      },
    };
    const notifier = notifyingConsumer();
    expect(await dispatchAt([commitFails, notifier], at(0))).toEqual({ delivered: 1, failed: 1 });
    expect(
      await scalar(
        "SELECT row(attempts, last_error IS NOT NULL, delivered_at IS NULL)::text AS v FROM app.outbox WHERE event_type = 'platform.commit_fails'",
      ),
    ).toBe('(1,t,t)');
    expect(await scalar('SELECT count(*)::int AS v FROM app.test_deferred')).toBe(0);
    expect(
      await scalar(
        "SELECT count(*)::int AS v FROM app.outbox_receipt WHERE consumer = 'test_commit_fails'",
      ),
    ).toBe(0);
    expect(log.error).toHaveBeenCalledWith(
      'outbox delivery failed',
      expect.objectContaining({ event_type: 'platform.commit_fails', phase: 'commit' }),
    );
  });

  it('[TECH-092] auditoria de efeito de consumidor usa o papel system e a operação de origem', async () => {
    const operationId = await originOperation();
    await db.transaction().execute((tx) =>
      recordSystemAudit(tx, {
        operationId,
        at: testClock.now(),
        objectType: 'test_effect',
        objectId: 'x',
        authorizationRef: 'outbox:test',
        before: null,
        after: { ok: true },
      }),
    );
    expect(
      await scalar(
        "SELECT row(event_type, role, actor_user_id IS NULL, authorization_ref)::text AS v FROM app.audit_log WHERE object_type = 'test_effect'",
      ),
    ).toBe('(command,system,t,outbox:test)');
  });
});
