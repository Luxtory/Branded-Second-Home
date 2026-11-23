import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { createDepositRoute } from '@/features/luxchange/presentation/deposit-route';
import { withRoute } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../support/openapi';
import { deactivate } from '../booking/lifecycle-support';
import { TEST_VALIDITY_MONTHS } from '../credits/credits-support';
import {
  depositDate,
  depositHarness,
  expectedCredits,
  publishPrl,
  type CreditTitular,
  type DepositHarness,
} from './luxchange-support';

// W20 (OpenAPI `depositCapacity`, tag `luxchange`; TECH-050, TECH-056, TECH-100): a rota REST do depósito é a mesma
// entrada da Server Action — origem, sessão do Titular, `party_id` representada, Idempotency-Key, corpo limitado.
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const validError = schemaValidator('Error');
const PRL = '55555';

describe('POST /v1/luxchange/deposits (W20)', () => {
  let d: DepositHarness;
  let owner: CreditTitular;

  const headers = (extra: Record<string, string> = {}) => ({
    host: '127.0.0.1:3100',
    origin: ORIGIN,
    'content-type': 'application/json',
    cookie: `${TEST_SESSION_COOKIE}=${issueTestToken(owner.userId, 'aal1', clock)}`,
    'idempotency-key': randomUUID(),
    ...extra,
  });
  const body = (offset: number, extra: Record<string, unknown> = {}) => ({
    party_id: owner.partyId,
    second_home_id: owner.homeId,
    nights: [depositDate(offset)],
    expected_credits: expectedCredits(BigInt(PRL)),
    expected_validity_months: TEST_VALIDITY_MONTHS,
    ...extra,
  });
  const call = (requestHeaders: Record<string, string>, payload: unknown) =>
    withRoute(
      createDepositRoute({ source, clock, database: () => d.c.h.db, afterCommit: vi.fn() }),
      captureLogger().logger,
    )(
      new Request(`${ORIGIN}/v1/luxchange/deposits`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
      }),
    );

  beforeAll(async () => {
    d = await depositHarness();
    owner = d.c.titular;
    await publishPrl(
      d,
      owner.homeId,
      Object.fromEntries([0, 1, 2, 3].map((offset) => [depositDate(offset), PRL])),
    );
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  it('[REQ-060][TECH-056] 201 com o contrato do OpenAPI; replay devolve o mesmo corpo', async () => {
    const key = randomUUID();
    const response = await call(headers({ 'idempotency-key': key }), body(0));
    expect(response.status).toBe(201);
    const json = (await response.json()) as Record<string, unknown>;
    expect(responseValidator('/luxchange/deposits', 'post', 201)(json)).toBe(true);
    expect(json).toMatchObject({ credits: expectedCredits(BigInt(PRL)), nights: [depositDate(0)] });
    const replay = await call(headers({ 'idempotency-key': key }), body(0));
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(await replay.json()).toEqual(json);
  });

  it('[TECH-100] origem diferente → 403; sem sessão → 401; sem party_id → 400', async () => {
    const foreign = await call(headers({ origin: 'https://evil.example' }), body(1));
    expect(foreign.status).toBe(403);
    expect(validError(await foreign.json())).toBe(true);
    const { cookie: _cookie, ...anonymous } = headers();
    void _cookie;
    expect((await call(anonymous, body(1))).status).toBe(401);
    const { party_id: _party, ...withoutParty } = body(1);
    void _party;
    expect((await call(headers(), withoutParty)).status).toBe(400);
  });

  it('[REQ-051][TECH-050] party que o usuário não representa → 403 ERR_PERMISSION', async () => {
    const response = await call(headers(), body(1, { party_id: randomUUID() }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'ERR_PERMISSION' });
  });

  it('[ADR-0036 §8] termos diferentes dos revisados → 409 ERR_DEPOSIT_TERMS_CHANGED', async () => {
    const response = await call(headers(), body(2, { expected_credits: '1' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ERR_DEPOSIT_TERMS_CHANGED' });
  });

  it('[ADR-0036 §7] K6 fechada → 503 ERR_UNAVAILABLE, nada gravado', async () => {
    await deactivate(d.c.h, 'luxchange_deposit');
    try {
      const response = await call(headers(), body(3));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'ERR_UNAVAILABLE' });
    } finally {
      await d.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('luxchange_deposit', now(), 'test:activation')`,
      );
    }
    const { rows } = await d.c.h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.economic_snapshot_night WHERE stay_date = $1`,
      [depositDate(3)],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
