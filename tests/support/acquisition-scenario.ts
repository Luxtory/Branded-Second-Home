import { createCivilCalendar } from '../../src/features/calendar/index';

/** Fixed synthetic alternatives for the browser fixture, never a production allocation policy. */
export function partialAcquisitionScenario(at: Date) {
  const calendar = createCivilCalendar();
  const timezone = 'America/Sao_Paulo';
  let operationDate = calendar.localDate(at, timezone);
  // Keep the partial-exercise scenario on January 1, when the current civil exercise is annual.
  if (operationDate.endsWith('-01-01'))
    operationDate = `${Number(operationDate.slice(0, 4)) - 1}-12-31`;
  const capacity = calendar.futureCapacity({
    operationStartDate: operationDate,
    timezone,
    now: at,
  });
  return {
    operationDate,
    // Keep one unused night so a check-in boundary during the browser workflow cannot invalidate this fixture.
    // The choices remain fixed explicit test amounts (or explicit zero), never a proportional allocation.
    alta: capacity.alta >= 3 ? 1 : 0,
    media: capacity.media >= 5 ? 2 : 0,
  };
}
