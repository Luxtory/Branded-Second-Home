import { describe, expect, it } from 'vitest';
import * as interest from '@/features/ownership/domain/interest';
import {
  approxDaysRule,
  codePointLength,
  normalizeText,
} from '@/features/ownership/domain/interest';

describe('interesse — regras de domínio (spec ownership §5, §13)', () => {
  it('[REQ-022] [BR-032] a Home Edition não restringe modalidade: não há regra de modalidade oferecida (F2a removida)', () => {
    expect(interest).not.toHaveProperty('isModalityOffered');
  });

  it('[REQ-025] approx_days obrigatório para Co-Owner e ausente para Owner (BR-060, F2b)', () => {
    expect(approxDaysRule('co_owner', 14)).toBe('ok');
    expect(approxDaysRule('co_owner', null)).toBe('required');
    expect(approxDaysRule('owner', null)).toBe('ok');
    expect(approxDaysRule('owner', 14)).toBe('not_allowed');
  });

  it('texto livre: pontas removidas, espaços internos reduzidos; tamanho em pontos de código', () => {
    expect(normalizeText('  Litoral   norte  de SP ')).toBe('Litoral norte de SP');
    expect(codePointLength('😀😀')).toBe(2);
  });
});
