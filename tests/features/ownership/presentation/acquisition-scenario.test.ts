import { describe, expect, it } from 'vitest';
import { partialAcquisitionScenario } from '../../../support/acquisition-scenario';

describe('W8 browser fixture remains valid across civil-year boundaries [TECH-110]', () => {
  it.each([
    ['2026-10-26T12:00:00Z', '2026-10-26', 1, 2],
    ['2026-12-01T12:00:00Z', '2026-12-01', 1, 0],
    ['2026-12-29T12:00:00Z', '2026-12-29', 1, 0],
    ['2026-12-29T20:00:00Z', '2026-12-29', 0, 0],
    ['2026-12-30T12:00:00Z', '2026-12-30', 0, 0],
    ['2026-12-31T20:00:00Z', '2026-12-31', 0, 0],
    ['2026-01-01T12:00:00Z', '2025-12-31', 0, 0],
    ['2036-02-29T12:00:00Z', '2036-02-29', 1, 2],
  ])('selects explicit synthetic quantities at %s', (at, operationDate, alta, media) => {
    expect(partialAcquisitionScenario(new Date(at))).toEqual({ operationDate, alta, media });
  });
});
