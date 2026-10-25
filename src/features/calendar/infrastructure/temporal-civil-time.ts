import { Temporal } from 'temporal-polyfill';
import type { CivilTime } from '../domain/civil-calendar';

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
  checkInEpochMilliseconds: (date, timezone) => {
    const { year, month, day } = Temporal.PlainDate.from(date);
    return Temporal.ZonedDateTime.from(
      { year, month, day, hour: 14, timeZone: timezone },
      { disambiguation: 'reject' },
    ).epochMilliseconds;
  },
};
