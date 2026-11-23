import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { CommandRejection, LockSequence, withRoute } from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  evaluatePolicy,
  resolveEconomicTerms,
  type EconomicTermsRequest,
  type PolicyMechanism,
} from '@/features/pricing';
import { createPolicyHandlers, policyHistory } from '@/features/pricing/policies';
import { createPolicyRoutes } from '@/features/pricing/presentation/policy-routes';
import { captureLogger } from '../../support/capture-logger';
import { deferred, waitForLockWaiter } from '../../support/platform-fixtures';
import { responseValidator, schemaValidator } from '../../support/openapi';
import type { BookingHarness } from '../booking/booking-support';
import { addStaff, pricingHarness, staffRunner, type Staff } from './pricing-support';
import { INVALID_POLICIES, TEST_POLICIES } from './policy-fixtures';

/**
 * W18 E2 — `publish_policy` (TECH-032, TECH-051; PD-009, REQ-082, REQ-104; ADR-0034 §3–§6) pelo executor e pela rota
 * reais, e a resolução da política aceita no `EconomicTerms` (`ERR_POLICY_MISSING`). Políticas de teste, banco efêmero.
 */
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const validError = schemaValidator('Error');
const HOUR_MS = 3_600_000;

describe('W18 — publish_policy e resolução da política aceita (TECH-032, PD-009, REQ-082, REQ-104)', () => {
  let h: BookingHarness;
  let run: ReturnType<typeof staffRunner>;
  let admin: Staff;
  let superAdmin: Staff;
  const handlers = createPolicyHandlers();
  const store = createPostgresEconomicTermsStore();

  const input = (mechanism: PolicyMechanism, extra: Record<string, unknown> = {}) => ({
    mechanism,
    config: TEST_POLICIES[mechanism],
    effective_from: null,
    effective_to: null,
    basis: 'Ata Luxtory W18 (teste)',
    ...extra,
  });

  const resolve = (request: EconomicTermsRequest) =>
    h.db
      .transaction()
      .execute((tx) => resolveEconomicTerms(tx, new LockSequence(), store, request));

  async function rejection(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof CommandRejection) return error.code;
      throw error;
    }
    throw new Error('expected a rejection');
  }

  async function count(mechanism: PolicyMechanism) {
    return (await policyHistory(h.db, mechanism)).length;
  }

  beforeAll(async () => {
    ({ h } = await pricingHarness());
    run = staffRunner(h);
    admin = await addStaff(h, 'admin');
    superAdmin = await addStaff(h, 'super_admin');
  });

  afterAll(() => h.close());

  it('[PD-009][REQ-082] sem política vigente, nenhum compromisso confirma: ERR_POLICY_MISSING, nunca padrão', async () => {
    for (const mechanism of [
      'luxchange_request',
      'luxchange_direct',
      'luxplus',
      'rental_external',
    ] as const)
      expect(
        await rejection(
          resolve({ parameters: [], policy: { mechanism, acceptedPolicyId: randomUUID() } }),
        ),
      ).toBe('ERR_POLICY_MISSING');
    const withoutPolicy = await resolve({ parameters: [] });
    expect(withoutPolicy.policy).toBeNull();
  });

  it('[REQ-104] política contrária à BR-163, a um INV ou fora do esquema → ERR_VALIDATION; nada gravado', async () => {
    for (const [label, mechanism, config] of INVALID_POLICIES) {
      const outcome = await run.as(admin, handlers.publishPolicy, input(mechanism, { config }));
      expect({ label, outcome }).toEqual({
        label,
        outcome: expect.objectContaining({ status: 'rejected', code: 'ERR_VALIDATION' }),
      });
    }
    for (const mechanism of [
      'luxchange_request',
      'luxchange_direct',
      'luxplus',
      'rental_external',
    ] as const)
      expect(await count(mechanism)).toBe(0);
  });

  it('[TECH-051] só Admin com AAL2: Super Admin sem papel Admin e AAL1 são recusados', async () => {
    expect(await run.as(superAdmin, handlers.publishPolicy, input('luxplus'))).toEqual(
      expect.objectContaining({ status: 'rejected', code: 'ERR_PERMISSION' }),
    );
    expect(
      await run.as(admin, handlers.publishPolicy, input('luxplus'), { assurance: 'aal1' }),
    ).toEqual(expect.objectContaining({ status: 'rejected' }));
    expect(await count('luxplus')).toBe(0);
  });

  it('[PD-009][TECH-030] publicação: versão vigente, auditoria com config e base; replay idempotente não duplica', async () => {
    const key = randomUUID();
    const first = await run.as(admin, handlers.publishPolicy, input('luxchange_request'), { key });
    expect(first.status).toBe('committed');
    const replay = await run.as(admin, handlers.publishPolicy, input('luxchange_request'), { key });
    expect(replay).toEqual(expect.objectContaining({ status: 'committed', replayed: true }));
    expect(await count('luxchange_request')).toBe(1);
    const changed = await run.as(
      admin,
      handlers.publishPolicy,
      input('luxchange_request', { basis: 'outra base' }),
      { key },
    );
    expect(changed).toEqual(
      expect.objectContaining({ status: 'rejected', code: 'ERR_IDEMPOTENCY_CONFLICT' }),
    );
    if (first.status !== 'committed') throw new Error('unreachable');
    const { rows } = await h.database.pool.query<{ after: Record<string, unknown> }>(
      `SELECT after FROM app.audit_log WHERE operation_id = $1`,
      [first.operationId],
    );
    expect(rows[0]!.after).toMatchObject({
      mechanism: 'luxchange_request',
      schema_version: 1,
      config: TEST_POLICIES.luxchange_request,
      basis: 'Ata Luxtory W18 (teste)',
    });
  });

  it('[PD-009] a versão aceita é a vigente no instante dos termos; aceite de outra versão → ERR_POLICY_MISSING', async () => {
    const [current] = await policyHistory(h.db, 'luxchange_request');
    const terms = await resolve({
      parameters: [],
      policy: { mechanism: 'luxchange_request', acceptedPolicyId: current!.id },
    });
    expect(terms.policy).toMatchObject({
      policyId: current!.id,
      mechanism: 'luxchange_request',
      config: TEST_POLICIES.luxchange_request,
    });
    expect(
      Math.abs(Date.parse(terms.policy!.effectiveFrom) - current!.effectiveFrom.getTime()),
    ).toBeLessThan(1);
    expect(
      await rejection(
        resolve({
          parameters: [],
          policy: { mechanism: 'luxchange_request', acceptedPolicyId: randomUUID() },
        }),
      ),
    ).toBe('ERR_POLICY_MISSING');
    expect(
      await rejection(
        resolve({
          parameters: [],
          policy: { mechanism: 'luxplus', acceptedPolicyId: current!.id },
        }),
      ),
    ).toBe('ERR_POLICY_MISSING');
    // A avaliação usa exatamente a versão resolvida (vínculo persistente na W21).
    const evaluation = evaluatePolicy(
      {
        policyId: terms.policy!.policyId,
        mechanism: 'luxchange_request',
        config: terms.policy!.config,
      },
      {
        mechanism: 'luxchange_request',
        checkInAt: new Date(Date.now() + 800 * HOUR_MS).toISOString(),
        creditsConsumed: '100',
        feePaid: { amountMinor: 1000n, currency: 'BRL' },
      },
      { type: 'cancellation', at: new Date().toISOString() },
    );
    expect(evaluation).toMatchObject({ policyId: current!.id, minNoticeHours: 700 });
  });

  it('[TECH-030] vigência incompatível → ERR_STATE_TRANSITION; versão agendada não vale antes do início', async () => {
    const past = new Date(Date.now() - HOUR_MS).toISOString();
    expect(
      await run.as(
        admin,
        handlers.publishPolicy,
        input('luxchange_direct', { effective_from: past }),
      ),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_STATE_TRANSITION' }));
    const future = new Date(Date.now() + 48 * HOUR_MS).toISOString();
    const scheduled = await run.as(
      admin,
      handlers.publishPolicy,
      input('luxchange_direct', { effective_from: future }),
    );
    expect(scheduled.status).toBe('committed');
    expect(
      await rejection(
        resolve({
          parameters: [],
          policy: {
            mechanism: 'luxchange_direct',
            acceptedPolicyId: (await policyHistory(h.db, 'luxchange_direct'))[0]!.id,
          },
        }),
      ),
    ).toBe('ERR_POLICY_MISSING');
    expect(
      await run.as(
        admin,
        handlers.publishPolicy,
        input('luxchange_direct', { effective_from: future }),
      ),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_STATE_TRANSITION' }));
  });

  it('[TECH-053][PD-009] publicação durante a resolução espera a trava: os termos nunca mudam no meio da transação', async () => {
    const [current] = await policyHistory(h.db, 'luxchange_request');
    const release = deferred<void>();
    const locked = deferred<void>();
    const holding = h.db.transaction().execute(async (tx) => {
      const terms = await resolveEconomicTerms(tx, new LockSequence(), store, {
        parameters: [],
        policy: { mechanism: 'luxchange_request', acceptedPolicyId: current!.id },
      });
      locked.resolve();
      await release.promise;
      return terms;
    });
    await locked.promise;
    const publishing = run.as(admin, handlers.publishPolicy, input('luxchange_request'));
    await waitForLockWaiter(h.database.pool);
    release.resolve();
    const terms = await holding;
    const published = await publishing;
    expect(published.status).toBe('committed');
    expect(terms.policy!.policyId).toBe(current!.id);
    if (published.status !== 'committed') throw new Error('unreachable');
    const latest = (await policyHistory(h.db, 'luxchange_request')).at(-1)!;
    expect(latest.effectiveFrom.getTime()).toBeGreaterThan(Date.parse(terms.resolvedAt) - 1);
  });

  describe('POST /v1/admin/policies (TECH-050, TECH-056, TECH-100)', () => {
    let adminUser: string;
    const cookie = (userId: string, assurance: 'aal1' | 'aal2' = 'aal2') =>
      `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;
    const headers = (userId: string, extra: Record<string, string> = {}) => ({
      host: '127.0.0.1:3100',
      origin: ORIGIN,
      'content-type': 'application/json',
      cookie: cookie(userId),
      'idempotency-key': randomUUID(),
      ...extra,
    });
    const call = (requestHeaders: Record<string, string>, payload: unknown, raw?: string) => {
      const { logger } = captureLogger();
      const routes = createPolicyRoutes({
        source,
        clock,
        database: () => h.db,
        afterCommit: vi.fn(),
      });
      return withRoute(routes.publishPolicy, logger)(
        new Request(`${ORIGIN}/v1/admin/policies`, {
          method: 'POST',
          headers: requestHeaders,
          body: raw ?? JSON.stringify(payload),
        }),
        { params: Promise.resolve({}) },
      );
    };

    beforeAll(() => {
      adminUser = admin.userId;
    });

    it('[TECH-100][TECH-050] outra origem e AAL1 → 403; sem sessão → 401; corpo acima de 16 KiB → 413', async () => {
      const attempts: Record<string, string>[] = [
        { origin: 'https://atacante.test' },
        { cookie: cookie(adminUser, 'aal1') },
      ];
      for (const extra of attempts) {
        const response = await call(headers(adminUser, extra), input('rental_external'));
        expect(response.status).toBe(403);
        expect(validError(await response.json())).toBe(true);
      }
      const anonymous: Record<string, string> = headers(adminUser);
      delete anonymous.cookie;
      expect((await call(anonymous, input('rental_external'))).status).toBe(401);
      const big = await call(headers(adminUser), null, JSON.stringify({ pad: 'x'.repeat(17_000) }));
      expect(big.status).toBe(413);
      expect(await count('rental_external')).toBe(0);
    });

    it('[REQ-104][TECH-056] política inválida → 400; válida → 201 conforme o OpenAPI', async () => {
      const invalid = await call(
        headers(adminUser),
        input('rental_external', {
          config: INVALID_POLICIES.find(([, m]) => m === 'rental_external')![2],
        }),
      );
      expect(invalid.status).toBe(400);
      expect(validError(await invalid.json())).toBe(true);
      const response = await call(headers(adminUser), input('rental_external'));
      const json = await response.json();
      expect(response.status).toBe(201);
      expect(responseValidator('/admin/policies', 'post', 201)(json)).toBe(true);
      expect(json).toMatchObject({
        mechanism: 'rental_external',
        schema_version: 1,
        effective_to: null,
      });
    });
  });
});
