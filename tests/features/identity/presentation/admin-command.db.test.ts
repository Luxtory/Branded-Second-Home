import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ConfigurationMissingError,
  getDatabase,
  withRoute,
  type CommandHandler,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import {
  createAdminCommandRoute,
  executeAdminCommand,
  type AdminCommand,
} from '@/features/identity/presentation/admin-command';
import { captureLogger } from '../../../support/capture-logger';
import { appDatabase } from '../../../support/platform-fixtures';
import { STAFF_USER } from '../../../support/identity-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

const cookieJar = new Map<string, string>();
// Only the Next request boundary is simulated; Auth, guard, executor and PostgreSQL are real.
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      set: vi.fn(),
    }),
  headers: () => Promise.resolve(new Headers()),
}));

const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '1', COMMAND_LOCK_TIMEOUT_MS: '1000' };
const handler: CommandHandler<null, null, DatabaseTransaction> = {
  command: 'register_party',
  input: z.null(),
  execute({ operationId, audit }) {
    audit({ objectType: 'test_preflight', objectId: operationId, before: null, after: null });
    return Promise.resolve(null);
  },
};
const token = (assurance: 'aal1' | 'aal2') => issueTestToken(STAFF_USER, assurance, clock);
const unavailable = () => {
  throw new ConfigurationMissingError(['ACQUISITION_WRITES']);
};

describe('preflight opt-in compartilhado REST/Server Action (ADR-0021)', () => {
  let database: TestDatabase;
  let db: Database;
  let actionDb: Database;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    actionDb = getDatabase({ DATABASE_URL: database.appUrl });
    await database.pool.query('INSERT INTO auth.users (id) VALUES ($1)', [STAFF_USER]);
    await database.pool.query("SELECT app.assign_staff_role($1, 'admin', 'Ata')", [STAFF_USER]);
  });
  beforeEach(() => {
    cookieJar.clear();
    for (const [key, value] of Object.entries(source)) vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('DATABASE_URL', database.appUrl);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await actionDb.destroy();
    await db.destroy();
    await database.drop();
  });

  const counts = async () =>
    (
      await database.pool.query(`SELECT
    (SELECT count(*)::int FROM app.operation) AS operations,
    (SELECT count(*)::int FROM app.idempotency_record) AS idempotency,
    (SELECT count(*)::int FROM app.audit_log) AS audit,
    (SELECT count(*)::int FROM app.outbox) AS outbox`)
    ).rows;
  const route = (command: AdminCommand<null, null>) =>
    withRoute(
      createAdminCommandRoute({
        command: () => command,
        successStatus: 200,
        source,
        clock,
        database: () => db,
        afterCommit: vi.fn(),
      }),
      captureLogger().logger,
    );
  const post = (key: string, assurance: 'aal1' | 'aal2' | null = 'aal2') =>
    new Request(`${ORIGIN}/v1/admin/test`, {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        origin: ORIGIN,
        'content-type': 'application/json',
        'idempotency-key': key,
        ...(assurance === null ? {} : { cookie: `${TEST_SESSION_COOKIE}=${token(assurance)}` }),
      },
      body: 'null',
    });

  it('[ADR-0021] gate fechado responde 503 no REST e indisponível na ação, sem qualquer efeito persistido', async () => {
    const before = await counts();
    const assertAvailable = vi.fn(unavailable);
    const command = { handler, role: 'admin' as const, assertAvailable };
    const response = await route(command)(post('k-closed-rest'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'ERR_UNAVAILABLE' });
    cookieJar.set(TEST_SESSION_COOKIE, token('aal2'));
    await expect(executeAdminCommand(command, null, 'k-closed-action')).resolves.toBe(
      'unavailable',
    );
    expect(assertAvailable).toHaveBeenCalledTimes(2);
    expect(await counts()).toEqual(before);
  });

  it('[TECH-050] anônimo, AAL1 e papel exercido errado recusam sem executar a política', async () => {
    const assertAvailable = vi.fn(unavailable);
    const command = { handler, role: 'admin' as const, assertAvailable };
    expect((await route(command)(post('k-anon', null))).status).toBe(401);
    expect((await route(command)(post('k-aal1', 'aal1'))).status).toBe(403);
    expect((await route({ ...command, role: 'super_admin' })(post('k-role'))).status).toBe(403);
    await expect(executeAdminCommand(command, null, 'k-action-anon')).resolves.toEqual({
      status: 'unauthenticated',
    });
    cookieJar.set(TEST_SESSION_COOKIE, token('aal1'));
    await expect(executeAdminCommand(command, null, 'k-action-aal1')).resolves.toMatchObject({
      code: 'ERR_PERMISSION',
    });
    expect(assertAvailable).not.toHaveBeenCalled();
  });

  it('[ADR-0021] política da entrada não substitui a política própria do handler', async () => {
    const before = await counts();
    const command = {
      handler: { ...handler, assertAvailable: unavailable },
      role: 'admin' as const,
      assertAvailable: () => {},
    };
    expect((await route(command)(post('k-compose'))).status).toBe(503);
    expect(await counts()).toEqual(before);
  });

  it('[ADR-0021] fechar o gate depois do commit bloqueia replay em ambas entradas; commands sem opt-in continuam', async () => {
    let open = true;
    const assertAvailable = () => {
      if (!open) unavailable();
    };
    const command = { handler, role: 'admin' as const, assertAvailable };
    cookieJar.set(TEST_SESSION_COOKIE, token('aal2'));
    expect((await route(command)(post('k-replay'))).status).toBe(200);
    const before = await counts();
    open = false;
    expect((await route(command)(post('k-replay'))).status).toBe(503);
    await expect(executeAdminCommand(command, null, 'k-replay')).resolves.toBe('unavailable');
    expect(await counts()).toEqual(before);
    const existing = { handler, role: 'admin' as const };
    const response = await route(existing)(post('k-replay'));
    expect(response.status).toBe(200);
    expect(response.headers.get('idempotency-replayed')).toBe('true');
    await expect(executeAdminCommand(existing, null, 'k-replay')).resolves.toMatchObject({
      status: 'committed',
      replayed: true,
    });
    expect(await counts()).toEqual(before);
  });
});
