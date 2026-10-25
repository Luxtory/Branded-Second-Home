import { parseCivilDate, validateYear } from './civil-date';

/** A validated Gregorian YYYY-MM-DD civil date, without an instant or offset. */
export type CivilDate = string;
export type Season = 'alta' | 'media';
export type NightClassification = Readonly<{ season: Season; isLeapDay: boolean }>;
export type FutureCapacityInput = Readonly<{
  operationStartDate: CivilDate;
  timezone: string;
  now: Date;
}>;
export type FutureCapacity = Readonly<{ exerciseYear: number; alta: number; media: number }>;

/** Civil primitives only; library-specific objects never cross this boundary. */
export interface CivilTime {
  validateTimezone(timezone: string): void;
  localDate(at: Date, timezone: string): CivilDate;
  addDays(date: CivilDate, days: number): CivilDate;
  checkInEpochMilliseconds(date: CivilDate, timezone: string): number;
}

export interface CivilCalendar {
  validateTimezone(timezone: string): void;
  localDate(at: Date, timezone: string): CivilDate;
  exerciseYear(date: CivilDate): number;
  isPartialExercise(date: CivilDate): boolean;
  carnivalDates(year: number): readonly CivilDate[];
  classify(date: CivilDate): NightClassification;
  futureCapacity(input: FutureCapacityInput): FutureCapacity;
}

// Gregorian computus (Meeus/Jones/Butcher), without process-local date arithmetic.
function easter(year: number): CivilDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthlyHigh(month: number): boolean {
  return month === 1 || month === 7 || month === 12;
}

function classification(date: CivilDate, carnival: ReadonlySet<CivilDate>): NightClassification {
  const { month, day } = parseCivilDate(date);
  const isLeapDay = month === 2 && day === 29;
  return {
    season: monthlyHigh(month) || (!isLeapDay && carnival.has(date)) ? 'alta' : 'media',
    isLeapDay,
  };
}

export function civilCalendar(time: CivilTime): CivilCalendar {
  function carnivalDates(year: number): readonly CivilDate[] {
    validateYear(year);
    // Tuesday is Easter -47; its previous Friday is another four days earlier.
    let date = time.addDays(easter(year), -51);
    if (parseCivilDate(date).month === 1) date = `${String(year).padStart(4, '0')}-02-01`;
    const dates: CivilDate[] = [];
    while (dates.length < 10) {
      const { month, day } = parseCivilDate(date);
      if (!monthlyHigh(month) && !(month === 2 && day === 29)) dates.push(date);
      date = time.addDays(date, 1);
    }
    return dates;
  }

  function localDate(at: Date, timezone: string): CivilDate {
    time.validateTimezone(timezone);
    if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
      throw new RangeError('Invalid instant');
    }
    const date = time.localDate(at, timezone);
    parseCivilDate(date);
    return date;
  }

  return {
    validateTimezone: (timezone) => time.validateTimezone(timezone),
    localDate,
    exerciseYear: (date) => parseCivilDate(date).year,
    isPartialExercise: (date) => {
      const { month, day } = parseCivilDate(date);
      return month !== 1 || day !== 1;
    },
    carnivalDates,
    classify: (date) => classification(date, new Set(carnivalDates(parseCivilDate(date).year))),
    futureCapacity: ({ operationStartDate, timezone, now }) => {
      const { year } = parseCivilDate(operationStartDate);
      const today = localDate(now, timezone);
      const end = `${String(year).padStart(4, '0')}-12-31`;
      const capacity = { exerciseYear: year, alta: 0, media: 0 };
      const carnival = new Set(carnivalDates(year));
      let date = today > operationStartDate ? today : operationStartDate;
      while (date <= end) {
        const { season, isLeapDay } = classification(date, carnival);
        // PD-002 and TECH-043: 14h local, strictly after the injected instant.
        if (!isLeapDay && time.checkInEpochMilliseconds(date, timezone) > now.getTime()) {
          capacity[season] += 1;
        }
        if (date === end) break;
        date = time.addDays(date, 1);
      }
      return capacity;
    },
  };
}
