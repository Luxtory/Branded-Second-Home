import { describe, expect, it } from 'vitest';
import {
  civilDatesBetween,
  nightRefusal,
  requestedByCategory,
  type SelectionNightFacts,
} from '@/features/calendar/domain/luxtory-selection';

const night = (
  stayDate: string,
  extra: Partial<SelectionNightFacts> = {},
): SelectionNightFacts => ({
  stayDate,
  exerciseYear: 2027,
  season: 'media',
  isLeapDay: false,
  checkinAt: new Date(`${stayDate}T17:00:00Z`),
  ...extra,
});

describe('seleção Luxtory: regras puras (REQ-036, TECH-027, INV-4)', () => {
  const now = new Date('2027-03-01T12:00:00Z');

  it('[REQ-036][TECH-027] noite selecionável: selada, não iniciada e fora do 29/02', () => {
    expect(nightRefusal(undefined, now)).toBe('not_sealed');
    expect(nightRefusal(night('2027-02-28'), now)).toBe('started');
    expect(nightRefusal(night('2027-03-01', { checkinAt: now }), now)).toBe('started');
    expect(nightRefusal(night('2028-02-29', { isLeapDay: true, exerciseYear: 2028 }), now)).toBe(
      'leap_day',
    );
    expect(nightRefusal(night('2027-03-10'), now)).toBeNull();
  });

  it('[INV-4] a seleção conta por exercício e categoria, sem compensar categorias', () => {
    const counts = requestedByCategory([
      night('2027-03-10'),
      night('2027-03-11'),
      night('2027-07-10', { season: 'alta' }),
      night('2028-01-10', { exerciseYear: 2028, season: 'alta' }),
    ]);
    expect(Object.fromEntries(counts)).toEqual({ '2027:media': 2, '2027:alta': 1, '2028:alta': 1 });
  });

  it('[REQ-036] intervalo de datas civis inclusive, atravessando meses e anos', () => {
    expect(civilDatesBetween('2027-12-30', '2028-01-02')).toEqual([
      '2027-12-30',
      '2027-12-31',
      '2028-01-01',
      '2028-01-02',
    ]);
    expect(civilDatesBetween('2027-03-10', '2027-03-10')).toEqual(['2027-03-10']);
    expect(civilDatesBetween('2027-03-11', '2027-03-10')).toEqual([]);
  });
});
