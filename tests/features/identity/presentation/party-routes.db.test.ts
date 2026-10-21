import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { createPartyRoutes } from '@/features/identity/presentation/party-routes';
import { withRoute, type Database } from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';
import { STAFF_USER } from '../../../support/identity-fixtures';
import { responseValidator, schemaValidator } from '../../../support/openapi';
import {
  fakeAccounts,
  punctuatedCpf,
  testProtector,
  validCpf,
} from '../../../support/party-fixtures';
import { appDatabase } from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

// Rotas REST da W7 (OpenAPI, tag `identity`): mesma entrada dos commands do Admin — origem (TECH-100), sessão AAL2 com
// papel Admin (TECH-050), Idempotency-Key, e respostas sem documento nem e-mail.
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const SUPER_ONLY = '00000000-0000-4000-8000-0000000000b8';
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const CPF = validCpf('246813579');
const validError = schemaValidator('Error');

const cookie = (userId: string, assurance: 'aal1' | 'aal2') =>
  `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;

function post(path: string, headers: Record<string, string>, payload: unknown): Request {
  return new Request(`${ORIGIN}/v1${path}`, {
    method: 'POST',
    headers: { host: '127.0.0.1:3100', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

const staff = (key = randomUUID()) => ({
  origin: ORIGIN,
  cookie: cookie(STAFF_USER, 'aal2'),
  'idempotency-key': key,
});

describe('POST /v1/admin/parties* (TECH-050, TECH-100, contrato OpenAPI)', () => {
  let database: TestDatabase;
  let db: Database;
  const accounts = fakeAccounts();
  const protector = testProtector();

  const routes = () => {
    const { logger } = captureLogger();
    const raw = createPartyRoutes({
      source,
      clock,
      database: () => db,
      protector,
      accounts: accounts.port,
      afterCommit: vi.fn(),
    });
    return {
      register: withRoute(raw.registerParty, logger),
      delegate: (id: string) => (request: Request) =>
        withRoute(raw.createPartyDelegation, logger)(request, {
          params: Promise.resolve({ id }),
        }),
      revoke: (id: string) => (request: Request) =>
        withRoute(raw.revokePartyDelegation, logger)(request, { params: Promise.resolve({ id }) }),
    };
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      INSERT INTO auth.users (id) VALUES ('${STAFF_USER}'), ('${SUPER_ONLY}');
      SELECT app.assign_staff_role('${STAFF_USER}', 'admin', 'Ata');
      SELECT app.assign_staff_role('${SUPER_ONLY}', 'super_admin', 'Ata');`);
    db = appDatabase(database.appUrl);
  });

  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  it('[TECH-100] origem de outro host ou ausente → 403; sem sessão → 401; AAL1 ou só Super Admin → 403', async () => {
    const { register } = routes();
    const body = { document: CPF };

    for (const headers of [
      { ...staff(), origin: 'https://atacante.test' },
      { cookie: staff().cookie, 'idempotency-key': 'k' },
    ]) {
      const response = await register(post('/admin/parties', headers, body));
      expect(response.status).toBe(403);
      expect(validError(await response.json())).toBe(true);
    }
    expect(
      (await register(post('/admin/parties', { origin: ORIGIN, 'idempotency-key': 'k2' }, body)))
        .status,
    ).toBe(401);
    for (const [user, assurance] of [
      [STAFF_USER, 'aal1'],
      [SUPER_ONLY, 'aal2'],
    ] as const) {
      const denied = await register(
        post(
          '/admin/parties',
          { origin: ORIGIN, cookie: cookie(user, assurance), 'idempotency-key': randomUUID() },
          body,
        ),
      );
      expect(denied.status).toBe(403);
    }
    const { rows } = await database.pool.query(`SELECT count(*)::int AS n FROM app.party`);
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('[TECH-100] cadastro 201 conforme o OpenAPI, sem documento; duplicado → 409; inválido → 400', async () => {
    const { register } = routes();
    const created = await register(
      post('/admin/parties', staff(), { document: punctuatedCpf(CPF) }),
    );
    const party = await created.json();

    expect(created.status).toBe(201);
    expect(responseValidator('/admin/parties', 'post', 201)(party)).toBe(true);
    expect(JSON.stringify(party)).not.toContain(CPF.slice(3, 9));
    const duplicate = await register(post('/admin/parties', staff(), { document: CPF }));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ code: 'ERR_STATE_TRANSITION' });
    expect((await register(post('/admin/parties', staff(), { document: '123' }))).status).toBe(400);
  });

  it('[TECH-050] convite 201 pendente conforme o OpenAPI, sem e-mail; revogação 200; party inexistente → 404', async () => {
    const { register, delegate, revoke } = routes();
    const party = await (
      await register(post('/admin/parties', staff(), { document: validCpf('135792468') }))
    ).json();
    const email = 'convidado@exemplo.test';

    const created = await delegate(party.id)(
      post(`/admin/parties/${party.id}/delegations`, staff(), { email, basis: 'Procuração' }),
    );
    const delegation = await created.json();
    expect(created.status).toBe(201);
    expect(responseValidator('/admin/parties/{id}/delegations', 'post', 201)(delegation)).toBe(
      true,
    );
    expect(delegation).toMatchObject({ party_id: party.id, state: 'pending', scope: 'party' });
    expect(JSON.stringify(delegation)).not.toContain(email);

    const missing = await delegate(randomUUID())(
      post('/admin/parties/x/delegations', staff(), { email: 'outro@exemplo.test', basis: 'B' }),
    );
    expect(missing.status).toBe(404);

    const revoked = await revoke(delegation.id)(
      post(`/admin/party-delegations/${delegation.id}/revoke`, staff(), {
        revocation_basis: 'Fim',
      }),
    );
    const body = await revoked.json();
    expect(revoked.status).toBe(200);
    expect(responseValidator('/admin/party-delegations/{id}/revoke', 'post', 200)(body)).toBe(true);
    expect(body).toMatchObject({ state: 'revoked', revocation_basis: 'Fim' });
  });

  it('[TECH-001] anéis PII ausentes → 503 nomeando só as chaves', async () => {
    const { logger, entries } = captureLogger();
    const raw = createPartyRoutes({ source, clock, database: () => db, accounts: accounts.port });
    const response = await withRoute(
      raw.registerParty,
      logger,
    )(post('/admin/parties', staff(), { document: validCpf('975318642') }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'ERR_UNAVAILABLE' });
    expect(JSON.stringify(entries())).toContain('PII_ENCRYPTION_KEYRING');
    expect(JSON.stringify(entries())).not.toContain('975318642');
  });
});
