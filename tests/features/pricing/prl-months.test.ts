import { describe, expect, it } from 'vitest';
import { adjacentMonth, initialMonth, monthIn } from '@/features/pricing/presentation/prl-months';

/** W16 E4 — navegação só por meses selados e mês de referência no fuso da Second Home (TECH-040). */
describe('PRL — meses do calendário', () => {
  const months = ['2026-11', '2026-12', '2027-01', '2027-03', '2028-02'];

  it('[REQ-052] anterior e seguinte pulam meses não selados, inclusive entre exercícios', () => {
    expect(adjacentMonth(months, '2027-01', 1)).toBe('2027-03');
    expect(adjacentMonth(months, '2027-03', -1)).toBe('2027-01');
    expect(adjacentMonth(months, '2027-03', 1)).toBe('2028-02');
    expect(adjacentMonth(months, '2028-02', 1)).toBeNull();
    expect(adjacentMonth(months, '2026-11', -1)).toBeNull();
    // A partir de um mês fora da lista (ex.: o corrente sem selagem), o vizinho selado mais próximo.
    expect(adjacentMonth(months, '2027-02', 1)).toBe('2027-03');
    expect(adjacentMonth(months, '2027-02', -1)).toBe('2027-01');
  });

  it('[TECH-040] o mês corrente é o do fuso da Second Home, não o de UTC, na virada do mês', () => {
    const turn = new Date('2026-12-01T02:30:00Z');
    expect(monthIn(turn, 'UTC')).toBe('2026-12');
    expect(monthIn(turn, 'America/Sao_Paulo')).toBe('2026-11');
    expect(monthIn(turn, 'America/Manaus')).toBe('2026-11');
    expect(monthIn(new Date('2026-11-30T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-12');
  });

  it('[REQ-052] mês inicial: o pedido se selado; senão o corrente; senão o selado mais próximo', () => {
    expect(initialMonth(months, '2027-03', '2026-11')).toBe('2027-03');
    expect(initialMonth(months, '2027-02', '2026-12')).toBe('2026-12');
    expect(initialMonth(months, '', '2027-02')).toBe('2027-03');
    expect(initialMonth(months, '', '2029-01')).toBe('2028-02');
    expect(initialMonth([], '', '2026-11')).toBeNull();
  });
});
