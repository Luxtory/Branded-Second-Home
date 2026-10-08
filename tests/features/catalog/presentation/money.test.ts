import { describe, expect, it } from 'vitest';
import { formatMoney, reaisToMinor } from '@/features/catalog/presentation/money';

// Dinheiro na interface (TECH-033): sem ponto flutuante na leitura nem na exibição.
describe('dinheiro no Admin e na Coleção', () => {
  it('[TECH-033] reais digitados → unidades menores exatas', () => {
    expect(reaisToMinor('4.800.000')).toBe(480_000_000n);
    expect(reaisToMinor('4800000')).toBe(480_000_000n);
    expect(reaisToMinor('R$ 4.800.000,5')).toBe(480_000_050n);
    expect(reaisToMinor('9.999.999.999.999,99')).toBe(999_999_999_999_999n);
    for (const invalid of ['', '4,8,0', '4.80.000', '-10', '1e6', 'abc', '10,999']) {
      expect(reaisToMinor(invalid), invalid).toBeNull();
    }
  });

  it('[TECH-033] unidades menores → R$ em pt-BR, exato e sem centavos quando zero', () => {
    const normalize = (value: string) => value.replace(/\s/g, ' ');
    expect(normalize(formatMoney(480_000_000n, 'BRL'))).toBe('R$ 4.800.000');
    expect(normalize(formatMoney(480_000_050n, 'BRL'))).toBe('R$ 4.800.000,50');
    expect(normalize(formatMoney(999_999_999_999_999n, 'BRL'))).toBe('R$ 9.999.999.999.999,99');
  });
});
