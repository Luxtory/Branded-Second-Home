import { describe, expect, it } from 'vitest';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { stakeWindowOpensAt } from '@/features/calendar/domain/use-window';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';

const calendar = createUseRightCalendar(temporalCivilTime);
const facts = {
  operationStartDate: '2027-01-01',
  formalizedAt: new Date('2026-11-01T15:00:00Z'),
  timezone: 'America/Sao_Paulo',
  drawn: [
    { stakeId: 'a', position: 1 },
    { stakeId: 'b', position: 2 },
  ],
};

describe('abertura da janela da Ação (TECH-042, W12)', () => {
  it('[TECH-042] posição 1 abre na base; a 2, 7 dias civis depois; no exercício seguinte a rotação avança (BR-101)', () => {
    expect(stakeWindowOpensAt(calendar, facts, 'a', 2027, false)).toEqual(
      new Date('2026-11-01T15:00:00Z'),
    );
    expect(stakeWindowOpensAt(calendar, facts, 'b', 2027, false)).toEqual(
      new Date('2026-11-08T15:00:00Z'),
    );
    // 2028: base 15/09/2027 00:00 local; `b` passa à posição 1 e `a` à 2.
    expect(stakeWindowOpensAt(calendar, facts, 'b', 2028, false)).toEqual(
      new Date('2027-09-15T03:00:00Z'),
    );
    expect(stakeWindowOpensAt(calendar, facts, 'a', 2028, false)).toEqual(
      new Date('2027-09-22T03:00:00Z'),
    );
  });

  it('[TECH-042][PD-004] o 29/02 abre na base, para qualquer posição', () => {
    expect(stakeWindowOpensAt(calendar, facts, 'a', 2028, true)).toEqual(
      new Date('2027-09-15T03:00:00Z'),
    );
  });

  it('falha fechada: sem sorteio revelado, Ação fora dele, exercício anterior ao primeiro ou horário local rejeitado', () => {
    expect(stakeWindowOpensAt(calendar, { ...facts, drawn: null }, 'a', 2027, false)).toBeNull();
    expect(stakeWindowOpensAt(calendar, facts, 'z', 2027, false)).toBeNull();
    expect(stakeWindowOpensAt(calendar, facts, 'a', 2026, false)).toBeNull();
    // Fuso com horário de verão: em São Paulo, 04/11/2018 00:00 não existiu. Com 8 Ações, a posição 8 de 2019 abre
    // 49 dias civis após a base 15/09/2018 — 03/11/2018, que existe; a meia-noite seguinte seria rejeitada (no banco,
    // a mesma regra devolve NULL: equivalência no teste db).
    const many = {
      ...facts,
      operationStartDate: '2018-01-01',
      formalizedAt: new Date('2017-01-01T00:00:00Z'),
      drawn: Array.from({ length: 8 }, (_, i) => ({ stakeId: `s${i + 1}`, position: i + 1 })),
    };
    expect(stakeWindowOpensAt(calendar, many, 's1', 2019, false)).toEqual(
      new Date('2018-11-03T03:00:00Z'),
    );
    expect(() =>
      temporalCivilTime.startOfDayEpochMilliseconds('2018-11-04', 'America/Sao_Paulo'),
    ).toThrow(RangeError);
  });
});
