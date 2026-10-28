/**
 * Sorteio da ordem inicial (BR-100, TECH-093, spec ownership §16): valores puros do protocolo. O beacon é a rede drand
 * quicknet, com parâmetros fixados aqui e nunca obtidos de um relay.
 */
export const DRAW_ALGORITHM = 'fy-v1';

export const QUICKNET = {
  chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  publicKey:
    '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  groupHash: 'f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e',
  schemeId: 'bls-unchained-g1-rfc9380',
  beaconId: 'quicknet',
  genesisTimeSeconds: 1_692_803_367,
  periodSeconds: 3,
} as const;

/** Ações por configuração Co-Owner (`01` §8.1): o sorteio tem sempre N participantes. */
export const DRAW_PARTICIPANT_COUNTS = [2, 4, 8, 10] as const;

export const SEED_BYTES = 32;
export const RANDOMNESS_BYTES = 32;
export const SIGNATURE_BYTES = 48;

const MS_PER_SECOND = 1_000;
const GENESIS_MS = QUICKNET.genesisTimeSeconds * MS_PER_SECOND;
const PERIOD_MS = QUICKNET.periodSeconds * MS_PER_SECOND;

/** Instante em que a rodada é publicada: `t(R) = genesis + (R − 1) × período`. */
export function roundTime(round: number): Date {
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new RangeError(`Invalid quicknet round: ${round}`);
  }
  return new Date(GENESIS_MS + (round - 1) * PERIOD_MS);
}

/** Primeira rodada publicada no instante `at` ou depois dele. */
export function firstRoundAtOrAfter(at: Date): number {
  const elapsed = at.getTime() - GENESIS_MS;
  if (elapsed <= 0) return 1;
  return Math.ceil(elapsed / PERIOD_MS) + 1;
}
