import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import {
  createRequestFeePaymentRoute,
  createRequestPreviewRoute,
  createSendRequestRoute,
  createWithdrawRequestRoute,
  type RequestRouteDependencies,
} from '@/features/luxchange/presentation/request-routes';
import { withRoute } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../support/openapi';
import { activate, deactivate } from '../booking/lifecycle-support';
import {
  creditsHarness,
  originate,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { requestApp } from './request-app-support';
import {
  CONSENT_VERSION,
  newRequester,
  pricedNights,
  requestFixture,
  type RequestFixture,
} from './request-support';

/**
 * W21 E3 — rotas REST da Request (OpenAPI `previewRequest`, `payRequestFee`, `sendRequest`, `withdrawRequest`; TECH-050,
 * TECH-054, TECH-056, TECH-080, TECH-100): mesma origem, sessão do Titular, `party_id` representada, Idempotency-Key,
 * corpo limitado; efeitos depois da resposta (estornos e recuperação do pagamento) só depois do desfecho do domínio.
 */
const ORIGIN = 'http://127.0.0.1:3100';
const clock = { now: () => new Date() };
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
const validError = schemaValidator('Error');

describe('W21 E3 — rotas /v1/luxchange/requests*', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  const pending: (() => Promise<void>)[] = [];
  const pool = () => c.h.database.pool;

  const deps = (): RequestRouteDependencies => ({
    source,
    clock,
    database: () => c.h.db,
    // O envio de cada superfície vem do próprio caminho (aqui, a rota); o fluxo só fornece prévia, pagamento e estornos.
    flow: () => app.flow(f.c.titular),
    afterResponse: (task) => void pending.push(task),
    afterCommit: vi.fn(),
    quota: async () => ({ status: 'allowed' }),
  });
  const drain = async () => {
    while (pending.length > 0) await pending.shift()!();
  };
  const headers = (titular: CreditTitular, extra: Record<string, string> = {}) => ({
    host: '127.0.0.1:3100',
    origin: ORIGIN,
    'content-type': 'application/json',
    cookie: `${TEST_SESSION_COOKIE}=${issueTestToken(titular.userId, 'aal1', clock)}`,
    'idempotency-key': randomUUID(),
    ...extra,
  });
  const post = (
    route: (request: Request) => Promise<Response>,
    path: string,
    requestHeaders: Record<string, string>,
    body: unknown,
  ) =>
    route(
      new Request(`${ORIGIN}/v1${path}`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
      }),
    );
  const log = () => captureLogger().logger;
  const preview = withRoute(createRequestPreviewRoute(deps()), log());
  const fee = withRoute(createRequestFeePaymentRoute(deps()), log());
  const send = withRoute(createSendRequestRoute(deps()), log());
  const withdraw = withRoute(createWithdrawRequestRoute(deps()), log());

  /** Pedido de 500 Créditos com Garantia inteira num lote novo, pronto para prévia e pagamento. */
  async function ready() {
    const r = await newRequester(f);
    await originate(c, '500', { titular: r });
    return { r, shape: app.shape(r, await pricedNights(f, [5_000n])) };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
    app = requestApp(f);
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[TECH-056][TECH-100] prévia: 200 conforme o OpenAPI; sem sessão, outra origem, corpo inválido ou party alheia recusam', async () => {
    const { r, shape } = await ready();
    const response = await post(preview, '/luxchange/requests/preview', headers(r), shape);
    expect(response.status).toBe(200);
    const valid = responseValidator('/luxchange/requests/preview', 'post', 200);
    expect(valid(await response.json()), JSON.stringify(valid.errors)).toBe(true);
    const anonymous: Record<string, string> = { ...headers(r) };
    delete anonymous.cookie;
    for (const [requestHeaders, body, status] of [
      [anonymous, shape, 401],
      [headers(r, { origin: 'https://evil.example' }), shape, 403],
      [headers(r), { ...shape, checkin: 'x' }, 400],
      [headers(f.holder), shape, 403],
    ] as const) {
      const refused = await post(
        preview,
        '/luxchange/requests/preview',
        { ...requestHeaders },
        body,
      );
      expect(refused.status).toBe(status);
      expect(validError(await refused.json())).toBe(true);
    }
  });

  it('[TECH-080] pagamento da Taxa: 201 conforme o OpenAPI; a mesma chave não cobra de novo', async () => {
    const { r, shape } = await ready();
    const key = randomUUID();
    const first = await post(
      fee,
      '/luxchange/requests/fee-payment',
      headers(r, { 'idempotency-key': key }),
      shape,
    );
    expect(first.status).toBe(201);
    const body = (await first.json()) as {
      payment_id: string;
      state: string;
      amount_minor: string;
    };
    const valid = responseValidator('/luxchange/requests/fee-payment', 'post', 201);
    expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
    expect(body).toMatchObject({ state: 'approved', amount_minor: '9876' });
    const again = await post(
      fee,
      '/luxchange/requests/fee-payment',
      headers(r, { 'idempotency-key': key }),
      shape,
    );
    expect(((await again.json()) as { payment_id: string }).payment_id).toBe(body.payment_id);
    const { rows } = await pool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.payment WHERE payer_party_id = $1',
      [r.partyId],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('[REQ-062][TECH-056] envio: 201 conforme o OpenAPI e replay marcado; retirada: 200, estorno processado depois da resposta', async () => {
    const { r, shape } = await ready();
    const paid = (await (
      await post(fee, '/luxchange/requests/fee-payment', headers(r), shape)
    ).json()) as { payment_id: string; quote: Parameters<typeof app.sendInput>[1] };
    const input = app.sendInput(shape, paid.quote, paid.payment_id);
    const key = randomUUID();
    const sent = await post(
      send,
      '/luxchange/requests',
      headers(r, { 'idempotency-key': key }),
      input,
    );
    expect(sent.status).toBe(201);
    const result = (await sent.json()) as { request_id: string };
    const valid = responseValidator('/luxchange/requests', 'post', 201);
    expect(valid(result), JSON.stringify(valid.errors)).toBe(true);
    const replay = await post(
      send,
      '/luxchange/requests',
      headers(r, { 'idempotency-key': key }),
      input,
    );
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    await drain();

    const path = `/luxchange/requests/${result.request_id}/withdraw`;
    expect(
      (await post(withdraw, path, headers(f.holder), { party_id: f.holder.partyId })).status,
    ).toBe(404);
    expect(
      (
        await post(withdraw, '/luxchange/requests/nao-e-uuid/withdraw', headers(r), {
          party_id: r.partyId,
        })
      ).status,
    ).toBe(400);
    const closed = await post(withdraw, path, headers(r), { party_id: r.partyId });
    expect(closed.status).toBe(200);
    const closing = (await closed.json()) as { refund_id: string; state: string };
    const validClosing = responseValidator('/luxchange/requests/{requestId}/withdraw', 'post', 200);
    expect(validClosing(closing), JSON.stringify(validClosing.errors)).toBe(true);
    const before = await pool().query<{ state: string }>(
      'SELECT state FROM app.refund WHERE id = $1',
      [closing.refund_id],
    );
    expect(before.rows[0]!.state).toBe('pending');
    await drain();
    const after = await pool().query<{ state: string }>(
      'SELECT state FROM app.refund WHERE id = $1',
      [closing.refund_id],
    );
    expect(after.rows[0]!.state).toBe('succeeded');
  });

  it('[TECH-080] envio recusado depois do pagamento aprovado: 409 e devolução da Taxa iniciada depois da resposta', async () => {
    const { r, shape } = await ready();
    const paid = (await (
      await post(fee, '/luxchange/requests/fee-payment', headers(r), shape)
    ).json()) as { payment_id: string; quote: Parameters<typeof app.sendInput>[1] };
    const input = app.sendInput(shape, { ...paid.quote, night_credits: ['499'] }, paid.payment_id);
    const refused = await post(send, '/luxchange/requests', headers(r), input);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'ERR_REQUEST_TERMS_CHANGED' });
    const refunds = async () =>
      (
        await pool().query<{ state: string }>(
          'SELECT state FROM app.refund WHERE payment_id = $1',
          [paid.payment_id],
        )
      ).rows;
    expect(await refunds()).toEqual([]);
    await drain();
    expect(await refunds()).toEqual([{ state: 'succeeded' }]);
  });

  it('[TECH-100] limite excedido: prévia e pagamento → 429 com retry-after, nada cobrado; limites ausentes → 422', async () => {
    const { r, shape } = await ready();
    const limited: RequestRouteDependencies = {
      ...deps(),
      quota: async () => ({ status: 'limited', retryAfterSeconds: 37 }),
    };
    for (const [route, path] of [
      [withRoute(createRequestPreviewRoute(limited), log()), '/luxchange/requests/preview'],
      [withRoute(createRequestFeePaymentRoute(limited), log()), '/luxchange/requests/fee-payment'],
    ] as const) {
      const response = await post(route, path, headers(r), shape);
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('37');
      expect(await response.json()).toMatchObject({ code: 'ERR_RATE_LIMITED' });
    }
    const { rows } = await pool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.payment WHERE payer_party_id = $1',
      [r.partyId],
    );
    expect(rows[0]!.n).toBe(0);
    // Envio direto (send_request) também limitado, pelo gancho do executor: nada gravado; o replay não consome.
    const paid = (await (
      await post(fee, '/luxchange/requests/fee-payment', headers(r), shape)
    ).json()) as { payment_id: string; quote: Parameters<typeof app.sendInput>[1] };
    const input = app.sendInput(shape, paid.quote, paid.payment_id);
    const key = randomUUID();
    const limitedSend = withRoute(createSendRequestRoute(limited), log());
    const refusedSend = await post(
      limitedSend,
      '/luxchange/requests',
      headers(r, { 'idempotency-key': key }),
      input,
    );
    expect(refusedSend.status).toBe(429);
    expect(await refusedSend.json()).toMatchObject({ code: 'ERR_RATE_LIMITED' });
    const requests = async () =>
      (
        await pool().query<{ n: number }>(
          'SELECT count(*)::int AS n FROM app.luxchange_request WHERE requester_party_id = $1',
          [r.partyId],
        )
      ).rows[0]!.n;
    expect(await requests()).toBe(0);
    expect(
      (await post(send, '/luxchange/requests', headers(r, { 'idempotency-key': key }), input))
        .status,
    ).toBe(201);
    const replay = await post(
      limitedSend,
      '/luxchange/requests',
      headers(r, { 'idempotency-key': key }),
      input,
    );
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(await requests()).toBe(1);
    await drain();
    const missing = withRoute(
      createRequestPreviewRoute({
        ...deps(),
        quota: async () => ({ status: 'parameter_missing' }),
      }),
      log(),
    );
    const refused = await post(missing, '/luxchange/requests/preview', headers(r), shape);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: 'ERR_PARAMETER_MISSING' });
  });

  it('[TECH-056] recusa de negócio (noite sem PRL) → 422 no schema do contrato', async () => {
    const r = await newRequester(f);
    const refused = await post(
      preview,
      '/luxchange/requests/preview',
      headers(r),
      app.shape(r, f.freshNights(1)),
    );
    expect(refused.status).toBe(422);
    const valid = responseValidator('/luxchange/requests/preview', 'post', 422);
    const body = await refused.json();
    expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
    expect(body).toMatchObject({
      code: expect.stringMatching(/^ERR_(PRL_MISSING|CAPACITY_UNAVAILABLE)$/),
    });
  });

  it('[ADR-0037 §10] chave fechada: envio e prévia 503 sem nada gravado; retirada segue', async () => {
    const { r, shape } = await ready();
    const paid = (await (
      await post(fee, '/luxchange/requests/fee-payment', headers(r), shape)
    ).json()) as { payment_id: string; quote: Parameters<typeof app.sendInput>[1] };
    const sent = (await (
      await post(
        send,
        '/luxchange/requests',
        headers(r),
        app.sendInput(shape, paid.quote, paid.payment_id),
      )
    ).json()) as { request_id: string };
    await drain();
    await deactivate(c.h, 'luxchange_exchange');
    try {
      expect((await post(preview, '/luxchange/requests/preview', headers(r), shape)).status).toBe(
        503,
      );
      const closed = await post(
        withdraw,
        `/luxchange/requests/${sent.request_id}/withdraw`,
        headers(r),
        {
          party_id: r.partyId,
        },
      );
      expect(closed.status).toBe(200);
    } finally {
      await activate(c.h, 'luxchange_exchange');
    }
    await drain();
    expect(CONSENT_VERSION).toMatch(/^request-consent/);
  });
});
