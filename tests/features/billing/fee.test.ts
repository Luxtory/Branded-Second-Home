import { describe, expect, it } from 'vitest';
import { MissingFeeTermsError, quoteLuxchangeFee } from '@/features/billing';
import { luxchangeFee, type EconomicTerms } from '@/features/pricing';

/** Termos como o resolvedor devolve: PRL total do período, percentual e mínimo vigentes (ids fictícios). */
function terms(
  prlTotalMinor: string | null,
  rate: string | null,
  minimum: string | null,
): EconomicTerms {
  return {
    resolvedAt: '2026-11-23T00:00:00.000000Z',
    secondHomeId: null,
    nights: [],
    prlTotal: prlTotalMinor === null ? null : { amountMinor: prlTotalMinor, currency: 'BRL' },
    parameters: {
      ...(rate === null
        ? {}
        : {
            luxchange_fee_rate: {
              parameterId: 'rate',
              value: rate,
              unit: 'fraction' as const,
              currency: null,
            },
          }),
      ...(minimum === null
        ? {}
        : {
            luxchange_fee_minimum: {
              parameterId: 'minimum',
              value: minimum,
              unit: 'money' as const,
              currency: 'BRL' as const,
            },
          }),
    },
    policy: null,
  };
}

describe('Luxchange Fee (`01` §24 v10.8, BR-230–232, TECH-033)', () => {
  it('[BR-230][TECH-082] referência comercial atual: 12% (0.12) do PRL total do período quando supera o mínimo', () => {
    // PRL total de R$ 5.000,00 em 4 noites → 12% = R$ 600,00, acima do mínimo de R$ 120,00.
    expect(luxchangeFee(500_000n, '0.12', 12_000n)).toBe(60_000n);
    expect(quoteLuxchangeFee(terms('500000', '0.12', '12000'))).toEqual({
      prlTotalMinor: 500_000n,
      amountMinor: 60_000n,
      currency: 'BRL',
    });
  });

  it('[BR-230] mínimo por operação, nunca por noite: 12% abaixo do mínimo cobra o mínimo uma única vez', () => {
    // R$ 800,00 no período → 12% = R$ 96,00 < R$ 120,00 → R$ 120,00 (não R$ 120,00 × noites).
    expect(luxchangeFee(80_000n, '0.12', 12_000n)).toBe(12_000n);
    // Exatamente no limite: 12% de R$ 1.000,00 = R$ 120,00.
    expect(luxchangeFee(100_000n, '0.12', 12_000n)).toBe(12_000n);
  });

  it('[TECH-033] HALF_UP uma única vez no valor percentual final, em unidade mínima', () => {
    // 12% de 12.345 = 1.481,4 → 1.481; 12% de 12.346 = 1.481,52 → 1.482; 12,5% de 1.004 = 125,5 → 126.
    expect(luxchangeFee(12_345n, '0.12', 1n)).toBe(1_481n);
    expect(luxchangeFee(12_346n, '0.12', 1n)).toBe(1_482n);
    expect(luxchangeFee(1_004n, '0.125', 1n)).toBe(126n);
    // PRL total do período antes do percentual: 3 noites de 337 = 1.011 → 12% = 121,32 → 121 (por noite daria 3 × 40).
    expect(luxchangeFee(1_011n, '0.12', 1n)).toBe(121n);
  });

  it('[BR-232] o algoritmo continua parametrizado: outros percentuais e mínimos publicados', () => {
    expect(luxchangeFee(500_000n, '0.1', 12_000n)).toBe(50_000n);
    expect(luxchangeFee(500_000n, '0.075', 9_876n)).toBe(37_500n);
    expect(luxchangeFee(500_000n, '0.2', 9_876n)).toBe(100_000n);
    expect(luxchangeFee(10_000n, '0.075', 9_876n)).toBe(9_876n);
    expect(luxchangeFee(500_000n, '1', 9_876n)).toBe(500_000n);
    expect(quoteLuxchangeFee(terms('250000', '0.08', '4321')).amountMinor).toBe(20_000n);
  });

  it('[TECH-001] nenhum default: termos incompletos não calculam Fee', () => {
    expect(() => quoteLuxchangeFee(terms(null, '0.12', '12000'))).toThrow(MissingFeeTermsError);
    expect(() => quoteLuxchangeFee(terms('500000', null, '12000'))).toThrow(MissingFeeTermsError);
    expect(() => quoteLuxchangeFee(terms('500000', '0.12', null))).toThrow(MissingFeeTermsError);
    expect(() => luxchangeFee(500_000n, '0', 12_000n)).toThrow();
    expect(() => luxchangeFee(500_000n, '0.12', 0n)).toThrow();
  });
});
