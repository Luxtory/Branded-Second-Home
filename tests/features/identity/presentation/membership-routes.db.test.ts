import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { createMembershipRoutes } from '@/features/identity/presentation/membership-routes';
import { withRoute } from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';
import { STAFF_USER } from '../../../support/identity-fixtures';
import { responseValidator, schemaValidator } from '../../../support/openapi';
import { bookingHarness, type BookingHarness } from '../../booking/booking-support';

// Rotas REST da W15 (OpenAPI, tag `identity`): a mesma entrada dos commands do Admin — origem (TECH-100), sessão AAL2
// com papel Admin (TECH-050), Idempotency-Key — sobre os mesmos handlers das Server Actions.
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const validError = schemaValidator('Error');
const ACTIONS = ['activate', 'suspend', 'reactivate', 'end'] as const;
type Action = (typeof ACTIONS)[number];

const cookie = (userId: string, assurance: 'aal1' | 'aal2') =>
  `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;

const staff = (key = randomUUID()) => ({
  origin: ORIGIN,
  cookie: cookie(STAFF_USER, 'aal2'),
  'idempotency-key': key,
});

function post(path: string, headers: Record<string, string>, payload: unknown): Request {
  return new Request(`${ORIGIN}/v1${path}`, {
    method: 'POST',
    headers: { host: '127.0.0.1:3100', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

describe('POST /v1/admin/parties/{id}/membership/* (TECH-050, TECH-100, contrato OpenAPI; W15)', () => {
  let h: BookingHarness;
  /** Log estruturado da última chamada, anexado às mensagens de falha. */
  let lastLog: () => Record<string, unknown>[] = () => [];

  const call = (
    action: Action,
    partyId: string,
    headers: Record<string, string> = staff(),
    body: unknown = { basis: 'Ata Luxtory W15' },
  ) => {
    const { logger, entries } = captureLogger();
    lastLog = entries;
    const raw = createMembershipRoutes({
      source,
      clock,
      database: () => h.db,
      afterCommit: vi.fn(),
    });
    const route = {
      activate: raw.activateMembership,
      suspend: raw.suspendMembership,
      reactivate: raw.reactivateMembership,
      end: raw.endMembership,
    }[action];
    return withRoute(route, logger)(
      post(`/admin/parties/${partyId}/membership/${action}`, headers, body),
      {
        params: Promise.resolve({ id: partyId }),
      },
    );
  };
  const path = (action: Action) => `/admin/parties/{id}/membership/${action}`;

  beforeAll(async () => {
    h = await bookingHarness();
    await h.database.pool.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [
      STAFF_USER,
    ]);
    await h.database.pool.query(`SELECT app.assign_staff_role($1, 'admin', 'Ata')`, [STAFF_USER]);
  });

  afterAll(() => h.close());

  it('[TECH-100][TECH-050] outra origem → 403; sem sessão → 401; AAL1 → 403; nada gravado', async () => {
    const { titular } = await h.ownerScenario();
    for (const headers of [
      { ...staff(), origin: 'https://atacante.test' },
      { ...staff(), cookie: cookie(STAFF_USER, 'aal1') },
    ]) {
      const response = await call('activate', titular.partyId, headers);
      expect(response.status).toBe(403);
      expect(validError(await response.json())).toBe(true);
    }
    expect(
      (await call('activate', titular.partyId, { origin: ORIGIN, 'idempotency-key': randomUUID() }))
        .status,
    ).toBe(401);
    const { rows } = await h.database.pool.query(
      `SELECT count(*)::int AS n FROM app.membership WHERE party_id = $1`,
      [titular.partyId],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('[REQ-095][TECH-055] as quatro rotas conformes ao OpenAPI; o id do caminho vale sobre o corpo', async () => {
    const { titular } = await h.ownerScenario();
    const decoy = (await h.ownerScenario()).titular.partyId;
    const expected: Readonly<Record<Action, readonly [number, string]>> = {
      activate: [201, 'active'],
      suspend: [200, 'suspended'],
      reactivate: [200, 'active'],
      end: [200, 'ended'],
    };
    for (const action of ACTIONS) {
      const response = await call(action, titular.partyId, staff(), {
        basis: 'Ata Luxtory W15',
        party_id: decoy,
      });
      const body = await response.json();
      expect(response.status, `${action} ${JSON.stringify(lastLog())}`).toBe(expected[action][0]);
      expect(responseValidator(path(action), 'post', expected[action][0])(body), action).toBe(true);
      expect(body).toMatchObject({ party_id: titular.partyId, state: expected[action][1] });
    }
    const { rows } = await h.database.pool.query(
      `SELECT count(*)::int AS n FROM app.membership WHERE party_id = $1`,
      [decoy],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('[TECH-056] 404 sem Membership ou party; 409 transição inválida ou não Titular; 400 base inválida', async () => {
    const { titular } = await h.ownerScenario();
    const notFound = await call('suspend', titular.partyId);
    expect(notFound.status).toBe(404);
    expect(validError(await notFound.json())).toBe(true);
    expect((await call('activate', randomUUID())).status).toBe(404);
    expect(
      (await call('activate', titular.partyId, staff(), { basis: 'contato@exemplo.test' })).status,
    ).toBe(400);
    expect((await call('activate', titular.partyId)).status).toBe(201);
    const conflict = await call('reactivate', titular.partyId);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: 'ERR_STATE_TRANSITION' });
  });
});
