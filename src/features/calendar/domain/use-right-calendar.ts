import { validateYear } from './civil-date';
import type { CivilTime } from './civil-calendar';
import { isLeapYear, type UseRightBucket } from './use-right';

/** TECH-042: cada posição abre 7 dias depois da anterior. */
const WINDOW_INTERVAL_DAYS = 7;

const pad = (year: number) => String(year).padStart(4, '0');

/**
 * Instantes do Direito de Uso no fuso da Second Home (TECH-040, TECH-042; spec calendar §6). Derivados dos fatos a cada
 * chamada — nunca do estado de uma notificação ou da execução de um job (D4).
 */
export interface UseRightCalendar {
  /** `15/09 00:00` local do ano anterior, ou a formalização se posterior (TECH-042, BR-109). */
  windowBase(input: {
    readonly exerciseYear: number;
    readonly formalizedAt: Date;
    readonly timezone: string;
  }): Date;
  /** Abertura cumulativa da posição `p` (BR-103): `base + (p − 1) × 7 dias` civis; a Luxtory é a posição N+1. */
  windowOpensAt(input: {
    readonly exerciseYear: number;
    readonly position: number;
    readonly stakes: number;
    readonly formalizedAt: Date;
    readonly timezone: string;
  }): Date;
  /**
   * Fim efetivo do bucket (INV-5, PD-004): o 29/02 deixa de valer às 00:00 de 01/03; Alta e Média às 00:00 de 01/01 do
   * exercício seguinte. Depois dele o saldo não é utilizável, com ou sem o registro do `close_exercise`.
   */
  effectiveEnd(bucket: UseRightBucket, exerciseYear: number, timezone: string): Date;
}

export function createUseRightCalendar(time: CivilTime): UseRightCalendar {
  function windowBase({
    exerciseYear,
    formalizedAt,
    timezone,
  }: {
    readonly exerciseYear: number;
    readonly formalizedAt: Date;
    readonly timezone: string;
  }): Date {
    validateYear(exerciseYear);
    time.validateTimezone(timezone);
    if (!(formalizedAt instanceof Date) || !Number.isFinite(formalizedAt.getTime())) {
      throw new RangeError('Invalid formalization instant');
    }
    const ordinary = time.startOfDayEpochMilliseconds(`${pad(exerciseYear - 1)}-09-15`, timezone);
    return new Date(Math.max(ordinary, formalizedAt.getTime()));
  }

  return {
    windowBase,
    windowOpensAt(input) {
      const { position, stakes, timezone } = input;
      if (!Number.isInteger(position) || position < 1 || position > stakes + 1) {
        throw new RangeError(`Invalid window position ${position}`);
      }
      const base = windowBase(input).getTime();
      return new Date(
        time.addLocalDaysEpochMilliseconds(base, (position - 1) * WINDOW_INTERVAL_DAYS, timezone),
      );
    },
    effectiveEnd(bucket, exerciseYear, timezone) {
      validateYear(exerciseYear);
      time.validateTimezone(timezone);
      if (bucket === 'leap') {
        if (!isLeapYear(exerciseYear)) throw new RangeError(`${exerciseYear} has no February 29`);
        return new Date(time.startOfDayEpochMilliseconds(`${pad(exerciseYear)}-03-01`, timezone));
      }
      return new Date(time.startOfDayEpochMilliseconds(`${pad(exerciseYear + 1)}-01-01`, timezone));
    },
  };
}
