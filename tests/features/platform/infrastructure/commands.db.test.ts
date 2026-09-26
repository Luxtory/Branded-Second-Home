import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform/application/commands/executor';
import { CommandRejection } from '@/features/platform/domain/errors';
import type { JsonValue } from '@/features/platform/domain/json';
import { LockOrderViolation } from '@/features/platform/domain/lock-order';
import type {
  Database,
  DatabaseTransaction,
} from '@/features/platform/infrastructure/database/connection';
import {
  ADMIN,
  TEST_NOW,
  appDatabase,
  createWidgetTable,
  deferred,
  testExecutor,
  waitForLockWaiter,
} from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

type Handler = CommandHandler<{ widget: string; to?: number }, JsonValue, DatabaseTransaction>;
type Execute = Handler['execute'];

const input = z.object({ widget: z.string(), to: z.number().optional() });

/** Handler de teste: trava a linha pela LockSequence, revalida, altera e audita antes/depois. */
function widgetHandler(
  options: { beforeWrite?: () => Promise<void>; execute?: Execute } = {},
): Handler {
  return {
    command: 'test_command',
    input,
    execute:
      options.execute ??
      (async ({ input: { widget, to }, tx, locks, audit, emit }) => {
        const [id] = locks.claim('stake', [widget]);
        const { rows } = await sql<{ n: number }>`
          SELECT n FROM app.test_widget WHERE id = ${id} FOR UPDATE`.execute(tx);
        const before = rows[0]?.n ?? 0;
        await options.beforeWrite?.();
        const after = to ?? before + 1;
        await sql`UPDATE app.test_widget SET n = ${after} WHERE id = ${id}`.execute(tx);
        audit({
          objectType: 'test_widget',
          objectId: widget,
          before: { n: before },
          after: { n: after, nome: 'X' },
        });
        emit({
          type: 'platform.test_widget_changed',
          dedupKey: `${widget}:${after}`,
          payload: { widget },
        });
        return { n: after };
      }),
  };
}

const request = (widget: string, idempotencyKey: string, to?: number) => ({
  actor: ADMIN,
  idempotencyKey,
  correlationId: 'corr-db-1',
  input: to === undefined ? { widget } : { widget, to },
});

describe('pipeline de commands em PostgreSQL real (TECH-054)', () => {
  let database: TestDatabase;
  let db: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
    await createWidgetTable(database.pool);
    db = appDatabase(database.appUrl);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const count = async (table: string, where = 'true') =>
    (
      await database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
      )
    ).rows[0]?.n;

  it('[REQ-015][PD-011] todo command registrado grava operation e audit_log com ator, parte representada, papel, instante, objeto, operation, base e antes/depois, sem dado pessoal bruto', async () => {
    const { executor } = testExecutor(db);

    const outcome = await executor.execute(widgetHandler(), request('w-1', 'k-audit'));

    expect(outcome).toMatchObject({ status: 'committed', result: { n: 1 }, replayed: false });
    const { rows: operations } = await database.pool.query('SELECT * FROM app.operation');
    expect(operations).toEqual([
      expect.objectContaining({
        command: 'test_command',
        actor_user_id: ADMIN.kind === 'user' ? ADMIN.userId : null,
        acting_party_id: ADMIN.kind === 'user' ? ADMIN.actingPartyId : null,
        role: 'admin',
        idempotency_key: 'k-audit',
        correlation_id: 'corr-db-1',
        authorization_ref: 'base:test',
        state: 'committed',
        created_at: TEST_NOW,
      }),
    ]);
    const { rows: audit } = await database.pool.query('SELECT * FROM app.audit_log');
    expect(audit).toEqual([
      expect.objectContaining({
        event_type: 'command',
        operation_id: operations[0]?.id,
        occurred_at: TEST_NOW,
        actor_user_id: operations[0]?.actor_user_id,
        acting_party_id: operations[0]?.acting_party_id,
        role: 'admin',
        object_type: 'test_widget',
        object_id: 'w-1',
        authorization_ref: 'base:test',
        before: { n: 0 },
        after: { n: 1, nome: '[redacted]' },
      }),
    ]);
    expect(await count('app.outbox', `operation_id = '${operations[0]?.id}'`)).toBe(1);
  });

  it('[ADR-006] mesma chave e payload repetem a resposta; payload diferente → ERR_IDEMPOTENCY_CONFLICT', async () => {
    const { executor } = testExecutor(db);

    const first = await executor.execute(widgetHandler(), request('w-1', 'k-replay'));
    const replay = await executor.execute(widgetHandler(), request('w-1', 'k-replay'));
    const conflict = await executor.execute(widgetHandler(), request('w-2', 'k-replay'));

    expect(replay).toEqual({ ...first, replayed: true });
    expect(conflict).toMatchObject({ status: 'rejected', code: 'ERR_IDEMPOTENCY_CONFLICT' });
    expect(await count('app.operation')).toBe(1);
    expect(await count('app.test_widget', `id = 'w-1' AND n = 1`)).toBe(1);
  });

  it('[ADR-005] a transação do command roda em READ COMMITTED com lock_timeout local, mesmo com outro padrão no banco', async () => {
    await database.pool.query(
      `ALTER DATABASE ${new URL(database.url).pathname.slice(1)} SET default_transaction_isolation = 'serializable'`,
    );
    const fresh = appDatabase(database.appUrl);
    const { executor } = testExecutor(fresh, { maxAttempts: 1, lockTimeoutMs: 250 });
    const seen: Record<string, string> = {};

    await executor.execute(
      widgetHandler({
        execute: async ({ tx, audit }) => {
          const isolation = await sql<{
            v: string;
          }>`SELECT current_setting('transaction_isolation') AS v`.execute(tx);
          const timeout = await sql<{
            v: string;
          }>`SELECT current_setting('lock_timeout') AS v`.execute(tx);
          seen.isolation = isolation.rows[0]?.v ?? '';
          seen.lockTimeout = timeout.rows[0]?.v ?? '';
          audit({ objectType: 'test_widget', objectId: 'w-1', before: null, after: null });
          return null;
        },
      }),
      request('w-1', 'k-isolation'),
    );
    await fresh.destroy();

    expect(seen).toEqual({ isolation: 'read committed', lockTimeout: '250ms' });
  });

  it('[TECH-053] lock fora da ordem é rejeitado e nada fica gravado', async () => {
    const { executor } = testExecutor(db);
    const outOfOrder = widgetHandler({
      execute: ({ locks }) => {
        locks.claim('payment', ['p-1']);
        locks.claim('stake', ['w-1']);
        return Promise.resolve(null);
      },
    });

    await expect(executor.execute(outOfOrder, request('w-1', 'k-order'))).rejects.toThrow(
      LockOrderViolation,
    );
    expect(await count('app.operation')).toBe(0);
    expect(await count('app.idempotency_record')).toBe(0);
  });

  it('[TECH-053] lock_timeout esgotado refaz a transação com a mesma chave e produz um único efeito', async () => {
    const blocker = await database.pool.connect();
    await blocker.query(`BEGIN; SELECT 1 FROM app.test_widget WHERE id = 'w-1' FOR UPDATE`);
    const { executor, log } = testExecutor(db, { maxAttempts: 3, lockTimeoutMs: 100 });
    // A 1ª tentativa esgota o lock_timeout; ao logar a nova tentativa, o bloqueio é liberado.
    log.warn.mockImplementation(() => {
      void blocker.query('COMMIT').finally(() => blocker.release());
    });

    const outcome = await executor.execute(widgetHandler(), request('w-1', 'k-retry'));

    expect(outcome).toMatchObject({ status: 'committed', result: { n: 1 } });
    expect(log.warn).toHaveBeenCalledWith('command retry', expect.objectContaining({ attempt: 1 }));
    expect(await count('app.operation')).toBe(1);
    expect(await count('app.audit_log')).toBe(1);
  });

  it('[CONC-12] duas chamadas simultâneas com a mesma chave produzem um único efeito e a mesma resposta', async () => {
    const { executor } = testExecutor(db);
    const firstStarted = deferred();
    const first = executor.execute(
      widgetHandler({
        beforeWrite: async () => {
          firstStarted.resolve();
          // A 2ª chamada precisa estar parada na reserva da mesma chave antes deste commit.
          await waitForLockWaiter(database.pool);
        },
      }),
      request('w-1', 'k-race'),
    );
    await firstStarted.promise;
    const second = executor.execute(widgetHandler(), request('w-1', 'k-race'));

    const [a, b] = await Promise.all([first, second]);

    expect(a).toMatchObject({ status: 'committed', replayed: false, result: { n: 1 } });
    expect(b).toEqual({ ...a, replayed: true });
    expect(await count('app.operation')).toBe(1);
    expect(await count('app.audit_log')).toBe(1);
    expect(await count('app.test_widget', `id = 'w-1' AND n = 1`)).toBe(1);
  });

  it('[REQ-098] recusa grava operation(failed) sem efeito e o replay repete a mesma causa', async () => {
    const { executor } = testExecutor(db);
    const refusing = widgetHandler({
      execute: async ({ tx }) => {
        await sql`UPDATE app.test_widget SET n = 99 WHERE id = 'w-1'`.execute(tx);
        throw new CommandRejection('ERR_WINDOW_NOT_OPEN');
      },
    });

    const first = await executor.execute(refusing, request('w-1', 'k-refuse'));
    const replay = await executor.execute(widgetHandler(), request('w-1', 'k-refuse'));

    expect(first).toMatchObject({
      status: 'rejected',
      code: 'ERR_WINDOW_NOT_OPEN',
      replayed: false,
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await count('app.operation', `state = 'failed'`)).toBe(1);
    expect(await count('app.test_widget', `n = 99`)).toBe(0);
    expect(await count('app.audit_log')).toBe(0);
  });

  it('[TECH-056] violação da constraint de ocupação vira ERR_BOOKING_CONFLICT', async () => {
    const { executor } = testExecutor(db);
    await executor.execute(widgetHandler(), request('w-1', 'k-occupy-1', 100));

    const conflict = await executor.execute(widgetHandler(), request('w-2', 'k-occupy-2', 100));

    expect(conflict).toMatchObject({ status: 'rejected', code: 'ERR_BOOKING_CONFLICT' });
    expect(await count('app.test_widget', `n = 100`)).toBe(1);
  });
});
