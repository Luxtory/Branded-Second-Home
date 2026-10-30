import { describe, expect, it } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import { ExerciseBeforeOperationError } from '@/features/calendar/domain/civil-calendar';

const calendar = createCivilCalendar();
const SAO_PAULO = 'America/Sao_Paulo';

function counts(year: number, operationStartDate = `${year}-01-01`) {
  const nights = calendar.exerciseNights({
    exerciseYear: year,
    operationStartDate,
    timezone: SAO_PAULO,
  });
  return {
    nights,
    alta: nights.filter((night) => night.season === 'alta').length,
    media: nights.filter((night) => night.season === 'media' && !night.isLeapDay).length,
    leap: nights.filter((night) => night.isLeapDay),
  };
}

describe('selagem do exercício (W10) [TECH-041] [TECH-110] [ADR-003]', () => {
  it('[TECH-041] exercício completo: 103 Alta/Super Alta + 262 Média/Baixa, sem 29/02 em ano comum', () => {
    const { nights, alta, media, leap } = counts(2027);
    expect(nights).toHaveLength(365);
    expect([alta, media, leap.length]).toEqual([103, 262, 0]);
    expect(nights[0]?.stayDate).toBe('2027-01-01');
    expect(nights.at(-1)?.stayDate).toBe('2027-12-31');
  });

  it('[TECH-041] ano bissexto: 103 + 262 + 29/02 Média/Baixa extraordinário; 2100 não é bissexto', () => {
    const leapYear = counts(2028);
    expect(leapYear.nights).toHaveLength(366);
    expect([leapYear.alta, leapYear.media]).toEqual([103, 262]);
    expect(leapYear.leap).toEqual([
      expect.objectContaining({ stayDate: '2028-02-29', season: 'media', isLeapDay: true }),
    ]);
    const centennial = counts(2100);
    expect([centennial.nights.length, centennial.alta, centennial.media]).toEqual([365, 103, 262]);
  });

  it('[TECH-041] exercício parcial: exatamente da data-base a 31/12, cada noite com a classificação canônica', () => {
    const { nights } = counts(2027, '2027-03-01');
    expect(nights).toHaveLength(306);
    expect(nights[0]?.stayDate).toBe('2027-03-01');
    expect(nights.at(-1)?.stayDate).toBe('2027-12-31');
    for (const night of nights) {
      expect({ season: night.season, isLeapDay: night.isLeapDay }).toEqual(
        calendar.classify(night.stayDate),
      );
    }
    // O exercício seguinte à data-base é completo; um anterior não existe.
    expect(counts(2028, '2027-03-01').nights).toHaveLength(366);
    expect(() => counts(2026, '2027-03-01')).toThrow(ExerciseBeforeOperationError);
  });

  it('[EC-3] Carnaval que começaria em janeiro começa em 01/02 e entra inteiro na selagem', () => {
    const nights = calendar.exerciseNights({
      exerciseYear: 1913,
      operationStartDate: '1913-01-01',
      timezone: SAO_PAULO,
    });
    const february = nights.filter((night) => night.stayDate.startsWith('1913-02'));
    expect(
      february.filter((night) => night.season === 'alta').map((night) => night.stayDate),
    ).toEqual(calendar.carnivalDates(1913));
  });

  it.each([
    // [fuso, noite, check-in UTC, check-out UTC]
    [SAO_PAULO, '2027-01-15', '2027-01-15T17:00:00.000Z', '2027-01-16T13:00:00.000Z'],
    // Noite que atravessa o início do horário de verão: check-in em EST, check-out em EDT.
    ['America/New_York', '2027-03-13', '2027-03-13T19:00:00.000Z', '2027-03-14T14:00:00.000Z'],
    ['Europe/Lisbon', '2027-07-01', '2027-07-01T13:00:00.000Z', '2027-07-02T09:00:00.000Z'],
    ['Asia/Kathmandu', '2027-01-15', '2027-01-15T08:15:00.000Z', '2027-01-16T04:15:00.000Z'],
    ['Pacific/Chatham', '2027-01-15', '2027-01-15T00:15:00.000Z', '2027-01-15T20:15:00.000Z'],
    ['Australia/Lord_Howe', '2027-01-15', '2027-01-15T03:00:00.000Z', '2027-01-15T23:00:00.000Z'],
  ])(
    '[TECH-110] check-in 14:00 e check-out 10:00 locais em %s convertidos em UTC',
    (zone, night, checkIn, checkOut) => {
      expect(calendar.checkInAt(night, zone).toISOString()).toBe(checkIn);
      expect(calendar.checkOutAt(night, zone).toISOString()).toBe(checkOut);
      const sealed = calendar.exerciseNights({
        exerciseYear: Number(night.slice(0, 4)),
        operationStartDate: night,
        timezone: zone,
      });
      expect(sealed[0]?.checkInAt.toISOString()).toBe(checkIn);
    },
  );

  it('[TECH-110] hora local inexistente falha fechada, sem deslocar o check-in', () => {
    // Samoa pulou o dia 30/12/2011 inteiro: não existe 14:00 local nessa data.
    expect(() => calendar.checkInAt('2011-12-30', 'Pacific/Apia')).toThrow(RangeError);
    expect(() =>
      calendar.exerciseNights({
        exerciseYear: 2011,
        operationStartDate: '2011-12-01',
        timezone: 'Pacific/Apia',
      }),
    ).toThrow(RangeError);
  });

  it('[TECH-040] fuso e datas inválidos são recusados', () => {
    expect(() => calendar.checkInAt('2027-01-15', 'Mars/Olympus')).toThrow(RangeError);
    expect(() => calendar.checkOutAt('2027-02-30', SAO_PAULO)).toThrow(RangeError);
    expect(() =>
      calendar.exerciseNights({
        exerciseYear: 0,
        operationStartDate: '2027-01-01',
        timezone: SAO_PAULO,
      }),
    ).toThrow(RangeError);
  });
});
