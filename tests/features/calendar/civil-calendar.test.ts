import { describe, expect, it } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';

const calendar = createCivilCalendar();

describe('civil calendar [PD-003] [EC-3] [TECH-040] [TECH-041] [TECH-043] [TECH-110]', () => {
  it.each([
    [
      1913,
      [
        '1913-02-01',
        '1913-02-02',
        '1913-02-03',
        '1913-02-04',
        '1913-02-05',
        '1913-02-06',
        '1913-02-07',
        '1913-02-08',
        '1913-02-09',
        '1913-02-10',
      ],
    ],
    [
      2000,
      [
        '2000-03-03',
        '2000-03-04',
        '2000-03-05',
        '2000-03-06',
        '2000-03-07',
        '2000-03-08',
        '2000-03-09',
        '2000-03-10',
        '2000-03-11',
        '2000-03-12',
      ],
    ],
    [
      2020,
      [
        '2020-02-21',
        '2020-02-22',
        '2020-02-23',
        '2020-02-24',
        '2020-02-25',
        '2020-02-26',
        '2020-02-27',
        '2020-02-28',
        '2020-03-01',
        '2020-03-02',
      ],
    ],
    [
      2024,
      [
        '2024-02-09',
        '2024-02-10',
        '2024-02-11',
        '2024-02-12',
        '2024-02-13',
        '2024-02-14',
        '2024-02-15',
        '2024-02-16',
        '2024-02-17',
        '2024-02-18',
      ],
    ],
    [
      2100,
      [
        '2100-02-05',
        '2100-02-06',
        '2100-02-07',
        '2100-02-08',
        '2100-02-09',
        '2100-02-10',
        '2100-02-11',
        '2100-02-12',
        '2100-02-13',
        '2100-02-14',
      ],
    ],
  ])('selects ten additional Carnival dates in %i [PD-003]', (year, dates) => {
    expect(calendar.carnivalDates(year)).toEqual(dates);
  });

  it.each([
    ['2024-01-01', 'alta', false],
    ['2024-07-10', 'alta', false],
    ['2024-12-31', 'alta', false],
    ['2024-02-08', 'media', false],
    ['2024-02-09', 'alta', false],
    ['2024-02-18', 'alta', false],
    ['2024-02-19', 'media', false],
    ['2020-02-29', 'media', true],
    ['2020-03-01', 'alta', false],
    ['2020-03-02', 'alta', false],
    ['2020-03-03', 'media', false],
  ])('classifies %s with an extraordinary leap flag', (date, season, isLeapDay) => {
    expect(calendar.classify(date)).toEqual({ season, isLeapDay });
  });

  it.each([
    ['1900-01-01', 1900, false],
    ['2000-02-29', 2000, true],
    ['2100-12-31', 2100, true],
  ])('derives exercise and partiality from %s', (date, year, partial) => {
    expect(calendar.exerciseYear(date)).toBe(year);
    expect(calendar.isPartialExercise(date)).toBe(partial);
  });

  it.each([
    '',
    '2024-2-01',
    '2024-02-30',
    '1900-02-29',
    '2100-02-29',
    '2024-04-31',
    '2024-00-01',
    '2024-13-01',
    '2024-01-00',
    '0000-01-01',
    '2024-01-01T00:00:00Z',
    ' 2024-01-01',
  ])('rejects invalid civil date %j at every boundary', (date) => {
    expect(() => calendar.classify(date)).toThrow(RangeError);
    expect(() => calendar.exerciseYear(date)).toThrow(RangeError);
    expect(() => calendar.isPartialExercise(date)).toThrow(RangeError);
    expect(() =>
      calendar.futureCapacity({
        operationStartDate: date,
        timezone: 'UTC',
        now: new Date('2024-01-01T00:00:00Z'),
      }),
    ).toThrow(RangeError);
  });

  it.each([NaN, Infinity, 0, -1, 2024.5, 10000])('rejects invalid exercise year %s', (year) => {
    expect(() => calendar.carnivalDates(year)).toThrow(RangeError);
  });

  it.each(['UTC', 'America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
    'accepts IANA timezone %s',
    (timezone) => {
      expect(() => calendar.validateTimezone(timezone)).not.toThrow();
    },
  );

  it.each(['', 'Mars/Olympus', '+03:00', '-04:00', 'Z', ' UTC', 'America/Sao_Paulo '])(
    'rejects invalid or offset timezone %j',
    (timezone) => {
      expect(() => calendar.validateTimezone(timezone)).toThrow(RangeError);
      expect(() => calendar.localDate(new Date('2024-01-01T00:00:00Z'), timezone)).toThrow(
        RangeError,
      );
      expect(() =>
        calendar.futureCapacity({
          operationStartDate: '2024-01-01',
          timezone,
          now: new Date('2024-01-01T00:00:00Z'),
        }),
      ).toThrow(RangeError);
    },
  );

  it.each([
    ['2024-01-01T01:00:00Z', 'America/Sao_Paulo', '2023-12-31'],
    ['2024-01-01T01:00:00Z', 'UTC', '2024-01-01'],
    ['2023-12-31T12:00:00Z', 'Pacific/Kiritimati', '2024-01-01'],
    ['2024-03-01T01:00:00Z', 'America/New_York', '2024-02-29'],
    ['2024-02-29T23:00:00Z', 'Asia/Tokyo', '2024-03-01'],
  ])('converts %s in %s to civil date', (instant, timezone, date) => {
    expect(calendar.localDate(new Date(instant), timezone)).toBe(date);
  });

  it('rejects invalid instants without consulting the process clock', () => {
    expect(() => calendar.localDate(new Date(NaN), 'UTC')).toThrow(RangeError);
    expect(() =>
      calendar.futureCapacity({
        operationStartDate: '2024-01-01',
        timezone: 'UTC',
        now: new Date(NaN),
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ['America/Sao_Paulo', '2024-12-31T16:59:59.999Z', 1],
    ['America/Sao_Paulo', '2024-12-31T17:00:00.000Z', 0],
    ['America/Sao_Paulo', '2024-12-31T17:00:00.001Z', 0],
    ['Asia/Tokyo', '2024-12-31T04:59:59.999Z', 1],
    ['Asia/Tokyo', '2024-12-31T05:00:00.000Z', 0],
    ['America/New_York', '2024-12-31T18:59:59.999Z', 1],
    ['America/New_York', '2024-12-31T19:00:00.000Z', 0],
  ])('counts strictly future local check-ins (%s, %s)', (timezone, now, alta) => {
    expect(
      calendar.futureCapacity({ operationStartDate: '2024-12-31', timezone, now: new Date(now) }),
    ).toEqual({ exerciseYear: 2024, alta, media: 0 });
  });

  it.each([
    ['2024-12-01', '2024-01-01T00:00:00Z', 31, 0],
    ['2024-06-30', '2024-01-01T00:00:00Z', 62, 123],
    ['2024-02-29', '2024-02-28T00:00:00Z', 62, 244],
    ['2024-01-01', '2024-12-31T14:00:00Z', 0, 0],
    ['2024-01-01', '2025-01-01T00:00:00Z', 0, 0],
  ])(
    'restricts first-exercise capacity from base %s and clock %s',
    (operationStartDate, now, alta, media) => {
      expect(
        calendar.futureCapacity({ operationStartDate, timezone: 'UTC', now: new Date(now) }),
      ).toEqual({ exerciseYear: 2024, alta, media });
    },
  );

  it('uses civil time across the exercise boundary', () => {
    expect(
      calendar.futureCapacity({
        operationStartDate: '2024-12-31',
        timezone: 'Pacific/Kiritimati',
        now: new Date('2024-12-31T00:00:00Z'),
      }),
    ).toEqual({ exerciseYear: 2024, alta: 0, media: 0 });
  });

  it.each([
    ['2024-11-02T17:59:59.999Z', 29],
    ['2024-11-02T18:00:00.000Z', 28],
    ['2024-11-03T18:59:59.999Z', 28],
    ['2024-11-03T19:00:00.000Z', 27],
  ])('keeps 14h local across the New York DST transition at %s', (now, media) => {
    expect(
      calendar.futureCapacity({
        operationStartDate: '2024-01-01',
        timezone: 'America/New_York',
        now: new Date(now),
      }),
    ).toEqual({ exerciseYear: 2024, alta: 31, media });
  });

  it.each([
    ['2024-02-28T13:59:59.999Z', 245],
    ['2024-02-28T14:00:00.000Z', 244],
  ])('excludes the extraordinary leap day after the current media night at %s', (now, media) => {
    expect(
      calendar.futureCapacity({
        operationStartDate: '2024-01-01',
        timezone: 'UTC',
        now: new Date(now),
      }),
    ).toEqual({ exerciseYear: 2024, alta: 62, media });
  });

  it.each(Array.from({ length: 201 }, (_, index) => 1900 + index))(
    'keeps 103/262 ordinary nights and separate leap day in %i [TECH-110]',
    (year) => {
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const counts = { alta: 0, media: 0, leap: 0 };
      for (
        let epoch = Date.UTC(year, 0, 1);
        epoch < Date.UTC(year + 1, 0, 1);
        epoch += 86_400_000
      ) {
        const classification = calendar.classify(new Date(epoch).toISOString().slice(0, 10));
        if (classification.isLeapDay) counts.leap += 1;
        else counts[classification.season] += 1;
      }
      expect(counts).toEqual({ alta: 103, media: 262, leap: leap ? 1 : 0 });
      const carnival = calendar.carnivalDates(year);
      expect(new Set(carnival).size).toBe(10);
      expect(
        carnival.every(
          (date) => !['01', '07', '12'].includes(date.slice(5, 7)) && !date.endsWith('-02-29'),
        ),
      ).toBe(true);
      expect(
        calendar.futureCapacity({
          operationStartDate: `${year}-01-01`,
          timezone: 'UTC',
          now: new Date(`${year}-01-01T00:00:00Z`),
        }),
      ).toEqual({ exerciseYear: year, alta: 103, media: 262 });
    },
  );
});
