import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { withRoute } from '@/features/platform';
import { createPrlRoutes } from '@/features/pricing/presentation/prl-routes';
import { captureLogger } from '../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../support/openapi';
import type { BookingHarness } from '../booking/booking-support';
import { NEXT_YEAR } from '../calendar/sealing-support';
import { pricingHarness } from './pricing-support';

// Rotas REST da W16 (OpenAPI, tag `pricing`; D2 da ADR-0032): a mesma entrada dos commands do Admin — origem (TECH-100),
// sessão AAL2 com papel ativo (TECH-050), Idempotency-Key, corpo limitado — sobre os handlers das Server Actions.
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const validError = schemaValidator('Error');
const next = (monthDay: string) => `${NEXT_YEAR}-${monthDay}`;
type Route = 'initial' | 'change';
const PATH: Record<Route, string> = { initial: '/admin/prl', change: '/admin/prl/changes' };

const cookie = (userId: string, assurance: 'aal1' | 'aal2' = 'aal2') =>
  `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;

describe('POST /v1/admin/prl e /v1/admin/prl/changes (TECH-050, TECH-056, TECH-100; W16)', () => {
  let h: BookingHarness;
  let homeId: string;
  let adminUser: string;
  let superUser: string;
  let bothUser: string;
  let lastLog: () => Record<string, unknown>[] = () => [];

  const headers = (userId: string, extra: Record<string, string> = {}) => ({
    host: '127.0.0.1:3100',
    origin: ORIGIN,
    'content-type': 'application/json',
    cookie: cookie(userId),
    'idempotency-key': randomUUID(),
    ...extra,
  });

  const body = (
    nights: readonly (readonly [string, string])[],
    extra: Record<string, unknown> = {},
  ) => ({
    second_home_id: homeId,
    nights: nights.map(([stay_date, amount_minor]) => ({ stay_date, amount_minor })),
    effective_from: null,
    basis: 'Ata Luxtory W16',
    ...extra,
  });

  function call(
    route: Route,
    requestHeaders: Record<string, string>,
    payload: unknown,
    raw?: string,
  ) {
    const { logger, entries } = captureLogger();
    lastLog = entries;
    const routes = createPrlRoutes({ source, clock, database: () => h.db, afterCommit: vi.fn() });
    const handler = route === 'initial' ? routes.publishInitialPrl : routes.changePublishedPrl;
    return withRoute(handler, logger)(
      new Request(`${ORIGIN}/v1${PATH[route]}`, {
        method: 'POST',
        headers: requestHeaders,
        body: raw ?? JSON.stringify(payload),
      }),
      { params: Promise.resolve({}) },
    );
  }

  async function staffUser(...roles: ('admin' | 'super_admin')[]): Promise<string> {
    const userId = randomUUID();
    await h.database.pool.query('INSERT INTO auth.users (id) VALUES ($1)', [userId]);
    for (const role of roles)
      await h.database.pool.query(`SELECT app.assign_staff_role($1, $2, 'Ata')`, [userId, role]);
    return userId;
  }

  async function operationRole(operationId: string) {
    const { rows } = await h.database.pool.query<{ role: string; command: string }>(
      `SELECT role, command FROM app.operation WHERE id = $1`,
      [operationId],
    );
    return rows[0];
  }

  beforeAll(async () => {
    const harness = await pricingHarness();
    h = harness.h;
    homeId = harness.owner.homeId;
    adminUser = await staffUser('admin');
    superUser = await staffUser('super_admin');
    bothUser = await staffUser('admin', 'super_admin');
  });

  afterAll(() => h.close());

  it('[TECH-100][TECH-050] outra origem → 403; sem sessão → 401; AAL1 → 403; nada gravado', async () => {
    const payload = body([[next('05-01'), '1']]);
    const attempts: Record<string, string>[] = [
      { origin: 'https://atacante.test' },
      { cookie: cookie(adminUser, 'aal1') },
    ];
    for (const extra of attempts) {
      const response = await call('initial', headers(adminUser, extra), payload);
      expect(response.status).toBe(403);
      expect(validError(await response.json())).toBe(true);
    }
    const anonymous = headers(adminUser);
    delete (anonymous as Record<string, string>).cookie;
    expect((await call('initial', anonymous, payload)).status).toBe(401);
    const { rows } = await h.database.pool.query(
      `SELECT count(*)::int AS n FROM app.prl WHERE second_home_id = $1`,
      [homeId],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('[REQ-013][TECH-051] PRL inicial: Admin, Super Admin e quem tem os dois (exerce Admin), conformes ao OpenAPI', async () => {
    const cases = [
      [adminUser, next('05-02'), 'admin'],
      [superUser, next('05-03'), 'super_admin'],
      [bothUser, next('05-04'), 'admin'],
    ] as const;
    for (const [user, night, role] of cases) {
      const response = await call('initial', headers(user), body([[night, '50000']]));
      const json = await response.json();
      expect(response.status, JSON.stringify(lastLog())).toBe(201);
      expect(responseValidator(PATH.initial, 'post', 201)(json)).toBe(true);
      expect(json).toMatchObject({ kind: 'initial', nights_count: 1, first_stay_date: night });
      expect(await operationRole(json.operation_id)).toEqual({
        role,
        command: 'publish_initial_prl',
      });
    }
  });

  it('[REQ-013][BR-181] alteração: Admin → 403; Super Admin → 201; noite não publicada → 409', async () => {
    const admin = await call('change', headers(adminUser), body([[next('05-02'), '51000']]));
    expect(admin.status).toBe(403);
    expect(await admin.json()).toMatchObject({ code: 'ERR_PERMISSION' });
    const changed = await call('change', headers(bothUser), body([[next('05-02'), '51000']]));
    const json = await changed.json();
    expect(changed.status, JSON.stringify(lastLog())).toBe(201);
    expect(responseValidator(PATH.change, 'post', 201)(json)).toBe(true);
    expect(await operationRole(json.operation_id)).toEqual({
      role: 'super_admin',
      command: 'change_published_prl',
    });
    const missing = await call('change', headers(superUser), body([[next('05-20'), '1']]));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
  });

  it('[TECH-056] 409 noite publicada ou não selada; 404 Second Home; 400 entrada; 413 corpo grande; 415 tipo', async () => {
    const published = await call('initial', headers(adminUser), body([[next('05-02'), '1']]));
    expect(published.status).toBe(409);
    expect(validError(await published.json())).toBe(true);
    expect(
      (await call('initial', headers(adminUser), body([[`${NEXT_YEAR + 1}-02-01`, '1']]))).status,
    ).toBe(409);
    expect(
      (
        await call('initial', headers(adminUser), {
          ...body([[next('05-05'), '1']]),
          second_home_id: randomUUID(),
        })
      ).status,
    ).toBe(404);
    for (const invalid of [
      { ...body([]), nights: [{ stay_date: next('05-05'), amount_minor: 1000 }] },
      body([[next('05-05'), '0']]),
      body([[next('05-05'), '1']], { basis: 'contato@exemplo.test' }),
    ]) {
      const response = await call('initial', headers(adminUser), invalid);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'ERR_VALIDATION' });
    }
    const large = await call(
      'initial',
      headers(adminUser),
      null,
      JSON.stringify({ ...body([[next('05-05'), '1']]), padding: 'x'.repeat(70_000) }),
    );
    expect(large.status).toBe(413);
    expect(validError(await large.json())).toBe(true);
    const text = await call(
      'initial',
      headers(adminUser, { 'content-type': 'text/plain' }),
      body([[next('05-05'), '1']]),
    );
    expect(text.status).toBe(415);
    expect(validError(await text.json())).toBe(true);
    const { rows } = await h.database.pool.query(
      `SELECT count(*)::int AS n FROM app.prl WHERE second_home_id = $1 AND stay_date = $2`,
      [homeId, next('05-05')],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('[REQ-015][TECH-056] Idempotency-Key: replay devolve o mesmo corpo com idempotency-replayed; outro corpo → 409', async () => {
    const key = randomUUID();
    const payload = body([[next('05-06'), '56000']]);
    const first = await call('initial', headers(adminUser, { 'idempotency-key': key }), payload);
    const replay = await call('initial', headers(adminUser, { 'idempotency-key': key }), payload);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(await replay.json()).toEqual(await first.json());
    const conflict = await call(
      'initial',
      headers(adminUser, { 'idempotency-key': key }),
      body([[next('05-06'), '56001']]),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'ERR_IDEMPOTENCY_CONFLICT' });
  });
});
