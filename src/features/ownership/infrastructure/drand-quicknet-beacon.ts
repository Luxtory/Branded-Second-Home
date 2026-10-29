import {
  fetchBeacon,
  type ChainClient,
  type ChainInfo,
  type RandomnessBeacon as DrandBeacon,
} from 'drand-client';
import { z } from 'zod';
import {
  InitialDrawBeaconInvalidError,
  InitialDrawBeaconUnavailableError,
  type RandomnessBeacon,
  type VerifiedRound,
} from '../application/initial-draw-ports';
import { QUICKNET, RANDOMNESS_BYTES, SIGNATURE_BYTES } from '../domain/initial-draw';

/** Relays públicos da quicknet, em ordem fixa. Não precisam ser confiáveis: toda rodada é verificada. */
export const QUICKNET_RELAYS = [
  'https://api.drand.sh',
  'https://api2.drand.sh',
  'https://api3.drand.sh',
  'https://drand.cloudflare.com',
] as const;

export interface RelayReply {
  readonly status: number;
  readonly body?: unknown;
}

/** Uma consulta HTTP a um relay; `signal` encerra a consulta quando o orçamento acaba. */
export interface BeaconTransport {
  get(relay: string, round: number, signal: AbortSignal): Promise<RelayReply>;
}

export interface QuicknetBeaconOptions {
  /** `DRAW_BEACON_TIMEOUT_MS`: orçamento total de obtenção e verificação, somando os relays. */
  readonly budgetMs: number;
  readonly transport?: BeaconTransport;
  readonly relays?: readonly string[];
  readonly now?: () => number;
}

// ChainInfo fixado no código (spec ownership §16.2): nunca obtido de um relay.
const PINNED_INFO: ChainInfo = {
  public_key: QUICKNET.publicKey,
  period: QUICKNET.periodSeconds,
  genesis_time: QUICKNET.genesisTimeSeconds,
  hash: QUICKNET.chainHash,
  groupHash: QUICKNET.groupHash,
  schemeID: QUICKNET.schemeId,
  metadata: { beaconID: QUICKNET.beaconId },
};

const MAX_BODY_BYTES = 4_096;
const MAX_HEX = 512;
const hex = z
  .string()
  .regex(/^[0-9a-f]+$/)
  .max(MAX_HEX);
const relayBeacon = z.object({
  round: z.number().int().positive(),
  randomness: hex,
  signature: hex,
});

class RelayBodyTooLargeError extends Error {
  constructor() {
    super(`Relay body exceeds ${MAX_BODY_BYTES} bytes`);
    this.name = 'RelayBodyTooLargeError';
  }
}

async function cappedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RelayBodyTooLargeError();
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** `fetch` nativo: sem cache, sem redirecionamento e corpo limitado. */
export const fetchTransport: BeaconTransport = {
  async get(relay, round, signal) {
    const response = await fetch(`${relay}/${QUICKNET.chainHash}/public/${round}`, {
      signal,
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status };
    }
    return { status: 200, body: await cappedJson(response) };
  },
};

/** ChainClient do drand-client que serve a resposta já obtida: a verificação oficial roda sobre a chain fixada. */
function servedBy(beacon: DrandBeacon): ChainClient {
  return {
    options: {
      disableBeaconVerification: false,
      noCache: true,
      chainVerificationParams: { chainHash: QUICKNET.chainHash, publicKey: QUICKNET.publicKey },
    },
    chain: () => ({ baseUrl: 'pinned:quicknet', info: () => Promise.resolve(PINNED_INFO) }),
    get: () => Promise.resolve(beacon),
    latest: () => Promise.resolve(beacon),
  };
}

type Attempt = VerifiedRound | 'unavailable' | 'invalid';

async function verify(body: unknown, round: number): Promise<Attempt> {
  const parsed = relayBeacon.safeParse(body);
  if (!parsed.success) return 'unavailable';
  try {
    const beacon = await fetchBeacon(servedBy(parsed.data), round);
    const randomness = Buffer.from(beacon.randomness, 'hex');
    const signature = Buffer.from(beacon.signature, 'hex');
    if (
      beacon.round !== round ||
      randomness.length !== RANDOMNESS_BYTES ||
      signature.length !== SIGNATURE_BYTES
    ) {
      return 'invalid';
    }
    return { round, randomness, signature };
  } catch {
    // Assinatura, randomness ou rodada recusadas pela verificação oficial: rodada inválida deste relay.
    return 'invalid';
  }
}

/** Adaptador do port `RandomnessBeacon` para a drand quicknet (ADR-0022 §3, §6). */
export function createQuicknetBeacon({
  budgetMs,
  transport = fetchTransport,
  relays = QUICKNET_RELAYS,
  now = Date.now,
}: QuicknetBeaconOptions): RandomnessBeacon {
  let failingUntil = 0;
  return {
    async verifiedRound(round) {
      if (now() < failingUntil) throw new InitialDrawBeaconUnavailableError(round);
      const deadline = now() + budgetMs;
      let invalid = false;
      for (const relay of relays) {
        const remaining = deadline - now();
        if (remaining <= 0) break;
        let attempt: Attempt;
        try {
          const reply = await transport.get(relay, round, AbortSignal.timeout(remaining));
          attempt = reply.status === 200 ? await verify(reply.body, round) : 'unavailable';
        } catch {
          // Rede, prazo ou corpo acima do limite: tenta o próximo relay dentro do mesmo orçamento.
          attempt = 'unavailable';
        }
        if (typeof attempt === 'object') return attempt;
        invalid ||= attempt === 'invalid';
      }
      failingUntil = now() + budgetMs;
      throw invalid
        ? new InitialDrawBeaconInvalidError(round)
        : new InitialDrawBeaconUnavailableError(round);
    },
  };
}
