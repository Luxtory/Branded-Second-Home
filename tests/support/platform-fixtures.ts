import { setTimeout as sleep } from 'node:timers/promises';
import type pg from 'pg';
import { vi } from 'vitest';
import type { Actor } from '@/features/platform/application/commands/actor';
import { createCommandExecutor } from '@/features/platform/application/commands/executor';
import type { CommandGuard } from '@/features/platform/application/commands/ports';
import { CommandRegistry } from '@/features/platform/application/commands/registry';
import { createPostgresCommandStore } from '@/features/platform/infrastructure/commands/postgres-command-store';
import {
  createDatabase,
  parseDatabaseUrl,
  type Database,
} from '@/features/platform/infrastructure/database/connection';

export const TEST_NOW = new Date('2026-09-26T12:00:00.000Z');
export const testClock = { now: () => TEST_NOW };

export const ADMIN: Actor = {
  kind: 'user',
  userId: '00000000-0000-4000-8000-000000000001',
  actingPartyId: '00000000-0000-4000-8000-0000000000a1',
  role: 'admin',
};

/** Registro só de teste: o executor de produção usa o registro fechado do TECH-051. */
export const testRegistry = new CommandRegistry([
  {
    name: 'test_command',
    module: 'platform',
    authority: 'admin',
    membership: 'not_applicable',
    critical: false,
  },
]);

export const allowAll: CommandGuard = {
  authorize: () => Promise.resolve({ allowed: true, authorizationRef: 'base:test' }),
};

/** Kysely conectado como `luxtory_app`: os testes exercitam os privilégios reais do papel (ADR-0006 §5). */
export function appDatabase(appUrl: string): Database {
  return createDatabase(parseDatabaseUrl(appUrl));
}

export function testExecutor(db: Database, limits = { maxAttempts: 3, lockTimeoutMs: 1_000 }) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(db),
    guard: allowAll,
    clock: testClock,
    limits,
    log,
    registry: testRegistry,
  });
  return { executor, log };
}

/** Tabela de domínio de teste no schema `app`, criada pelo dono e liberada ao papel de aplicação. */
export async function createWidgetTable(admin: pg.Pool): Promise<void> {
  await admin.query(`
    CREATE TABLE app.test_widget (id text PRIMARY KEY, n integer NOT NULL);
    CREATE UNIQUE INDEX occupancy_test_widget_n ON app.test_widget (n) WHERE n >= 100;
    INSERT INTO app.test_widget VALUES ('w-1', 0), ('w-2', 0);
    GRANT SELECT, INSERT, UPDATE ON app.test_widget TO luxtory_app;
  `);
}

const POLL_INTERVAL_MS = 10;
const WAIT_LIMIT_MS = 10_000;

/** Barreira determinística: espera até existir uma sessão bloqueada esperando lock no banco atual. */
export async function waitForLockWaiter(admin: pg.Pool): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    const { rows } = await admin.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('No session started waiting for a lock');
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
