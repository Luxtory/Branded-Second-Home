import { describe, expect, it } from 'vitest';
import { FAKE_SIGNATURE_HEADER, createFakePaymentGateway } from '@/features/billing';

const SECRET = 'w19-test-webhook-secret-0123456789abcdef';
const NOW = new Date('2026-11-23T12:00:00Z');

describe('PaymentGateway fake (TECH-081, ADR-0035 §7)', () => {
  it('[TECH-081] cobrança e estorno idempotentes pela chave, como um PSP real', async () => {
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET });
    const first = await gateway.createCharge({
      idempotencyKey: 'k1',
      amountMinor: 12_000n,
      currency: 'BRL',
    });
    const again = await gateway.createCharge({
      idempotencyKey: 'k1',
      amountMinor: 12_000n,
      currency: 'BRL',
    });
    expect(again).toEqual(first);
    expect(first.status).toBe('approved');
    const refund = await gateway.refund({
      idempotencyKey: 'r1',
      providerPaymentId: first.providerPaymentId,
      amountMinor: 12_000n,
      currency: 'BRL',
    });
    expect(
      await gateway.refund({
        idempotencyKey: 'r1',
        providerPaymentId: first.providerPaymentId,
        amountMinor: 12_000n,
        currency: 'BRL',
      }),
    ).toEqual(refund);
    expect(refund.status).toBe('succeeded');
  });

  it('[TECH-081] webhook autenticado: assinatura válida aceita; segredo, corpo, formato ou tempo errados recusados', () => {
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET });
    const event = { id: 'evt_1', type: 'payment.approved' as const, payment: 'fake_pay_x' };
    const { body, headers } = gateway.signEvent(event, NOW);
    expect(gateway.verifyWebhook(body, headers, NOW)).toEqual({
      eventId: 'evt_1',
      type: 'payment.approved',
      providerPaymentId: 'fake_pay_x',
    });
    const other = createFakePaymentGateway({ webhookSecret: `${SECRET}-other` });
    expect(other.verifyWebhook(body, headers, NOW)).toBeNull();
    expect(gateway.verifyWebhook(body.replace('evt_1', 'evt_2'), headers, NOW)).toBeNull();
    expect(gateway.verifyWebhook(body, new Headers(), NOW)).toBeNull();
    const malformed = new Headers({ [FAKE_SIGNATURE_HEADER]: 't=1,v1=zz' });
    expect(gateway.verifyWebhook(body, malformed, NOW)).toBeNull();
    // Replay fora da tolerância (5 min): o mesmo evento assinado há 10 minutos.
    expect(gateway.verifyWebhook(body, headers, new Date(NOW.getTime() + 600_000))).toBeNull();
    // Corpo assinado mas fora do contrato.
    const odd = gateway.signEvent(
      { id: 'evt_3', type: 'payment.approved', payment: '' } as never,
      NOW,
    );
    expect(gateway.verifyWebhook(odd.body, odd.headers, NOW)).toBeNull();
  });
});
