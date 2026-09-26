import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dbmate, MIGRATIONS_TABLE } from '../../scripts/lib/dbmate.mjs';
import { checkMigrations, MigrationCheckError } from '../../scripts/lib/migration-check.mjs';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

const FIXTURE_MIGRATIONS = 'tests/fixtures/migrations';
const INCOMPLETE_DOWN_MIGRATIONS = 'tests/fixtures/migrations-incomplete-down';
const FIXTURE_MIGRATION_COUNT = 2;
const INSERT_ACTIVE_RUN = 'INSERT INTO fixture.job_run (job) VALUES ($1)';
const UNIQUE_VIOLATION = '23505';
const BARRIER_TIMEOUT_MS = 5_000;
const BARRIER_POLL_MS = 20;

// Um banco clonado por teste: nenhum teste depende do estado deixado por outro.
let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(async () => {
  await db.drop();
});

const migrate = (command: string[]) =>
  dbmate(command, { url: db.url, migrationsDir: FIXTURE_MIGRATIONS });

async function fixtureTables(): Promise<string[]> {
  const { rows } = await db.pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'fixture' ORDER BY 1",
  );
  return rows.map((row) => row.table_name);
}

async function appliedMigrations(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${MIGRATIONS_TABLE}`,
  );
  return rows[0]?.n ?? 0;
}

/** Barreira determinística: espera o backend `pid` ficar bloqueado aguardando lock. */
async function waitUntilWaitingForLock(pid: number): Promise<void> {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { rows } = await db.pool.query<{ wait_event_type: string | null }>(
      'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
      [pid],
    );
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, BARRIER_POLL_MS));
  }
  throw new Error(`backend ${pid} did not block on a lock within ${BARRIER_TIMEOUT_MS} ms`);
}

async function withTwoConnections(fn: (a: pg.Client, b: pg.Client) => Promise<void>) {
  const a = new pg.Client({ connectionString: db.url });
  const b = new pg.Client({ connectionString: db.url });
  await Promise.all([a.connect(), b.connect()]);
  try {
    await fn(a, b);
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
}

describe('PostgreSQL real (ADR-0005)', () => {
  it('[TECH-110] PG embutido sobe, desce e sobe migrations de fixture', async () => {
    await migrate(['up', '--strict']);
    expect(await fixtureTables()).toEqual(['job_run', 'widget']);
    expect(await appliedMigrations()).toBe(FIXTURE_MIGRATION_COUNT);

    for (let i = 0; i < FIXTURE_MIGRATION_COUNT; i += 1) await migrate(['rollback']);
    expect(await fixtureTables()).toEqual([]);
    expect(await appliedMigrations()).toBe(0);

    await migrate(['up', '--strict']);
    expect(await fixtureTables()).toEqual(['job_run', 'widget']);
    expect(await appliedMigrations()).toBe(FIXTURE_MIGRATION_COUNT);
  });

  it('[TECH-110] db:check aceita down completo e recusa down que deixa objetos para trás', async () => {
    await expect(checkMigrations(db.url, FIXTURE_MIGRATIONS)).resolves.toBe(FIXTURE_MIGRATION_COUNT);

    const other = await createTestDatabase();
    try {
      const attempt = checkMigrations(other.url, INCOMPLETE_DOWN_MIGRATIONS);
      await expect(attempt).rejects.toThrow(MigrationCheckError);
      await expect(attempt).rejects.toThrow(/\+ schema leaky/);
    } finally {
      await other.drop();
    }
  });

  it('[CONC-12] duas conexões: índice único parcial serializa inserções concorrentes', async () => {
    await migrate(['up', '--strict']);
    await withTwoConnections(async (a, b) => {
      const { rows } = await b.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const bPid = rows[0]?.pid ?? -1;

      // A abandona: B, que esperava, insere.
      await a.query('BEGIN');
      await a.query(INSERT_ACTIVE_RUN, ['rolled_back_job']);
      const afterRollback = b.query(INSERT_ACTIVE_RUN, ['rolled_back_job']);
      await waitUntilWaitingForLock(bPid);
      await a.query('ROLLBACK');
      await expect(afterRollback).resolves.toMatchObject({ rowCount: 1 });

      // A confirma: B, que esperava, recebe violação de unicidade.
      await a.query('BEGIN');
      await a.query(INSERT_ACTIVE_RUN, ['committed_job']);
      const afterCommit = b.query(INSERT_ACTIVE_RUN, ['committed_job']);
      await waitUntilWaitingForLock(bPid);
      await a.query('COMMIT');
      await expect(afterCommit).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    const { rows } = await db.pool.query<{ job: string; n: number }>(
      'SELECT job, count(*)::int AS n FROM fixture.job_run WHERE active GROUP BY job ORDER BY job',
    );
    expect(rows).toEqual([
      { job: 'committed_job', n: 1 },
      { job: 'rolled_back_job', n: 1 },
    ]);
  });

  it('auth.uid() lê o sub das claims como no Supabase (compatibilidade para RLS)', async () => {
    const sub = '6c1f3a52-8f0e-4b8f-9a55-2f6a1c7e9d10';
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub, role: 'authenticated' }),
      ]);
      const { rows } = await client.query<{ uid: string; role: string }>(
        'SELECT auth.uid() AS uid, auth.role() AS role',
      );
      expect(rows[0]).toEqual({ uid: sub, role: 'authenticated' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
