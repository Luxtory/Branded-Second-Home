import { describe, expect, it } from 'vitest';
import {
  DRAW_PARTICIPANT_COUNTS,
  QUICKNET,
  firstRoundAtOrAfter,
  roundTime,
} from '@/features/ownership/domain/initial-draw';

const GENESIS_MS = 1_692_803_367_000;
const PERIOD_MS = 3_000;

describe('W9 rodadas da drand quicknet [TECH-093]', () => {
  it('[TECH-093] fixa a chain quicknet pública e as configurações Co-Owner do 01', () => {
    expect(QUICKNET.chainHash).toBe(
      '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
    );
    expect(QUICKNET.schemeId).toBe('bls-unchained-g1-rfc9380');
    expect(QUICKNET.genesisTimeSeconds).toBe(1_692_803_367);
    expect(QUICKNET.periodSeconds).toBe(3);
    expect(QUICKNET.publicKey).toHaveLength(192);
    expect(DRAW_PARTICIPANT_COUNTS).toEqual([2, 4, 8, 10]);
  });

  it('[TECH-093] t(R) = genesis + (R − 1) × período', () => {
    expect(roundTime(1).getTime()).toBe(GENESIS_MS);
    expect(roundTime(33_474_932).getTime()).toBe(GENESIS_MS + 33_474_931 * PERIOD_MS);
  });

  it('[TECH-093] a rodada alvo é a primeira com t(R) no instante ou depois dele', () => {
    const at = roundTime(33_474_932);
    expect(firstRoundAtOrAfter(at)).toBe(33_474_932);
    expect(firstRoundAtOrAfter(new Date(at.getTime() + 1))).toBe(33_474_933);
    expect(firstRoundAtOrAfter(new Date(at.getTime() - 1))).toBe(33_474_932);
    expect(firstRoundAtOrAfter(new Date(GENESIS_MS - 10 * PERIOD_MS))).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN])('[TECH-093] rodada inválida %s é recusada', (round) => {
    expect(() => roundTime(round)).toThrow(RangeError);
  });
});
