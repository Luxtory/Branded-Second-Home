import { describe, expect, it } from 'vitest';
import {
  CreditQuantityError,
  allocateFefo,
  canonicalQuantity,
  instantMicros,
  isCreditQuantity,
  sumQuantities,
} from '@/features/credits/domain/credit';

const lot = (id: string, available: string) => ({
  id,
  available,
  expiresAt: '2030-01-01T00:00:00.000000Z',
  originatedAt: '2028-01-01T00:00:00.000000Z',
});

describe('Créditos — quantidades exatas (TECH-033, BR-190)', () => {
  it.each(['1', '0.5', '12345.678901234567', '999999999999999'])('aceita %s', (value) => {
    expect(isCreditQuantity(value)).toBe(true);
  });

  it.each(['0', '-1', '01', '1.50', '1e3', '1,5', '', ' 1', '1234567890123456'])(
    'recusa %s',
    (value) => {
      expect(isCreditQuantity(value)).toBe(false);
    },
  );

  it('soma e normaliza sem arredondar', () => {
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.3');
    expect(canonicalQuantity('12.50')).toBe('12.5');
    expect(sumQuantities([])).toBe('0');
  });
});

describe('FEFO (PD-008, TECH-071)', () => {
  it('consome na ordem recebida, cada lote até o disponível', () => {
    expect(allocateFefo([lot('a', '3'), lot('b', '0'), lot('c', '10')], '5.5')).toEqual([
      { lotId: 'a', quantity: '3' },
      { lotId: 'c', quantity: '2.5' },
    ]);
  });

  it('para no primeiro lote que basta', () => {
    expect(allocateFefo([lot('a', '10'), lot('b', '10')], '10')).toEqual([
      { lotId: 'a', quantity: '10' },
    ]);
  });

  it('saldo insuficiente → null; quantidade inválida → erro', () => {
    expect(allocateFefo([lot('a', '1')], '1.000001')).toBeNull();
    expect(() => allocateFefo([lot('a', '1')], '0')).toThrow(CreditQuantityError);
  });
});

describe('instantes em microssegundos', () => {
  it('compara sem perder a fração do PostgreSQL', () => {
    expect(
      instantMicros('2028-02-29T00:00:00.000001Z') - instantMicros('2028-02-29T00:00:00Z'),
    ).toBe(1n);
    expect(instantMicros('2028-02-29T00:00:00.5Z')).toBe(
      instantMicros('2028-02-29T00:00:00.500000Z'),
    );
    expect(() => instantMicros('2028-02-29')).toThrow(RangeError);
  });
});
