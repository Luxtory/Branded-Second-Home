import { describe, expect, it } from 'vitest';
import {
  basesForModality,
  canApproveMedia,
  canWithdrawMedia,
  isCurrentValue,
  supportsFeatured,
  periodsOverlap,
  sameLabel,
  termSlug,
} from '@/features/catalog/domain/collection';

// Coleção (docs/specs/catalog.md §13.12): regras puras de vocabulário, capa e valor de referência.
const at = (iso: string) => new Date(iso);

describe('Coleção — domínio', () => {
  it('slug do termo: sem acento, minúsculo, palavras com hífen; estável para a URL', () => {
    expect(termSlug('Bem-estar & Natureza')).toBe('bem-estar-natureza');
    expect(termSlug('  Contemporâneo Tropical ')).toBe('contemporaneo-tropical');
    expect(termSlug('Pé na areia')).toBe('pe-na-areia');
    expect(termSlug('!!!')).toBe('');
    expect(sameLabel('Natureza', 'NATUREZA')).toBe(true);
  });

  it('[BR-032] [REQ-103] bases do valor pela modalidade: Owner → a Second Home, Co-Owner → a Ação, ambas lado a lado', () => {
    expect(basesForModality('owner')).toEqual(['owner']);
    expect(basesForModality('co_owner')).toEqual(['acao']);
    expect(basesForModality('owner_and_co_owner')).toEqual(['owner', 'acao']);
  });

  it('[BR-031] vigência semiaberta: começa no início, termina antes do fim; fim nulo = em aberto', () => {
    const value = { validFrom: at('2026-10-01T00:00:00Z'), validUntil: at('2026-11-01T00:00:00Z') };
    expect(isCurrentValue(value, at('2026-09-30T23:59:59Z'))).toBe(false);
    expect(isCurrentValue(value, at('2026-10-01T00:00:00Z'))).toBe(true);
    expect(isCurrentValue(value, at('2026-11-01T00:00:00Z'))).toBe(false);
    expect(isCurrentValue({ ...value, validUntil: null }, at('2030-01-01T00:00:00Z'))).toBe(true);
  });

  it('[BR-031] vigências encostadas não se sobrepõem; em aberto se sobrepõe a qualquer posterior', () => {
    const october = {
      validFrom: at('2026-10-01T00:00:00Z'),
      validUntil: at('2026-11-01T00:00:00Z'),
    };
    const november = { validFrom: at('2026-11-01T00:00:00Z'), validUntil: null };
    const midOctober = { validFrom: at('2026-10-15T00:00:00Z'), validUntil: null };
    expect(periodsOverlap(october, november)).toBe(false);
    expect(periodsOverlap(october, midOctober)).toBe(true);
    expect(periodsOverlap(november, midOctober)).toBe(true);
  });

  it('elegibilidade por quadro: o destaque pede uma largura de exibição ≥ 1440 × 960 (DPR 2), o card não', () => {
    expect(supportsFeatured([{ width: 1600, height: 1200 }])).toBe(true);
    expect(supportsFeatured([{ width: 1440, height: 960 }])).toBe(true);
    expect(supportsFeatured([{ width: 1440, height: 810 }])).toBe(false);
    expect(supportsFeatured([{ width: 1200, height: 1600 }])).toBe(false);
    expect(supportsFeatured([])).toBe(false);
  });

  it('capa: só pendente é aprovada; pendente ou aprovada é retirada, uma vez', () => {
    expect(canApproveMedia({ state: 'pending' })).toBe(true);
    expect(canApproveMedia({ state: 'approved' })).toBe(false);
    expect(canWithdrawMedia({ state: 'approved' })).toBe(true);
    expect(canWithdrawMedia({ state: 'withdrawn' })).toBe(false);
  });
});
