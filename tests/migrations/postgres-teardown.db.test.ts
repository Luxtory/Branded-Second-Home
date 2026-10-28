import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { dropDatabase, withClient } from '../../scripts/lib/pg.mjs';
import { createTestDatabase } from '../support/test-database';

const BATCHES = 4;
const DATABASES_PER_BATCH = 3;
const QUERIES_PER_POOL = 3;
const CHILD_TIMEOUT_MS = 10_000;

function sqlState(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'non-PostgreSQL error';
}

function queryDatabase(pool: pg.Pool) {
  return new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
}

describe('PostgreSQL teardown (ADR-0005)', () => {
  it('[TECH-110] refuses to force a backend still closing after pg and Kysely pools end', async () => {
    const database = await createTestDatabase({ migrated: false });
    const { adminUrl } = inject('postgres');
    const name = new URL(database.url).pathname.slice(1);
    // A public stream factory lets the test retain the real Terminate packet, with no driver-private fields or sleeps.
    const socket = new Socket();
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    const owner = new pg.Pool({ connectionString: database.url, max: 1, stream: () => socket });
    const application = new pg.Pool({ connectionString: database.appUrl });
    const db = queryDatabase(application);
    const errors: string[] = [];
    // These are scoped observations, not an error policy: every event is asserted to be absent after cleanup.
    owner.on('error', (error) => errors.push(sqlState(error)));
    application.on('error', (error) => errors.push(sqlState(error)));
    let outcome: unknown;
    let clientEnded = false;
    try {
      const client = await owner.connect();
      try {
        client.once('end', () => {
          clientEnded = true;
        });
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      await sql`SELECT 1`.execute(db);
      socket.cork();
      await db.destroy();
      await owner.end();
      expect(owner.totalCount).toBe(0);
      expect(clientEnded).toBe(false);
      expect(socket.writableLength).toBeGreaterThan(0);

      outcome = await dropDatabase(adminUrl, name).then(
        () => ({ dropped: true }),
        (error: unknown) => ({ dropped: false, code: sqlState(error) }),
      );
    } finally {
      socket.uncork();
      await db.destroy();
      if (!owner.ending) await owner.end();
      await closed;
      // Release the deliberate blocker before final cleanup; never force, retry a blocked drop, or hide an error.
      await database.drop();
    }
    expect(errors).toEqual([]);
    expect(outcome).toEqual({ dropped: false, code: '55006' });
    expect(clientEnded).toBe(true);
  });

  it('[TECH-110] a genuinely leaked client blocks the drop and remains usable after its rejection', async () => {
    const database = await createTestDatabase({ migrated: false });
    const { adminUrl } = inject('postgres');
    const name = new URL(database.url).pathname.slice(1);
    const leaked = new pg.Client({ connectionString: database.url });
    const errors: string[] = [];
    leaked.on('error', (error) => errors.push(sqlState(error)));
    try {
      await leaked.connect();
      // No end or release has begun: this is a real open session, distinct from the closing-socket regression.
      const outcome = await dropDatabase(adminUrl, name).then(
        () => ({ dropped: true }),
        (error: unknown) => ({ dropped: false, code: sqlState(error) }),
      );
      expect(outcome).toEqual({ dropped: false, code: '55006' });
      const result = await leaked.query<{ alive: number }>('SELECT 1 AS alive');
      expect(result.rows).toEqual([{ alive: 1 }]);
    } finally {
      await leaked.end();
      await database.drop();
    }
    expect(errors).toEqual([]);
  });

  it('[TECH-110] concurrently drains pg and Kysely pools and removes every isolated database', async () => {
    const { adminUrl } = inject('postgres');
    const names: string[] = [];
    const durations: number[] = [];
    const errors: string[] = [];
    for (let batch = 0; batch < BATCHES; batch += 1) {
      await Promise.all(
        Array.from({ length: DATABASES_PER_BATCH }, async () => {
          const database = await createTestDatabase({ migrated: false });
          names.push(new URL(database.url).pathname.slice(1));
          const application = new pg.Pool({ connectionString: database.appUrl });
          const db = queryDatabase(application);
          database.pool.on('error', (error) => errors.push(sqlState(error)));
          application.on('error', (error) => errors.push(sqlState(error)));
          try {
            await Promise.all(
              Array.from({ length: QUERIES_PER_POOL }, async () => {
                await Promise.all([database.pool.query('SELECT 1'), sql`SELECT 1`.execute(db)]);
              }),
            );
          } finally {
            const started = performance.now();
            await db.destroy();
            await database.drop();
            durations.push(performance.now() - started);
          }
        }),
      );
    }
    expect(errors).toEqual([]);
    expect(names).toHaveLength(12);
    await withClient(adminUrl, async (client) => {
      const result = await client.query(
        'SELECT datname FROM pg_database WHERE datname = ANY($1::text[])',
        [names],
      );
      expect(result.rows).toEqual([]);
      const sessions = await client.query(
        'SELECT pid FROM pg_stat_activity WHERE datname = ANY($1::text[])',
        [names],
      );
      expect(sessions.rows).toEqual([]);
    });
    const sorted = durations.toSorted((a, b) => a - b);
    console.info(
      JSON.stringify({
        metric: 'postgres_test_teardown_ms',
        databases: names.length,
        min: Math.round(sorted[0]!),
        median: Math.round((sorted[5]! + sorted[6]!) / 2),
        max: Math.round(sorted.at(-1)!),
      }),
    );
  });

  it('[TECH-110] an unexpected idle connection failure still exits its process unsuccessfully', async () => {
    const database = await createTestDatabase({ migrated: false });
    const require = createRequire(import.meta.url);
    const pgModule = pathToFileURL(require.resolve('pg')).href;
    // The child imports only pg, never embedded-postgres or an exit/exception handler (ADR-0005).
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import pg from ${JSON.stringify(pgModule)};
      const pool = new pg.Pool({ connectionString: process.argv[1] });
      const { rows } = await pool.query('SELECT pg_backend_pid() AS pid');
      process.send({ pid: rows[0].pid });
    `,
        database.url,
      ],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    let stderr = '';
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    const completed = new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      },
    );
    let childTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      childTimer = setTimeout(
        () => reject(new Error('PostgreSQL error-control child did not fail within its deadline')),
        CHILD_TIMEOUT_MS,
      );
    });
    const ready = new Promise<number>((resolve, reject) => {
      child.once('message', (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'pid' in message &&
          typeof message.pid === 'number'
        ) {
          resolve(message.pid);
        } else reject(new Error('Invalid PostgreSQL error-control child message'));
      });
    });
    try {
      const pid = await Promise.race([
        ready,
        timeout,
        completed.then(() => {
          throw new Error('PostgreSQL error-control child exited before readiness');
        }),
      ]);
      // The PID must belong to this freshly created local database, never another test or a remote server.
      const terminated = await database.pool.query<{ killed: boolean }>(
        'SELECT pg_terminate_backend(pid) AS killed FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()',
        [pid],
      );
      expect(terminated.rows).toEqual([{ killed: true }]);
      const result = await Promise.race([completed, timeout]);
      expect(result.signal).toBeNull();
      expect(result.code).not.toBeNull();
      expect(result.code).not.toBe(0);
      expect(stderr).toContain("code: '57P01'");
    } finally {
      clearTimeout(childTimer);
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await completed;
      await database.drop();
    }
  });
});
