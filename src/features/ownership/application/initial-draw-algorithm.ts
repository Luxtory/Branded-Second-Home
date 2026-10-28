import { createHash, createHmac } from 'node:crypto';
import { DRAW_PARTICIPANT_COUNTS, RANDOMNESS_BYTES, SEED_BYTES } from '../domain/initial-draw';

/**
 * `fy-v1` (TECH-093, spec ownership §16.2): Fisher-Yates de `n − 1` até `1`, índice por HMAC-SHA256 com rejection
 * sampling. Definição fixa — qualquer mudança é um novo algoritmo (`fy-v2`).
 */
export type Prf = (key: Uint8Array, message: Uint8Array) => Uint8Array;

export const hmacSha256: Prf = (key, message) => createHmac('sha256', key).update(message).digest();

const sha256 = (...parts: readonly Uint8Array[]): Uint8Array => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
};

const UINT32_BYTES = 4;
const TWO_256 = 2n ** 256n;

function requireLength(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.length !== length) throw new RangeError(`${name} must have ${length} bytes`);
}

/** Compromisso publicado antes do beacon: `SHA-256(seed)`. */
export function drawCommitment(seed: Uint8Array): Uint8Array {
  requireLength(seed, SEED_BYTES, 'seed');
  return sha256(seed);
}

/** `key = SHA-256(seed ‖ randomness)`. */
export function drawKey(seed: Uint8Array, randomness: Uint8Array): Uint8Array {
  requireLength(seed, SEED_BYTES, 'seed');
  requireLength(randomness, RANDOMNESS_BYTES, 'randomness');
  return sha256(seed, randomness);
}

/** Maior múltiplo de `m` até 2²⁵⁶: valores a partir dele são rejeitados (sem viés de módulo). */
export function acceptanceLimit(m: number): bigint {
  if (!Number.isSafeInteger(m) || m < 2) throw new RangeError(`Invalid draw range: ${m}`);
  return TWO_256 - (TWO_256 % BigInt(m));
}

function message(position: number, counter: number): Uint8Array {
  const bytes = Buffer.alloc(UINT32_BYTES * 2);
  bytes.writeUInt32BE(position, 0);
  bytes.writeUInt32BE(counter, UINT32_BYTES);
  return bytes;
}

const unsigned = (bytes: Uint8Array): bigint => BigInt(`0x${Buffer.from(bytes).toString('hex')}`);

/** Índice uniforme em `[0, m)`; contador recomeça em 0 a cada posição e sobe a cada rejeição. */
export function uniformIndex(
  key: Uint8Array,
  position: number,
  m: number,
  prf: Prf = hmacSha256,
): number {
  const limit = acceptanceLimit(m);
  for (let counter = 0; ; counter += 1) {
    const x = unsigned(prf(key, message(position, counter)));
    if (x < limit) return Number(x % BigInt(m));
  }
}

/** Posição `p` (1..n) → número da Ação (1..n) na lista congelada de participantes. */
export function initialOrder(seed: Uint8Array, randomness: Uint8Array, n: number): number[] {
  if (!(DRAW_PARTICIPANT_COUNTS as readonly number[]).includes(n)) {
    throw new RangeError(`Invalid participant count: ${n}`);
  }
  const key = drawKey(seed, randomness);
  const order = Array.from({ length: n }, (_, index) => index);
  for (let i = n - 1; i >= 1; i -= 1) {
    const j = uniformIndex(key, i, i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.map((index) => index + 1);
}
