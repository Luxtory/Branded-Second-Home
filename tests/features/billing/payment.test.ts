import { describe, expect, it } from 'vitest';
import {
  ENABLED_SETTLEMENT_KINDS,
  PAYMENT_STATES,
  REFUND_STATES,
  SETTLEMENT_GROUPS,
  SETTLEMENT_KINDS,
  advancePayment,
  advanceRefund,
  refundableMinor,
  settlementGroup,
  settlementReport,
} from '@/features/billing';

describe('estados financeiros monotônicos (TECH-080, ADR-0035 §2)', () => {
  it('[TECH-080] pagamento só sai de pending; terminais nunca regridem nem trocam', () => {
    expect(advancePayment('pending', 'approved')).toEqual({ kind: 'advance', to: 'approved' });
    expect(advancePayment('pending', 'failed')).toEqual({ kind: 'advance', to: 'failed' });
    for (const current of ['approved', 'failed'] as const)
      for (const incoming of PAYMENT_STATES)
        expect(advancePayment(current, incoming)).toEqual({ kind: 'no_change' });
    expect(advancePayment('pending', 'pending')).toEqual({ kind: 'no_change' });
  });

  it('[TECH-080] estorno só sai de pending', () => {
    expect(advanceRefund('pending', 'succeeded')).toEqual({ kind: 'advance', to: 'succeeded' });
    expect(advanceRefund('pending', 'failed')).toEqual({ kind: 'advance', to: 'failed' });
    for (const current of ['succeeded', 'failed'] as const)
      for (const incoming of REFUND_STATES)
        expect(advanceRefund(current, incoming)).toEqual({ kind: 'no_change' });
  });

  it('[TECH-025] saldo estornável ignora tentativas falhas e nunca conta duas vezes', () => {
    expect(refundableMinor(12_000n, [])).toBe(12_000n);
    expect(refundableMinor(12_000n, [{ state: 'failed', amountMinor: 12_000n }])).toBe(12_000n);
    expect(
      refundableMinor(12_000n, [
        { state: 'failed', amountMinor: 12_000n },
        { state: 'pending', amountMinor: 12_000n },
      ]),
    ).toBe(0n);
    expect(refundableMinor(12_000n, [{ state: 'succeeded', amountMinor: 2_000n }])).toBe(10_000n);
  });
});

describe('settlement por categoria (TECH-083, REQ-094)', () => {
  it('[REQ-094] categorias fechadas do TECH-083 + líquido do Titular, cada uma num único grupo', () => {
    expect([...SETTLEMENT_KINDS].sort()).toEqual(
      [
        'administration_fee',
        'brand_partner_obligation',
        'design_build',
        'investor_margin',
        'luxchange_fee',
        'luxplus',
        'membership',
        'property_services',
        'rental',
        'second_home_expenses',
        'structuring_commercialization',
        'titular_net',
      ].sort(),
    );
    expect(new Set(SETTLEMENT_KINDS).size).toBe(SETTLEMENT_KINDS.length);
    expect(settlementGroup('brand_partner_obligation')).toBe('third_party_obligations');
    expect(settlementGroup('investor_margin')).toBe('third_party_obligations');
    expect(settlementGroup('titular_net')).toBe('third_party_obligations');
    expect(SETTLEMENT_GROUPS.luxtory_revenue).not.toContain('brand_partner_obligation');
    expect(SETTLEMENT_GROUPS.luxtory_revenue).not.toContain('investor_margin');
    expect(ENABLED_SETTLEMENT_KINDS).toEqual(['luxchange_fee']);
  });

  it('[REQ-094] o relatório lista toda categoria, por moeda, sem total por grupo nem total geral', () => {
    const report = settlementReport([
      { kind: 'luxchange_fee', currency: 'BRL', entries: 2, amountMinor: 72_000n },
      { kind: 'brand_partner_obligation', currency: 'BRL', entries: 1, amountMinor: 5_000n },
    ]);
    expect(report.map((section) => section.group)).toEqual([
      'luxtory_revenue',
      'second_home_expenses',
      'third_party_obligations',
    ]);
    expect(report.flatMap((section) => section.lines).length).toBe(SETTLEMENT_KINDS.length);
    const fee = report[0]!.lines.find((line) => line.kind === 'luxchange_fee')!;
    expect(fee).toEqual({
      kind: 'luxchange_fee',
      enabled: true,
      totals: [{ currency: 'BRL', entries: 2, amountMinor: 72_000n }],
    });
    const partner = report[2]!.lines.find((line) => line.kind === 'brand_partner_obligation')!;
    expect(partner.totals[0]!.amountMinor).toBe(5_000n);
    for (const section of report) expect(Object.keys(section).sort()).toEqual(['group', 'lines']);
  });
});
