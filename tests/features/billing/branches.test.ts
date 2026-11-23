import { describe, expect, it } from 'vitest';
import {
  PaymentRejection,
  PaymentsUnavailableError,
  applyCharge,
  createFakePaymentGateway,
  initiatePayment,
  processRefund,
  refreshPayment,
  runReconciliation,
  type BillingStore,
  type PaymentRecord,
} from '@/features/billing';
import { captureLogger } from '../../support/capture-logger';

// Ramos de erro e de borda do billing sem banco (store mínimo em memória): o comportamento com o PostgreSQL real está em
// billing.db.test.ts.
const SECRET = 'w19-branches-secret-0123456789abcdef';
const log = captureLogger().logger;

const payment = (over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: '00000000-0000-4000-8000-000000000001',
  payerPartyId: 'p',
  createdByUserId: 'u',
  purpose: 'luxchange_fee',
  amountMinor: 100n,
  currency: 'BRL',
  provider: 'fake',
  providerPaymentId: 'fake_pay_a',
  requestHash: 'h',
  state: 'pending',
  ...over,
});

function memoryStore(current: PaymentRecord | null): BillingStore<unknown> {
  let row = current;
  return {
    openPayment: async () => row!,
    findPayment: async () => row,
    updatePayment: async (_id, decide) => {
      if (row === null) return null;
      const update = decide(row);
      if (update !== null) row = { ...row, ...update } as PaymentRecord;
      return { before: row, changed: update !== null };
    },
    findRefund: async () => null,
  } as unknown as BillingStore<unknown>;
}

const request = {
  actorUserId: 'u',
  payerPartyId: 'p',
  purpose: 'luxchange_fee' as const,
  amountMinor: 100n,
  currency: 'BRL' as const,
  idempotencyKey: 'k',
};

describe('billing — ramos de erro (TECH-001, TECH-081)', () => {
  it('[TECH-081] sem gateway, chave ou valor inválidos: nada é gravado', async () => {
    const store = memoryStore(null);
    await expect(initiatePayment({ store, gateway: null, log }, request)).rejects.toBeInstanceOf(
      PaymentsUnavailableError,
    );
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET });
    for (const bad of [
      { ...request, idempotencyKey: 'com espaço' },
      { ...request, amountMinor: 0n },
      { ...request, amountMinor: 10n ** 15n },
    ])
      await expect(initiatePayment({ store, gateway, log }, bad)).rejects.toBeInstanceOf(
        PaymentRejection,
      );
  });

  it('[TECH-080] pagamento já resolvido é devolvido sem nova cobrança; referência divergente nunca sobrescreve', async () => {
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET });
    const approved = payment({ state: 'approved', requestHash: '' });
    const store = memoryStore(approved);
    expect(await refreshPayment({ store, gateway, log }, approved.id)).toEqual(approved);
    await expect(
      applyCharge(memoryStore(payment()), payment().id, {
        providerPaymentId: 'outro',
        status: 'approved',
      }),
    ).rejects.toThrow(/Provider reference differs/);
  });

  it('[TECH-101] estorno inexistente não chama o PSP; PSP fora do ar deixa o estorno pending', async () => {
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET, unreachable: () => true });
    expect(await processRefund({ store: memoryStore(null), gateway, log }, 'r')).toBeNull();
    const pending = {
      ...memoryStore(null),
      findRefund: async () => ({
        id: 'r',
        paymentId: 'p',
        amountMinor: 100n,
        currency: 'BRL',
        state: 'pending' as const,
        provider: 'fake',
        providerPaymentId: 'x',
      }),
    } as unknown as BillingStore<unknown>;
    expect(await processRefund({ store: pending, gateway, log }, 'r')).toBe('pending');
  });

  it('[TECH-090] conciliação: falha de item só vai ao log; orçamento esgotado adia o restante', async () => {
    const store = {
      stalePendingPayments: async () => ['a', 'b'],
      paymentsNeedingRefund: async () => ['c'],
      pendingRefunds: async () => [],
      findPayment: async () => {
        throw new Error('boom');
      },
    } as unknown as BillingStore<unknown>;
    const gateway = createFakePaymentGateway({ webhookSecret: SECRET });
    let clock = 0;
    const counts = await runReconciliation(
      {
        store,
        gateway,
        log,
        alert: { raise: async () => undefined },
        execute: async () => ({
          status: 'rejected',
          operationId: null,
          code: 'ERR_STATE_TRANSITION',
          replayed: false,
        }),
        graceSeconds: 1,
        timeBudgetMs: 10,
        monotonicMs: () => (clock += 6),
      },
      { correlationId: 'c' },
    );
    expect(counts.failed).toBe(1);
    expect(counts.deferred).toBeGreaterThanOrEqual(1);
  });
});
