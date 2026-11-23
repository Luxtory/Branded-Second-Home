import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFakePaymentGateway,
  initiatePayment,
  type FakePaymentGateway,
} from '@/features/billing';
import { createWebhookRoute } from '@/features/billing/presentation/webhook-route';
import { withRoute } from '@/features/platform';
import { responseValidator, schemaValidator } from '../../support/openapi';
import { WEBHOOK_SECRET, billingHarness, type BillingHarness } from './billing-support';

// `POST /v1/webhooks/psp/{provider}` (OpenAPI `receivePaymentWebhook`, ADR-0035 §6) sobre o PostgreSQL real: provedor,
// tipo, tamanho e assinatura conferidos antes do banco; respostas no contrato.
const PATH = '/v1/webhooks/psp/{provider}';
let b: BillingHarness;
let gateway: FakePaymentGateway;

function call(
  provider: string,
  body: string,
  headers: Headers,
  options: { gateway?: FakePaymentGateway | null } = {},
) {
  const route = createWebhookRoute({
    source: {
      DATABASE_URL: b.c.h.database.appUrl,
      PAYMENT_GATEWAY: 'fake',
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    gateway: () => (options.gateway === undefined ? gateway : options.gateway),
    database: b.c.h.db,
  });
  return withRoute(route, b.log.logger)(
    new Request(`http://localhost:3000/v1/webhooks/psp/${provider}`, {
      method: 'POST',
      headers,
      body,
    }),
    { params: Promise.resolve({ provider }) },
  );
}

beforeAll(async () => {
  gateway = createFakePaymentGateway({
    webhookSecret: WEBHOOK_SECRET,
    chargeStatus: () => 'pending',
  });
  b = await billingHarness({ gateway });
}, 240_000);

afterAll(async () => {
  await b?.c.h.close();
});

describe('POST /v1/webhooks/psp/{provider} (TECH-081, ADR-006)', () => {
  it('[TECH-081] evento assinado aplica uma vez; o replay responde duplicate; respostas no contrato', async () => {
    const payment = await initiatePayment(
      { store: b.store, gateway, log: b.log.logger },
      {
        actorUserId: b.titular.userId,
        payerPartyId: b.titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: 20_000n,
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
    const { body, headers } = gateway.signEvent(
      {
        id: `evt-route-${payment.id}`,
        type: 'payment.approved',
        payment: payment.providerPaymentId!,
      },
      new Date(),
    );
    const first = await call('fake', body, headers);
    const json = await first.json();
    expect(first.status).toBe(200);
    expect(json).toEqual({ status: 'applied' });
    expect(responseValidator(PATH, 'post', 200)(json)).toBe(true);
    const replay = await call('fake', body, headers);
    expect(await replay.json()).toEqual({ status: 'duplicate' });
  });

  it('[TECH-081] sem assinatura válida → 401; outro provedor ou sem gateway → 404; tipo e tamanho barrados', async () => {
    const { body } = gateway.signEvent(
      { id: 'evt-x', type: 'payment.approved', payment: 'p' },
      new Date(),
    );
    const json = new Headers({ 'content-type': 'application/json' });
    const unsigned = await call('fake', body, json);
    expect(unsigned.status).toBe(401);
    expect(schemaValidator('Error')(await unsigned.json())).toBe(true);
    expect((await call('stripe', body, json)).status).toBe(404);
    expect((await call('fake', body, json, { gateway: null })).status).toBe(404);
    expect((await call('fake', body, new Headers({ 'content-type': 'text/plain' }))).status).toBe(
      415,
    );
    const large = await call('fake', 'x'.repeat(70_000), json);
    expect(large.status).toBe(413);
    expect(schemaValidator('Error')(await large.json())).toBe(true);
  });
});
