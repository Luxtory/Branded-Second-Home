import { describe, expect, it } from 'vitest';
import {
  approxDaysRule,
  codePointLength,
  isModalityOffered,
  normalizeText,
} from '@/features/ownership/domain/interest';

describe('interesse — regras de domínio (spec ownership §5)', () => {
  it('[REQ-022] com Edition, a modalidade precisa estar entre as que ela oferece (BR-032, F2a)', () => {
    expect(isModalityOffered('owner_and_co_owner', 'owner')).toBe(true);
    expect(isModalityOffered('owner_and_co_owner', 'co_owner')).toBe(true);
    expect(isModalityOffered('owner', 'owner')).toBe(true);
    expect(isModalityOffered('co_owner', 'co_owner')).toBe(true);
    expect(isModalityOffered('owner', 'co_owner')).toBe(false);
    expect(isModalityOffered('co_owner', 'owner')).toBe(false);
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
