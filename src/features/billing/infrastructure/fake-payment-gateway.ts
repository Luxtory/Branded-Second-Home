import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PaymentState, RefundState } from '../domain/payment';
import type {
  GatewayCharge,
  GatewayEvent,
  GatewayRefund,
  PaymentGateway,
} from '../application/ports';

/** Nome do adaptador (segmento `{provider}` do webhook). */
export const FAKE_PROVIDER = 'fake';
/** Cabeçalho de assinatura do protocolo do fake: `t=<segundos Unix>,v1=<HMAC-SHA256 hex de "t.corpo">`. */
export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';
/** Tolerância de tempo do protocolo do fake (a mesma ordem de grandeza dos PSPs de mercado). */
export const FAKE_WEBHOOK_TOLERANCE_SECONDS = 300;

const SIGNATURE = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/;
const MS_PER_SECOND = 1000;

const eventBody = z.discriminatedUnion('type', [
  z.strictObject({
    id: z.string().regex(/^[!-~]{1,255}$/),
    type: z.enum(['payment.approved', 'payment.failed']),
    payment: z.string().min(1).max(255),
  }),
  z.strictObject({
    id: z.string().regex(/^[!-~]{1,255}$/),
    type: z.enum(['refund.succeeded', 'refund.failed']),
    refund: z.uuid(),
    provider_refund: z.string().min(1).max(255).nullable(),
  }),
]);

export interface FakeGatewayOptions {
  /** Segredo HMAC do webhook (`PAYMENT_WEBHOOK_SECRET`). */
  readonly webhookSecret: string;
  /** Status de cada nova cobrança; padrão: aprovada. Determinístico por valor e chave. */
  readonly chargeStatus?: (input: {
    readonly amountMinor: bigint;
    readonly idempotencyKey: string;
  }) => PaymentState;
  /** Resultado de cada novo estorno; padrão: concluído. */
  readonly refundStatus?: (input: { readonly idempotencyKey: string }) => RefundState;
  /** Falha simulada de rede (antes de o PSP registrar nada). */
  readonly unreachable?: () => boolean;
}

export interface FakePaymentGateway extends PaymentGateway {
  /** Muda o status de uma cobrança no "provedor" (simula aprovação assíncrona) — só testes e desenvolvimento. */
  settle(providerPaymentId: string, status: PaymentState): void;
  /** Corpo e cabeçalhos assinados de um evento, como o provedor enviaria. */
  signEvent(
    event: z.infer<typeof eventBody>,
    at: Date,
  ): { readonly body: string; readonly headers: Headers };
  readonly calls: { readonly charges: number; readonly refunds: number };
}

const reference = (prefix: string, key: string) =>
  `${prefix}_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;

/**
 * PSP determinístico para testes e desenvolvimento (TECH-081; ADR-0035 §7): idempotente pela chave, como um provedor
 * real; estado em memória do processo. Recusado em Production pela validação do ambiente. Nunca move dinheiro.
 */
export function createFakePaymentGateway(options: FakeGatewayOptions): FakePaymentGateway {
  const charges = new Map<string, { providerPaymentId: string; status: PaymentState }>();
  const byReference = new Map<string, { providerPaymentId: string; status: PaymentState }>();
  const refunds = new Map<string, GatewayRefund>();
  const calls = { charges: 0, refunds: 0 };
  const sign = (timestamp: string, body: string) =>
    createHmac('sha256', options.webhookSecret).update(`${timestamp}.${body}`).digest('hex');
  const reachable = () => {
    if (options.unreachable?.() === true) throw new Error('fake provider unreachable');
  };

  return {
    provider: FAKE_PROVIDER,
    calls,

    async createCharge({ idempotencyKey, amountMinor }): Promise<GatewayCharge> {
      reachable();
      calls.charges += 1;
      const existing = charges.get(idempotencyKey);
      if (existing !== undefined) return { ...existing };
      const charge = {
        providerPaymentId: reference('fake_pay', idempotencyKey),
        status: options.chargeStatus?.({ amountMinor, idempotencyKey }) ?? ('approved' as const),
      };
      charges.set(idempotencyKey, charge);
      byReference.set(charge.providerPaymentId, charge);
      return { ...charge };
    },

    async getCharge(providerPaymentId) {
      reachable();
      const charge = byReference.get(providerPaymentId);
      if (charge === undefined) throw new Error('fake provider: unknown charge');
      return { ...charge };
    },

    async refund({ idempotencyKey, providerPaymentId }) {
      reachable();
      calls.refunds += 1;
      const existing = refunds.get(idempotencyKey);
      if (existing !== undefined) return existing;
      if (byReference.get(providerPaymentId)?.status !== 'approved')
        return { providerRefundId: null, status: 'failed' };
      const status = options.refundStatus?.({ idempotencyKey }) ?? 'succeeded';
      const result = {
        providerRefundId: status === 'failed' ? null : reference('fake_ref', idempotencyKey),
        status,
      };
      refunds.set(idempotencyKey, result);
      return result;
    },

    settle(providerPaymentId, status) {
      const charge = byReference.get(providerPaymentId);
      if (charge !== undefined) charge.status = status;
    },

    signEvent(event, at) {
      const body = JSON.stringify(event);
      const timestamp = String(Math.floor(at.getTime() / MS_PER_SECOND));
      return {
        body,
        headers: new Headers({
          'content-type': 'application/json',
          [FAKE_SIGNATURE_HEADER]: `t=${timestamp},v1=${sign(timestamp, body)}`,
        }),
      };
    },

    verifyWebhook(rawBody, headers, now): GatewayEvent | null {
      const match = SIGNATURE.exec(headers.get(FAKE_SIGNATURE_HEADER) ?? '');
      if (match === null) return null;
      const [, timestamp, signature] = match as unknown as [string, string, string];
      const expected = Buffer.from(sign(timestamp, rawBody), 'hex');
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
      const age = Math.abs(now.getTime() / MS_PER_SECOND - Number(timestamp));
      if (age > FAKE_WEBHOOK_TOLERANCE_SECONDS) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const result = eventBody.safeParse(parsed);
      if (!result.success) return null;
      const event = result.data;
      return 'payment' in event
        ? { eventId: event.id, type: event.type, providerPaymentId: event.payment }
        : {
            eventId: event.id,
            type: event.type,
            refundId: event.refund,
            providerRefundId: event.provider_refund,
          };
    },
  };
}
