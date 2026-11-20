import { describe, expect, it } from 'vitest';
import { creditsForPrl, luxchangeFee } from '@/features/pricing/domain/economic';
import {
  MAX_AMOUNT_MINOR,
  MoneyRangeError,
  minorToDecimal,
  parseMinorAmount,
  parseMoneyInput,
  sumMinor,
} from '@/features/pricing/domain/money';
import { nightStatus, nightsOutsideKind, type PrlVersion } from '@/features/pricing/domain/prl';

/**
 * W16 E3 — valores exatos (TECH-033; spec pricing §5). Os parâmetros de teste são deliberadamente diferentes dos valores
 * iniciais canônicos: um padrão embutido no código faria estes testes falharem.
 */

/** Referência independente: produto exato de inteiro × decimal canônico, dividido por 10^shift, sem zeros à direita. */
function exactProduct(integer: bigint, decimal: string, shift: number): string {
  const [units, fraction = ''] = decimal.split('.');
  const scaled = integer * BigInt(`${units}${fraction}`);
  const scale = shift + fraction.length;
  const text = scaled.toString().padStart(scale + 1, '0');
  const head = text.slice(0, text.length - scale);
  const tail = text.slice(text.length - scale).replace(/0+$/, '');
  return tail === '' ? head : `${head}.${tail}`;
}

describe('pricing — dinheiro em unidade mínima (TECH-033)', () => {
  it('[TECH-033] entrada em reais (pt-BR) vira unidade mínima exata; precisão excessiva ou formato inválido é recusado, nunca arredondado', () => {
    expect(parseMoneyInput('1.234,56')).toBe(123456n);
    expect(parseMoneyInput('1234,56')).toBe(123456n);
    expect(parseMoneyInput(' 100 ')).toBe(10000n);
    expect(parseMoneyInput('100,5')).toBe(10050n);
    expect(parseMoneyInput('0,01')).toBe(1n);
    expect(parseMoneyInput('9.999.999.999.999,99')).toBe(MAX_AMOUNT_MINOR);
    for (const invalid of [
      '0',
      '0,00',
      '-1',
      '1,234',
      '12,3456',
      '1.23,45',
      '1,2,3',
      '1e3',
      'R$ 10',
      '',
      '10.000.000.000.000,00',
    ])
      expect(parseMoneyInput(invalid), invalid).toBeNull();
  });

  it('[TECH-033] valor canônico de JSON/banco é string de inteiro positivo; o resto é recusado', () => {
    expect(parseMinorAmount('123')).toBe(123n);
    expect(parseMinorAmount('999999999999999')).toBe(MAX_AMOUNT_MINOR);
    for (const invalid of ['0', '01', '1.5', '-1', '1000000000000000', ' 1', '1e3'])
      expect(parseMinorAmount(invalid), invalid).toBeNull();
    expect(minorToDecimal(123456n)).toBe('1234.56');
    expect(minorToDecimal(5n)).toBe('0.05');
    expect(minorToDecimal(0n)).toBe('0.00');
  });

  it('[TECH-033][REQ-052] a soma de 366 noites no limite técnico passa de Number.MAX_SAFE_INTEGER e continua exata', () => {
    const nights = Array.from({ length: 366 }, () => MAX_AMOUNT_MINOR);
    const total = sumMinor(nights);
    expect(total).toBe(366n * MAX_AMOUNT_MINOR);
    expect(total > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(total.toString()).toBe('365999999999999634');
    expect(minorToDecimal(total)).toBe('3659999999999996.34');
  });
});

describe('pricing — Créditos do PRL (01 §20, TECH-033)', () => {
  it('[TECH-033] centavos viram reais antes do multiplicador: R$ 100,00 × 7 = 700 Créditos, nunca 70.000', () => {
    expect(creditsForPrl(10_000n, 'BRL', '7')).toBe('700');
    expect(creditsForPrl(10_000n, 'BRL', '7.25')).toBe('725');
    expect(creditsForPrl(1n, 'BRL', '0.5')).toBe('0.005');
  });

  it('[TECH-033] Créditos são decimais exatos, sem arredondamento, inclusive no limite técnico de 366 noites', () => {
    expect(creditsForPrl(123_457n, 'BRL', '1.333333')).toBe(exactProduct(123_457n, '1.333333', 2));
    const total = 366n * MAX_AMOUNT_MINOR;
    expect(creditsForPrl(total, 'BRL', '999999999.999999')).toBe(
      exactProduct(total, '999999999.999999', 2),
    );
    expect(creditsForPrl(total, 'BRL', '999999999.999999')).not.toContain('e');
  });

  it('[TECH-001] multiplicador ausente da forma canônica ou PRL não positivo é recusado', () => {
    for (const multiplier of ['0', '-1', '1.50', '01', '1e3', ''])
      expect(() => creditsForPrl(10_000n, 'BRL', multiplier), multiplier).toThrow(MoneyRangeError);
    expect(() => creditsForPrl(0n, 'BRL', '7')).toThrow(MoneyRangeError);
  });
});

describe('pricing — Luxchange Fee (01 §24, TECH-033)', () => {
  it('[TECH-033] HALF_UP uma única vez, no valor final do período — nunca por noite', () => {
    // Por noite: 6 × 0,25 = 1,5 → 2 em cada noite = 4. No período: 12 × 0,25 = 3.
    expect(luxchangeFee(sumMinor([6n, 6n]), '0.25', 1n)).toBe(3n);
    expect(luxchangeFee(12_345n, '0.08', 1n)).toBe(988n);
    // 2,5 → 3 (HALF_UP), não 2 (arredondamento bancário).
    expect(luxchangeFee(10n, '0.25', 1n)).toBe(3n);
    expect(luxchangeFee(999n, '1', 1n)).toBe(999n);
  });

  it('[TECH-033] o mínimo vigente prevalece quando maior que o percentual', () => {
    expect(luxchangeFee(12_345n, '0.08', 987n)).toBe(988n);
    expect(luxchangeFee(12_345n, '0.08', 989n)).toBe(989n);
    expect(luxchangeFee(1n, '0.000001', 4_321n)).toBe(4_321n);
  });

  it('[TECH-033] Fee exato no limite técnico de 366 noites', () => {
    const total = 366n * MAX_AMOUNT_MINOR;
    expect(luxchangeFee(total, '0.000001', 1n)).toBe(366_000_000_000n);
    expect(luxchangeFee(total, '1', 1n)).toBe(total);
  });

  it('[TECH-001] percentual fora de (0, 1], mínimo ou PRL não positivos são recusados', () => {
    for (const rate of ['0', '1.5', '1.0', '0.10', '2', ''])
      expect(() => luxchangeFee(1_000n, rate, 1n), rate).toThrow(MoneyRangeError);
    expect(() => luxchangeFee(1_000n, '0.08', 0n)).toThrow(MoneyRangeError);
    expect(() => luxchangeFee(0n, '0.08', 1n)).toThrow(MoneyRangeError);
  });
});

describe('pricing — estado do PRL por noite (REQ-052)', () => {
  const version = (id: string, from: string): PrlVersion => ({
    id,
    stayDate: '2027-04-01',
    amountMinor: 1n,
    currency: 'BRL',
    effectiveFrom: new Date(from),
    effectiveTo: null,
    kind: 'initial',
    authority: 'admin',
    authorizationRef: 'Ata',
    createdAt: new Date(from),
  });

  it('[REQ-052] ausente, vigente e agendado no instante, com a mesma regra de app.prl_at', () => {
    const at = new Date('2026-12-01T12:00:00Z');
    expect(nightStatus([], at)).toEqual({ inForce: null, scheduled: [] });
    const v1 = version('v1', '2026-11-01T00:00:00Z');
    const v2 = version('v2', '2026-12-01T12:00:00Z');
    const v3 = version('v3', '2027-01-01T00:00:00Z');
    expect(nightStatus([v1, v2, v3], at)).toEqual({ inForce: v2, scheduled: [v3] });
    expect(nightStatus([v3], at)).toEqual({ inForce: null, scheduled: [v3] });
  });

  it('[REQ-013] o PRL inicial só cabe em noite sem PRL; a alteração, só em noite publicada', () => {
    const published = new Set(['2027-04-01']);
    expect(nightsOutsideKind('initial', ['2027-04-01', '2027-04-02'], published)).toEqual([
      '2027-04-01',
    ]);
    expect(nightsOutsideKind('change', ['2027-04-01', '2027-04-02'], published)).toEqual([
      '2027-04-02',
    ]);
  });
});
