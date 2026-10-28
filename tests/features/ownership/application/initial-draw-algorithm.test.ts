import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  acceptanceLimit,
  drawCommitment,
  drawKey,
  initialOrder,
  uniformIndex,
  type Prf,
} from '@/features/ownership/application/initial-draw-algorithm';

// Vetor calculado por implementação independente (Python hashlib/hmac) — docs/reference/sorteio-inicial.md.
const SEED = createHash('sha256').update('luxtory fy-v1 golden vector seed').digest();
const RANDOMNESS = Buffer.from(
  'ca93c230825ce92dd4d8dad03ef3d236378647ef62fa670587664cf9c25dcf52',
  'hex',
);
const GOLDEN: ReadonlyArray<readonly [number, readonly number[]]> = [
  [2, [2, 1]],
  [4, [2, 3, 1, 4]],
  [8, [2, 6, 5, 8, 1, 7, 3, 4]],
  [10, [9, 10, 5, 8, 1, 7, 3, 4, 2, 6]],
];
const TWO_256 = 2n ** 256n;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('W9 fy-v1 [TECH-093]', () => {
  it('[TECH-093] vetor fixo reproduz exatamente fy-v1', () => {
    expect(hex(SEED)).toBe('86e8d73b82e993a07b264dc3b86276564e76dabc8886ff73ce79becfdaf71e8c');
    expect(hex(drawCommitment(SEED))).toBe(
      'c1eef59bd5525b53abc287e8220a646cefad38cf71b33c22481e75c68233b8c2',
    );
    expect(hex(drawKey(SEED, RANDOMNESS))).toBe(
      'db7ea2d6761219f4ae3b1c0a442bdacb287933f76b3cb5e5a0e011d85323b2e2',
    );
    for (const [n, expected] of GOLDEN) expect(initialOrder(SEED, RANDOMNESS, n)).toEqual(expected);
  });

  it('[TECH-093] índice uniforme por rejection sampling, sem viés de módulo', () => {
    for (let m = 2; m <= 10; m += 1) {
      const limit = acceptanceLimit(m);
      // Faixa aceita múltipla de m: cada resto aparece o mesmo número de vezes; a rejeitada é menor que m.
      expect(limit % BigInt(m)).toBe(0n);
      expect(TWO_256 - limit).toBe(TWO_256 % BigInt(m));
      expect(TWO_256 - limit < BigInt(m)).toBe(true);
    }
    const key = drawKey(SEED, RANDOMNESS);
    const rejected = Buffer.alloc(32, 0xff); // 2²⁵⁶ − 1 ≥ limite para todo m que não divide 2²⁵⁶
    const accepted = Buffer.alloc(32, 0x00);
    accepted[31] = 23;
    const messages: string[] = [];
    const prf: Prf = (k, message) => {
      expect(hex(k)).toBe(hex(key));
      messages.push(hex(message));
      return messages.length <= 2 ? rejected : accepted;
    };
    expect(uniformIndex(key, 9, 10, prf)).toBe(3);
    // u32be(posição) ‖ u32be(contador), contador a partir de 0 e incrementado a cada rejeição.
    expect(messages).toEqual(['0000000900000000', '0000000900000001', '0000000900000002']);
  });

  it('[TECH-093] o contador recomeça em zero a cada posição', () => {
    const counters: string[] = [];
    const prf: Prf = (_key, message) => {
      counters.push(hex(message));
      return Buffer.alloc(32, 0);
    };
    uniformIndex(drawKey(SEED, RANDOMNESS), 3, 4, prf);
    uniformIndex(drawKey(SEED, RANDOMNESS), 2, 3, prf);
    expect(counters).toEqual(['0000000300000000', '0000000200000000']);
  });

  it('[TECH-093] permutações com frequência compatível com a distribuição uniforme', () => {
    const counts = new Map<string, number>();
    const SAMPLES = 24_000;
    for (let i = 0; i < SAMPLES; i += 1) {
      const randomness = createHash('sha256').update(`uniformity-${i}`).digest();
      const order = initialOrder(SEED, randomness, 4).join('');
      counts.set(order, (counts.get(order) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    const expected = SAMPLES / 24;
    const chiSquare = [...counts.values()].reduce(
      (sum, c) => sum + (c - expected) ** 2 / expected,
      0,
    );
    // Qui-quadrado com 23 graus de liberdade, p = 0,001: 49,73. Amostra determinística, sem intermitência.
    expect(chiSquare).toBeLessThan(49.73);
  });

  it.each([
    ['seed curta', Buffer.alloc(31), RANDOMNESS, 4],
    ['randomness longa', SEED, Buffer.alloc(33), 4],
    ['N fora das configurações', SEED, RANDOMNESS, 3],
  ])('[TECH-093] recusa %s', (_label, seed, randomness, n) => {
    expect(() => initialOrder(seed, randomness, n)).toThrow(RangeError);
  });

  it('[TECH-093] recusa faixa sem sorteio', () => {
    expect(() => acceptanceLimit(1)).toThrow(RangeError);
  });
});
