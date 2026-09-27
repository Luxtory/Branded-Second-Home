import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  commandRegistry,
  withRoute,
  type CommandRegistry,
  type Database,
} from '@/features/platform';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { createAuthorizationGrantRoute } from '@/features/identity/presentation/authorization-grants-route';
import { captureLogger } from '../../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../../support/openapi';
import { appDatabase } from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';
import {
  PARTNER_OPERATION,
  PARTNER_REGISTRY,
  PARTY,
  SCOPE,
  STAFF_USER,
} from '../../../support/identity-fixtures';

const ORIGIN = 'http://127.0.0.1:3100';
const URL_PATH = `${ORIGIN}/v1/admin/authorization-grants`;
// Relógio real: os papéis de staff são atribuídos com o `now()` do banco e só valem a partir dele.
const clock = { now: () => new Date() };
const SUPER_ONLY = '00000000-0000-4000-8000-0000000000b7';
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '1000' };
const body = {
  grantee_party_id: PARTY,
  commands: [PARTNER_OPERATION.name],
  scope: SCOPE,
  valid_from: '2026-09-01T00:00:00Z',
  valid_until: '2026-10-01T00:00:00Z',
  basis: 'Instrumento de parceria 2026-09',
};
const validError = schemaValidator('Error');

const cookie = (userId: string, assurance: 'aal1' | 'aal2') =>
  `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;

function post(headers: Record<string, string>, payload: unknown = body): Request {
  return new Request(URL_PATH, {
    method: 'POST',
    headers: { host: '127.0.0.1:3100', 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

describe('POST /v1/admin/authorization-grants (REQ-014, TECH-050, TECH-100)', () => {
  let database: TestDatabase;
  let db: Database;
  const afterCommit = vi.fn();

  const route = (
    registry: CommandRegistry = PARTNER_REGISTRY,
    env: Record<string, string> = source,
  ) => {
    const { logger } = captureLogger();
    return withRoute(
      createAuthorizationGrantRoute({
        source: env,
        clock,
        database: () => db,
        registry,
        afterCommit,
      }),
      logger,
    );
  };
  const operations = async () =>
    (await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.operation`))
      .rows[0]?.n;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      CREATE TABLE app.party (id uuid PRIMARY KEY); INSERT INTO app.party VALUES ('${PARTY}');
      INSERT INTO auth.users (id) VALUES ('${STAFF_USER}'), ('${SUPER_ONLY}');
      SELECT app.assign_staff_role('${STAFF_USER}', 'admin', 'Ata');
      SELECT app.assign_staff_role('${SUPER_ONLY}', 'super_admin', 'Ata');`);
    db = appDatabase(database.appUrl);
  });

  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  it('[TECH-100] POST com origem de outro host ou sem Origin → 403, sem nenhum efeito', async () => {
    const before = await operations();
    const staff = { cookie: cookie(STAFF_USER, 'aal2'), 'idempotency-key': 'k-origin' };

    for (const headers of [{ ...staff, origin: 'https://atacante.test' }, staff]) {
      const response = await route()(post(headers));
      expect(response.status).toBe(403);
      const error = await response.json();
      expect(validError(error)).toBe(true);
      expect(error.code).toBe('ERR_PERMISSION');
    }
    expect(await operations()).toBe(before);
  });

  it('[TECH-050] sem sessão → 401; Admin sem MFA (AAL1) → 403; Super Admin sem papel Admin → 403', async () => {
    const response = await route()(post({ origin: ORIGIN, 'idempotency-key': 'k-anon' }));
    expect(response.status).toBe(401);
    expect(validError(await response.json())).toBe(true);

    for (const [user, assurance] of [
      [STAFF_USER, 'aal1'],
      [SUPER_ONLY, 'aal2'],
    ] as const) {
      const denied = await route()(
        post({ origin: ORIGIN, cookie: cookie(user, assurance), 'idempotency-key': `k-${user}` }),
      );
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({ code: 'ERR_PERMISSION' });
    }
  });

  it('[REQ-014] registro de produção (W2): nenhum command concedível → 400, nenhum grant criado', async () => {
    const response = await route(commandRegistry)(
      post({ origin: ORIGIN, cookie: cookie(STAFF_USER, 'aal2'), 'idempotency-key': 'k-prod' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'ERR_VALIDATION' });
    const { rows } = await database.pool.query(
      `SELECT count(*)::int AS n FROM app.authorization_grant`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('[TECH-056] corpo que não é JSON ou sem Idempotency-Key → 400', async () => {
    const staff = { origin: ORIGIN, cookie: cookie(STAFF_USER, 'aal2') };

    expect((await route()(post({ ...staff, 'idempotency-key': 'k-json' }, '{'))).status).toBe(400);
    expect((await route()(post(staff))).status).toBe(400);
  });

  it('[REQ-014][TECH-056] Admin com MFA registra o grant: 201 conforme o OpenAPI, auditado; repetição e conflito', async () => {
    const headers = {
      origin: ORIGIN,
      cookie: cookie(STAFF_USER, 'aal2'),
      'idempotency-key': 'k-grant',
    };

    const created = await route()(post(headers));
    expect(created.status).toBe(201);
    const grant = await created.json();
    expect(responseValidator('/admin/authorization-grants', 'post', 201)(grant)).toBe(true);
    expect(grant).toMatchObject({
      granted_by_user_id: STAFF_USER,
      granted_role: 'admin',
      commands: body.commands,
    });
    expect(afterCommit).toHaveBeenCalledTimes(1);

    const { rows } = await database.pool.query(
      `SELECT o.authorization_ref, o.role, a.object_type FROM app.operation o
         JOIN app.audit_log a ON a.operation_id = o.id WHERE o.id = $1`,
      [grant.operation_id],
    );
    expect(rows).toEqual([
      {
        authorization_ref: expect.stringMatching(/^staff_role:/),
        role: 'admin',
        object_type: 'authorization_grant',
      },
    ]);

    const replay = await route()(post(headers));
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    await expect(replay.json()).resolves.toEqual(grant);

    const conflict = await route()(post(headers, { ...body, basis: 'Outro instrumento' }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: 'ERR_IDEMPOTENCY_CONFLICT' });
  });

  it('[TECH-001][ADR-0007] configuração ausente ou Auth recusado no ambiente → 503 nomeando só a chave', async () => {
    const staff = {
      origin: ORIGIN,
      cookie: cookie(STAFF_USER, 'aal2'),
      'idempotency-key': 'k-503',
    };

    for (const env of [{ AUTH_MODE: 'test' }, { VERCEL_ENV: 'preview' }]) {
      const { logger, entries } = captureLogger();
      const response = await withRoute(
        createAuthorizationGrantRoute({ source: env, clock, database: () => db, afterCommit }),
        logger,
      )(post(staff));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: 'ERR_UNAVAILABLE' });
      expect(entries().find((entry) => entry.msg === 'admin command unavailable')?.keys).toEqual(
        'VERCEL_ENV' in env ? ['VERCEL_ENV'] : ['COMMAND_MAX_ATTEMPTS', 'COMMAND_LOCK_TIMEOUT_MS'],
      );
    }
  });
});
