import { describe, expect, it } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import { seasonTiers } from '@/features/pricing/presentation/prl-seasons';

/**
 * W16 C2 — temporadas de apresentação da precificação (decisão do founder de 2026-11-21): Super Alta = janela de
 * Carnaval do PD-003, Alta = janeiro/julho/dezembro, Média/Baixa = o resto. Só leitura: o grupo canônico (`01` §9,
 * REQ-030) continua com duas categorias e os limites 103/262.
 */
const calendar = createCivilCalendar();
const tierOf = seasonTiers();
const daysOf = (year: number) => {
  const days: string[] = [];
  for (let at = Date.UTC(year, 0, 1); new Date(at).getUTCFullYear() === year; at += 86_400_000)
    days.push(new Date(at).toISOString().slice(0, 10));
  return days;
};
const count = (year: number) => {
  const totals = { super_alta: 0, alta: 0, media: 0, canonicalAlta: 0, canonicalMedia: 0 };
  for (const date of daysOf(year)) {
    const { season } = calendar.classify(date);
    totals[tierOf(date, season)] += 1;
    if (season === 'alta') totals.canonicalAlta += 1;
    else totals.canonicalMedia += 1;
  }
  return totals;
};

describe('PRL — temporadas de apresentação (Super Alta · Alta · Média/Baixa)', () => {
  it('[PD-003][TECH-041] exercício completo: 10 Super Alta + 93 Alta = os 103 do grupo canônico; 262 Média/Baixa', () => {
    expect(count(2027)).toEqual({
      super_alta: 10,
      alta: 93,
      media: 262,
      canonicalAlta: 103,
      canonicalMedia: 262,
    });
  });

  it('[PD-003] Carnaval de 2027 em fevereiro: 05/02 a 14/02 são Super Alta; 31/01 Alta; 01/02 e 15/02 Média/Baixa', () => {
    const tier = (date: string) => tierOf(date, calendar.classify(date).season);
    expect(['2027-02-05', '2027-02-09', '2027-02-14'].map(tier)).toEqual([
      'super_alta',
      'super_alta',
      'super_alta',
    ]);
    expect(tier('2027-01-31')).toBe('alta');
    expect(tier('2027-02-01')).toBe('media');
    expect(tier('2027-02-15')).toBe('media');
    expect(tier('2027-07-15')).toBe('alta');
    expect(tier('2027-12-31')).toBe('alta');
  });

  it('[PD-003][BR-090] ano bissexto com o 29/02 dentro da janela: o 29/02 é Média/Baixa e a janela segue em março', () => {
    const tier = (date: string) => tierOf(date, calendar.classify(date).season);
    expect(tier('2028-02-28')).toBe('super_alta');
    expect(tier('2028-02-29')).toBe('media');
    expect(tier('2028-03-06')).toBe('super_alta');
    expect(tier('2028-03-07')).toBe('media');
    expect(count(2028)).toMatchObject({ super_alta: 10, alta: 93, media: 263, canonicalAlta: 103 });
  });

  it('[TECH-041] Carnaval em março (2030): Super Alta fora de janeiro, julho e dezembro', () => {
    const tier = (date: string) => tierOf(date, calendar.classify(date).season);
    expect(tier('2030-02-28')).toBe('media');
    expect(tier('2030-03-01')).toBe('super_alta');
    expect(tier('2030-03-10')).toBe('super_alta');
    expect(tier('2030-03-11')).toBe('media');
  });

  it('[REQ-030] o grupo canônico manda: noite media nunca vira Super Alta, mesmo dentro da janela', () => {
    expect(tierOf('2027-02-06', 'media')).toBe('media');
    expect(tierOf('2027-03-15', 'alta')).toBe('alta');
  });
});
