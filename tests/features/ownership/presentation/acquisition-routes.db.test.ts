import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAcquisitionRoutes } from '@/features/ownership/presentation/acquisition-routes';
import {
  createAcquisitionHandlers,
  acquisitionAdminCommand,
} from '@/features/ownership/presentation/acquisition-handlers';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { withRoute, type EnvSource } from '@/features/platform';
import { acquisitionHarness, type AcquisitionHarness } from '../acquisition-support';
import { captureLogger } from '../../../support/capture-logger';
import { responseValidator } from '../../../support/openapi';

const ORIGIN = 'http://127.0.0.1:3100';
type Name = keyof ReturnType<typeof createAcquisitionRoutes>;
describe('W8 REST contract, bounded authenticated input and opt-in gate [TECH-050] [TECH-056] [T-811]', () => {
  let h: AcquisitionHarness;
  beforeAll(async () => {
    h = await acquisitionHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  async function call(
    name: Name,
    body: unknown,
    options: {
      id?: string;
      key?: string;
      source?: EnvSource;
      headers?: Record<string, string>;
      raw?: string;
    } = {},
  ) {
    const { logger, entries } = captureLogger();
    const routes = createAcquisitionRoutes({
      source: {
        AUTH_MODE: 'test',
        COMMAND_MAX_ATTEMPTS: '1',
        COMMAND_LOCK_TIMEOUT_MS: '5000',
        ACQUISITION_WRITES: 'open',
        ...options.source,
      },
      clock: h.clock,
      database: () => h.db,
      afterCommit: vi.fn(),
    });
    const request = new Request(`${ORIGIN}/v1/admin/acquisitions`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        host: '127.0.0.1:3100',
        cookie: `${TEST_SESSION_COOKIE}=${issueTestToken(h.userId, 'aal2', h.clock)}`,
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...options.headers,
      },
      body: options.raw ?? JSON.stringify(body),
    });
    const response = await withRoute(routes[name], logger)(
      request,
      options.id === undefined ? undefined : { params: Promise.resolve({ id: options.id }) },
    );
    return { response, request, entries: entries() };
  }
  async function operationCount() {
    return Number(
      (
        await h.db
          .selectFrom('app.operation')
          .select((eb) => eb.fn.countAll().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    );
  }
  it('authenticates before reading the bounded JSON body', async () => {
    const before = await operationCount();
    const { response, request } = await call(
      'formalizeAcquisition',
      {},
      { headers: { cookie: '' }, raw: 'x'.repeat(32769) },
    );
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(await operationCount()).toBe(before);
  });
  it('rejects wrong content type, malformed JSON and actual received bytes above 32 KiB', async () => {
    const before = await operationCount();
    expect(
      (await call('formalizeAcquisition', {}, { headers: { 'content-type': 'text/plain' } }))
        .response.status,
    ).toBe(415);
    expect((await call('formalizeAcquisition', {}, { raw: '{' })).response.status).toBe(400);
    expect(
      (
        await call(
          'formalizeAcquisition',
          {},
          { raw: ' '.repeat(32769), headers: { 'content-length': '1' } },
        )
      ).response.status,
    ).toBe(413);
    expect(
      (
        await call(
          'formalizeAcquisition',
          {},
          { raw: JSON.stringify({ value: 'ç'.repeat(16384) }) },
        )
      ).response.status,
    ).toBe(413);
    expect(await operationCount()).toBe(before);
  });
  it('accepts exactly 32768 UTF-8 bytes and returns the allocation contract', async () => {
    const { home } = await h.root();
    const body = {
      configuration_id: 2,
      operation_start_date: '2027-07-01',
      grants: [
        { position: 1, alta: 0, media: 0 },
        { position: 2, alta: 0, media: 0 },
      ],
      luxtory_capacity: { alta: 0, media: 0 },
      basis_ref: 'Test allocation',
    };
    const json = JSON.stringify(body);
    const raw = json + ' '.repeat(32768 - Buffer.byteLength(json));
    const { response } = await call('initialAllocation', body, { id: home.id, raw });
    expect(response.status).toBe(201);
    expect(
      responseValidator(
        '/admin/second-homes/{id}/initial-allocation',
        'post',
        201,
      )(await response.json()),
    ).toBe(true);
  });
  it('uses the real Admin AAL2 guard and checks the gate before replay or reservation for every command', async () => {
    const { home } = await h.root();
    const inputs = [
      ['formalizeAcquisition', await h.owner(home.id)],
      [
        'initialAllocation',
        {
          configuration_id: 2,
          operation_start_date: '2027-07-01',
          grants: [
            { position: 1, alta: 0, media: 0 },
            { position: 2, alta: 0, media: 0 },
          ],
          luxtory_capacity: { alta: 0, media: 0 },
          basis_ref: 'test',
        },
      ],
      [
        'administration',
        {
          coverages: [
            {
              provider_party_id: await h.party(),
              professional: true,
              scope: 'professional_administration',
              valid_from: '2027-01-01',
            },
          ],
          basis_ref: 'test',
        },
      ],
      ['operationStart', { effective_start_date: '2027-01-01', basis_ref: 'test' }],
    ] as const;
    const before = await operationCount();
    for (const [name, input] of inputs) {
      for (const gate of [undefined, 'closed', 'invalid']) {
        const { response } = await call(name, input, {
          id: home.id,
          source: { ACQUISITION_WRITES: gate },
        });
        expect(response.status).toBe(503);
      }
      const denied = await call(name, input, {
        id: home.id,
        source: { ACQUISITION_WRITES: 'closed' },
        headers: { cookie: `${TEST_SESSION_COOKIE}=${issueTestToken(h.userId, 'aal1', h.clock)}` },
      });
      expect(denied.response.status).toBe(403);
    }
    expect(await operationCount()).toBe(before);
    const handlers = createAcquisitionHandlers({
      source: { ACQUISITION_WRITES: 'open', VERCEL_ENV: 'preview' },
      clock: h.clock,
    });
    expect(() =>
      acquisitionAdminCommand(handlers.formalizeAcquisition).handler.assertAvailable?.(),
    ).toThrow('preview');
  });
  it('returns only the contracted ids, sanitizes evidence and refuses cross-home idempotency reuse', async () => {
    const { home } = await h.root();
    const body = {
      coverages: [
        {
          provider_party_id: await h.party(),
          professional: true,
          scope: 'professional_administration',
          valid_from: '2027-01-01',
        },
      ],
      basis_ref: 'SENTINEL-PRIVATE-BASIS',
    };
    const key = randomUUID();
    const first = await call('administration', body, { id: home.id, key });
    expect(first.response.status).toBe(201);
    const value = await first.response.json();
    expect(responseValidator('/admin/second-homes/{id}/administration', 'post', 201)(value)).toBe(
      true,
    );
    expect(JSON.stringify(value)).not.toContain('SENTINEL');
    expect(JSON.stringify(first.entries)).not.toContain('SENTINEL');
    const other = await h.root();
    expect((await call('administration', body, { id: other.home.id, key })).response.status).toBe(
      409,
    );
    expect(
      (await call('administration', { ...body, second_home_id: home.id }, { id: home.id })).response
        .status,
    ).toBe(400);
    expect(
      (
        await call('administration', body, {
          id: home.id,
          key,
          source: { ACQUISITION_WRITES: 'closed' },
        })
      ).response.status,
    ).toBe(503);
    const formal = await call('formalizeAcquisition', await h.owner(home.id));
    expect(formal.response.status).toBe(201);
    expect(
      responseValidator('/admin/acquisitions', 'post', 201)(await formal.response.json()),
    ).toBe(true);
    const started = await call(
      'operationStart',
      { effective_start_date: '2027-01-01', basis_ref: 'test' },
      { id: home.id },
    );
    expect(started.response.status).toBe(201);
    expect(
      responseValidator(
        '/admin/second-homes/{id}/operation-start',
        'post',
        201,
      )(await started.response.json()),
    ).toBe(true);
  });
});
