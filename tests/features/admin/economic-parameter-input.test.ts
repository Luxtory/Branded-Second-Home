import { describe, expect, it } from 'vitest';
import {
  displayValue,
  toCanonicalValue,
} from '@/features/admin/presentation/economic-parameter-input';

const units = { months: (n: string) => `${n} meses`, hours: (n: string) => `${n} horas` };

/** W16 E4 — formato da tela ↔ valor canônico dos parâmetros econômicos (spec admin §14; TECH-033), sem `number`. */
describe('parâmetros econômicos — conversão exata da tela', () => {
  it('[TECH-033] percentual vira fração canônica deslocando a vírgula em texto; fora do formato é recusado', () => {
    expect(toCanonicalValue('luxchange_fee_rate', '8')).toBe('0.08');
    expect(toCanonicalValue('luxchange_fee_rate', '12,5')).toBe('0.125');
    expect(toCanonicalValue('luxchange_fee_rate', '0,0001')).toBe('0.000001');
    expect(toCanonicalValue('luxchange_fee_rate', '100')).toBe('1');
    for (const invalid of ['0', '0,0000', '101', '100,01', '8,12345', '8.5', '-1', ''])
      expect(toCanonicalValue('luxchange_fee_rate', invalid), invalid).toBeNull();
  });

  it('[TECH-033] dinheiro em reais vira unidade mínima; multiplicador e inteiros ficam canônicos', () => {
    expect(toCanonicalValue('luxchange_fee_minimum', '43,21')).toBe('4321');
    expect(toCanonicalValue('membership_base_annual_price', '1.234,56')).toBe('123456');
    expect(toCanonicalValue('luxchange_fee_minimum', '1,234')).toBeNull();
    expect(toCanonicalValue('credit_multiplier', '7,250')).toBe('7.25');
    expect(toCanonicalValue('credit_multiplier', '0,5')).toBe('0.5');
    expect(toCanonicalValue('credit_multiplier', '0')).toBeNull();
    expect(toCanonicalValue('credit_multiplier', '1,1234567')).toBeNull();
    expect(toCanonicalValue('credit_validity_months', '13')).toBe('13');
    expect(toCanonicalValue('request_deadline_hours', '0')).toBeNull();
    expect(toCanonicalValue('request_deadline_hours', '1,5')).toBeNull();
  });

  it('[TECH-033] leitura distingue dinheiro, percentual, multiplicador e prazos', () => {
    expect(displayValue('luxchange_fee_minimum', '4321', units)).toMatch(/^R\$\s43,21$/);
    expect(displayValue('luxchange_fee_rate', '0.125', units)).toMatch(/^12,5\s?%$/);
    expect(displayValue('credit_multiplier', '7.25', units)).toBe('7,25');
    expect(displayValue('credit_validity_months', '13', units)).toBe('13 meses');
    expect(displayValue('request_deadline_hours', '36', units)).toBe('36 horas');
    expect(displayValue('membership_base_annual_price', '999999999999999', units)).toMatch(
      /^R\$\s9\.999\.999\.999\.999,99$/,
    );
  });
});
