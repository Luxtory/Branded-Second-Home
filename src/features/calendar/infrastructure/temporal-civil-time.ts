import { Temporal } from 'temporal-polyfill';
import type { CivilTime } from '../domain/civil-calendar';

// ADR-003 of the 03: check-in 14:00 and check-out 10:00 local. A nonexistent or ambiguous local time is rejected.
const CHECK_IN_HOUR = 14;
const CHECK_OUT_HOUR = 10;

function localEpochMilliseconds(date: string, timezone: string, hour: number): number {
  const { year, month, day } = Temporal.PlainDate.from(date);
  return Temporal.ZonedDateTime.from(
    { year, month, day, hour, timeZone: timezone },
    { disambiguation: 'reject' },
  ).epochMilliseconds;
}

function validateTimezone(timezone: string): void {
  if (
    typeof timezone !== 'string' ||
    timezone.length === 0 ||
    timezone.trim() !== timezone ||
    /^[+-]/.test(timezone) ||
    timezone === 'Z'
  ) {
    throw new RangeError('Invalid IANA timezone');
  }
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone);
  } catch {
    throw new RangeError('Invalid IANA timezone');
  }
}

export const temporalCivilTime: CivilTime = {
  validateTimezone,
  localDate: (at, timezone) =>
    Temporal.Instant.fromEpochMilliseconds(at.getTime())
      .toZonedDateTimeISO(timezone)
      .toPlainDate()
      .toString(),
  addDays: (date, days) => Temporal.PlainDate.from(date).add({ days }).toString(),
  checkInEpochMilliseconds: (date, timezone) =>
    localEpochMilliseconds(date, timezone, CHECK_IN_HOUR),
  checkOutEpochMilliseconds: (date, timezone) =>
    localEpochMilliseconds(date, timezone, CHECK_OUT_HOUR),
};
