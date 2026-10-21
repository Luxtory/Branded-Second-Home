import { describe, expect, it } from 'vitest';
import {
  isEmail,
  isPhone,
  normalizeEmail,
  normalizePhone,
} from '@/features/ownership/domain/interest-contact';

// Contato do interesse (spec ownership §14.4.1, §14.15): normalização técnica antes da persistência e do hash.
describe('contato do interesse — normalização', () => {
  it('[REQ-022] telefone em formatos humanos usuais → só + inicial opcional e dígitos, sem inferir DDI', () => {
    expect(normalizePhone('(61) 99999-9999')).toBe('61999999999');
    expect(normalizePhone('+55 61 99999-9999')).toBe('+5561999999999');
    expect(normalizePhone('61.9999.9999')).toBe('6199999999');
    expect(normalizePhone('  +1 (415) 555-0100 ')).toBe('+14155550100');
  });

  it('[REQ-022] telefone válido só com 8–15 dígitos e + apenas no início; número local nunca vira +55', () => {
    expect(isPhone(normalizePhone('9999-9999'))).toBe(true);
    expect(normalizePhone('9999-9999')).toBe('99999999');
    expect(isPhone(normalizePhone('999-9999'))).toBe(false);
    expect(isPhone(normalizePhone('+1234567890123456'))).toBe(false);
    expect(isPhone(normalizePhone('55+61999999999'))).toBe(false);
    expect(isPhone(normalizePhone('61 9999A-9999'))).toBe(false);
    expect(isPhone(normalizePhone('++5561999999999'))).toBe(false);
  });

  it('[REQ-022] e-mail: pontas sem espaço, domínio em minúsculas, parte local preservada; formato local@domínio', () => {
    expect(normalizeEmail('  Maria.Silva@Example.COM ')).toBe('Maria.Silva@example.com');
    expect(normalizeEmail('a+b@SUB.Example.org')).toBe('a+b@sub.example.org');
    expect(isEmail('maria@example.com')).toBe(true);
    for (const invalid of [
      'maria',
      'maria@',
      '@example.com',
      'maria@example',
      'a b@example.com',
      'a@b@c.com',
    ]) {
      expect(isEmail(invalid), invalid).toBe(false);
    }
  });
});
