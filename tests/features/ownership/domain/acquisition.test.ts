import { describe, expect, it } from 'vitest';
import { allocationFits, validAcquirers } from '@/features/ownership/domain/acquisition';

const configuration = {
  id: 2,
  participationBps: 5000,
  alta: 48,
  media: 128,
  luxtoryAlta: 7,
  luxtoryMedia: 6,
};
const grants = [
  { position: 1, alta: 30, media: 61 },
  { position: 2, alta: 30, media: 61 },
] as const;

describe('W8 acquisition invariants [REQ-024] [REQ-026] [BR-107]', () => {
  it('accepts explicit equal grants at the exact future bucket limits', () => {
    expect(
      allocationFits(configuration, grants, { alta: 2, media: 0 }, { alta: 62, media: 122 }),
    ).toBe(true);
  });
  it.each([
    [[{ position: 1, alta: 30, media: 61 }], { alta: 2, media: 0 }, { alta: 62, media: 122 }],
    [
      [grants[0], { position: 1, alta: 30, media: 61 }],
      { alta: 2, media: 0 },
      { alta: 62, media: 122 },
    ],
    [
      [grants[0], { position: 3, alta: 30, media: 61 }],
      { alta: 2, media: 0 },
      { alta: 62, media: 122 },
    ],
    [
      [grants[0], { position: 2, alta: 29, media: 62 }],
      { alta: 2, media: 0 },
      { alta: 62, media: 122 },
    ],
    [grants, { alta: 2, media: 0 }, { alta: 61, media: 200 }],
    [grants, { alta: 2, media: 0 }, { alta: 100, media: 121 }],
    [grants, { alta: 8, media: 0 }, { alta: 100, media: 200 }],
    [
      [
        { position: 1, alta: 49, media: 0 },
        { position: 2, alta: 49, media: 0 },
      ],
      { alta: 0, media: 0 },
      { alta: 103, media: 262 },
    ],
    [
      [
        { position: 1, alta: -1, media: 0 },
        { position: 2, alta: -1, media: 0 },
      ],
      { alta: 0, media: 0 },
      { alta: 103, media: 262 },
    ],
  ])(
    'rejects unequal, missing, invalid or over-capacity allocation %#',
    (items, luxtory, capacity) => {
      expect(allocationFits(configuration, items, luxtory, capacity)).toBe(false);
    },
  );
  it('does not infer amounts or require exhaustion of future capacity', () => {
    expect(
      allocationFits(
        configuration,
        [
          { position: 1, alta: 0, media: 0 },
          { position: 2, alta: 0, media: 0 },
        ],
        { alta: 0, media: 0 },
        { alta: 62, media: 122 },
      ),
    ).toBe(true);
  });
  it('requires the exact distinct party count and excludes the registered institutional party', () => {
    expect(validAcquirers(['a'], 1, null)).toBe(true);
    expect(validAcquirers(['a', 'b'], 1, null)).toBe(false);
    expect(validAcquirers(['a', 'b'], 2, 'luxtory')).toBe(true);
    expect(validAcquirers(['a', 'a'], 2, 'luxtory')).toBe(false);
    expect(validAcquirers(['a', 'luxtory'], 2, 'luxtory')).toBe(false);
  });
});
