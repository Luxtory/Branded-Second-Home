import { describe, expect, it, vi } from 'vitest';
import { runExpireRequests } from '@/features/luxchange/application/expire-requests';
import { submitRequest, type RequestFlowDependencies } from '@/features/luxchange';
import { compareCredits, subtractCredits } from '@/features/luxchange/domain/deposit';
import { composeRequest, periodNights, requestTerms } from '@/features/luxchange/domain/request';
import { captureLogger } from '../../support/capture-logger';

/**
 * W21 E2 — regras puras da Request (PD-012, TECH-073) e orquestração (TECH-080, TECH-090) com dependências falsas: os
 * ramos que o banco não alcança.
 */
describe('W21 — composição e termos da Request (PD-012, TECH-073)', () => {
  it('[PD-012] G = max(0, N − P), C = N − G, E = P − C; seleção sem unidade dispensável', () => {
    expect(composeRequest(['30000', '25000'], ['4500', '4500'])).toEqual({
      creditsRequired: '55000',
      complementCredits: '9000',
      guaranteeCredits: '46000',
      complementConsumption: '9000',
      complementExcess: '0',
    });
    expect(composeRequest(['55000'], ['60000'])).toMatchObject({
      guaranteeCredits: '0',
      complementConsumption: '55000',
      complementExcess: '5000',
    });
    expect(composeRequest(['0.5', '0.25'], [])).toMatchObject({
      creditsRequired: '0.75',
      guaranteeCredits: '0.75',
    });
    // P ≥ N com uma unidade dispensável (as outras já cobrem N) → recusa.
    expect(composeRequest(['250'], ['300', '300'])).toBeNull();
    expect(composeRequest(['500'], ['300', '300'])).toMatchObject({ complementExcess: '100' });
  });

  it('aritmética exata dos Créditos: comparação e diferença nunca negativa', () => {
    expect(compareCredits('0.1', '0.1')).toBe(0);
    expect(() => compareCredits('0.1', '0.10')).toThrow(RangeError);
    expect(compareCredits('10', '9.99')).toBe(1);
    expect(subtractCredits('1', '0.25')).toBe('0.75');
    expect(() => subtractCredits('1', '2')).toThrow(RangeError);
  });

  it('período `[checkin, checkout)` de 1 a 366 noites', () => {
    expect(periodNights('2027-02-27', '2027-03-02')).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
    ]);
    expect(periodNights('2027-03-01', '2027-03-01')).toBeNull();
    expect(periodNights('2027-03-02', '2027-03-01')).toBeNull();
    expect(periodNights('2027-01-01', '2028-01-03')).toBeNull();
  });

  it('[PD-012] termos do consentimento no formato do banco: noites por data, complemento por (Second Home, data)', () => {
    const terms = requestTerms({
      composition: composeRequest(['300'], ['20', '10'])!,
      feeAmountMinor: 9876n,
      feeCurrency: 'BRL',
      deadlineHours: '30',
      validityMonths: '18',
      policyId: 'policy',
      requestedNights: [{ stayDate: '2027-03-01', credits: '300' }],
      complementNights: [
        { secondHomeId: 'b', stayDate: '2027-04-01', credits: '10' },
        { secondHomeId: 'a', stayDate: '2027-04-02', credits: '10' },
        { secondHomeId: 'a', stayDate: '2027-04-01', credits: '10' },
      ],
    });
    expect(terms.complement_nights.map((night) => `${night.second_home_id}:${night.date}`)).toEqual(
      ['a:2027-04-01', 'a:2027-04-02', 'b:2027-04-01'],
    );
    expect(terms).toMatchObject({
      fee_amount_minor: '9876',
      deadline_hours: '30',
      guarantee_credits: '270',
    });
    expect(Object.keys(terms)).not.toContain('expires_at');
  });
});

describe('W21 — job expire_requests e fluxo do envio (TECH-090, TECH-080)', () => {
  const committed = (refundId: string, replayed = false) =>
    ({
      status: 'committed',
      replayed,
      operationId: 'op',
      result: {
        request_id: 'r',
        operation_id: 'op',
        state: 'expired',
        reason: 'expired',
        guarantee_released: '1',
        refund_id: refundId,
      },
    }) as const;

  it('[TECH-090] escolhe o command pelo motivo, conta itens e não falha por estorno pendente; orçamento esgotado adia', async () => {
    const log = captureLogger();
    const execute = vi
      .fn()
      .mockResolvedValueOnce(committed('x'))
      .mockResolvedValueOnce({ status: 'rejected', code: 'ERR_STATE_TRANSITION' })
      .mockResolvedValueOnce({ status: 'rejected', code: 'ERR_PERMISSION' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(committed('y', true));
    const result = await runExpireRequests(
      {
        closable: async () => [
          { requestId: '1', reason: 'expired' },
          { requestId: '2', reason: 'holder_membership' },
          { requestId: '3', reason: 'expired' },
          { requestId: '4', reason: 'expired' },
          { requestId: '5', reason: 'period_started' },
        ],
        execute,
        processRefund: async () => {
          throw new Error('psp down');
        },
        log: log.logger,
        timeBudgetMs: 60_000,
        monotonicMs: () => 0,
      },
      { correlationId: 'c' },
    );
    expect(result).toEqual({
      due: 5,
      expired: 1,
      closed_ineligible: 0,
      skipped: 2,
      failed: 2,
      deferred: 0,
    });
    expect(
      execute.mock.calls.map(([command, request]) => [command, request.idempotencyKey]),
    ).toEqual([
      ['expire_requests', 'expire_requests:1'],
      ['close_ineligible_request', 'close_ineligible_request:2'],
      ['expire_requests', 'expire_requests:3'],
      ['expire_requests', 'expire_requests:4'],
      ['close_ineligible_request', 'close_ineligible_request:5'],
    ]);
    let clock = 0;
    const deferred = await runExpireRequests(
      {
        closable: async () => [
          { requestId: '1', reason: 'expired' },
          { requestId: '2', reason: 'expired' },
        ],
        execute: async () => committed('z'),
        processRefund: async () => 'succeeded',
        log: log.logger,
        timeBudgetMs: 10,
        monotonicMs: () => (clock += 10),
      },
      { correlationId: 'c' },
    );
    expect(deferred).toMatchObject({ due: 2, deferred: 2 });
  });

  it('[TECH-080] recusa depois do pagamento: só pagamento aprovado da própria party é estornado; falha de recuperação não mascara a recusa', async () => {
    const log = captureLogger();
    const viewer = { userId: 'u', partyId: 'p' };
    const base = (payment: Record<string, unknown> | null, reconcile = vi.fn()) =>
      ({
        quote: vi.fn(),
        initiatePayment: vi.fn(),
        findPayment: async () => payment,
        send: async () => ({ status: 'rejected', code: 'ERR_REQUEST_TERMS_CHANGED' }),
        reconcile,
        processRefund: vi.fn(),
        log: log.logger,
      }) as unknown as RequestFlowDependencies;
    const input = { payment_id: 'pay' } as never;
    const own = vi.fn();
    await submitRequest(
      base({ payerPartyId: 'p', state: 'approved' }, own),
      viewer,
      input,
      'k',
      'c',
    );
    expect(own).toHaveBeenCalledWith('pay', 'c');
    for (const payment of [
      null,
      { payerPartyId: 'other', state: 'approved' },
      { payerPartyId: 'p', state: 'pending' },
    ]) {
      const reconcile = vi.fn();
      await submitRequest(base(payment, reconcile), viewer, input, 'k', 'c');
      expect(reconcile).not.toHaveBeenCalled();
    }
    const failing = vi.fn().mockRejectedValue(new Error('down'));
    await expect(
      submitRequest(
        base({ payerPartyId: 'p', state: 'approved' }, failing),
        viewer,
        input,
        'k',
        'c',
      ),
    ).resolves.toMatchObject({ status: 'rejected', code: 'ERR_REQUEST_TERMS_CHANGED' });
    // Exceção no envio: recupera e propaga.
    const thrown = vi.fn();
    await expect(
      submitRequest(
        {
          ...base({ payerPartyId: 'p', state: 'approved' }, thrown),
          send: async () => Promise.reject(new Error('x')),
        },
        viewer,
        input,
        'k',
        'c',
      ),
    ).rejects.toThrow('x');
    expect(thrown).toHaveBeenCalled();
  });
});
