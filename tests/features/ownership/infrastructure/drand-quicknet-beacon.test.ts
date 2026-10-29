import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InitialDrawBeaconInvalidError,
  InitialDrawBeaconUnavailableError,
} from '@/features/ownership/application/initial-draw-ports';
import { QUICKNET } from '@/features/ownership/domain/initial-draw';
import {
  QUICKNET_RELAYS,
  createQuicknetBeacon,
  type BeaconTransport,
} from '@/features/ownership/infrastructure/drand-quicknet-beacon';

interface RecordedRound {
  readonly round: number;
  readonly randomness: string;
  readonly signature: string;
}
const fixture = JSON.parse(readFileSync('tests/fixtures/drand-quicknet-rounds.json', 'utf8')) as {
  chainHash: string;
  rounds: RecordedRound[];
};
const [real, other] = fixture.rounds as [RecordedRound, RecordedRound];
const flip = (value: string, index: number) =>
  value.slice(0, index) + (parseInt(value[index]!, 16) ^ 1).toString(16) + value.slice(index + 1);
const BUDGET_MS = 2_000;

type Reply = { readonly status: number; readonly body?: unknown } | Error;

/** Transporte em memória: cada relay devolve a resposta indicada e as chamadas ficam registradas. */
function transport(replies: Record<string, Reply>): BeaconTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get(relay, round) {
      calls.push(`${relay}/${round}`);
      const reply = replies[relay] ?? { status: 404 };
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
  };
}

const everyRelay = (reply: Reply) =>
  Object.fromEntries(QUICKNET_RELAYS.map((relay) => [relay, reply])) as Record<string, Reply>;

describe('W9 beacon drand quicknet [TECH-093]', () => {
  afterEach(() => vi.restoreAllMocks());

  it('[TECH-093] aceita rodadas reais gravadas, verificadas contra a chain fixada', async () => {
    expect(fixture.chainHash).toBe(QUICKNET.chainHash);
    for (const recorded of fixture.rounds) {
      const relays = transport({ [QUICKNET_RELAYS[0]]: { status: 200, body: recorded } });
      const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS, transport: relays });
      const verified = await beacon.verifiedRound(recorded.round);
      expect(verified.round).toBe(recorded.round);
      expect(Buffer.from(verified.randomness).toString('hex')).toBe(recorded.randomness);
      expect(Buffer.from(verified.signature).toString('hex')).toBe(recorded.signature);
      // Nunca consulta /info: o ChainInfo é fixado no código.
      expect(relays.calls).toEqual([`${QUICKNET_RELAYS[0]}/${recorded.round}`]);
    }
  });

  it.each([
    ['assinatura adulterada', { ...real, signature: flip(real.signature, 20) }],
    ['randomness adulterada', { ...real, randomness: flip(real.randomness, 5) }],
    ['rodada real substituída', other],
    ['número da rodada trocado', { ...other, round: real.round }],
    ['assinatura curta', { ...real, signature: real.signature.slice(0, 94) }],
  ])('[TECH-093] recusa %s em todos os relays', async (_label, body) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const beacon = createQuicknetBeacon({
      budgetMs: BUDGET_MS,
      transport: transport(everyRelay({ status: 200, body })),
    });
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconInvalidError,
    );
  });

  it('[TECH-093] um relay adulterado não impede a rodada válida de outro relay', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const relays = transport({
      [QUICKNET_RELAYS[0]]: { status: 200, body: { ...real, signature: flip(real.signature, 3) } },
      [QUICKNET_RELAYS[1]]: { status: 200, body: real },
    });
    const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS, transport: relays });
    expect((await beacon.verifiedRound(real.round)).round).toBe(real.round);
    expect(relays.calls).toHaveLength(2);
  });

  it.each([
    ['rodada ainda não publicada (425)', everyRelay({ status: 425 })],
    ['rodada ainda não publicada (404)', everyRelay({ status: 404 })],
    ['erro 5xx', everyRelay({ status: 503 })],
    ['falha de rede', everyRelay(new TypeError('fetch failed'))],
    ['corpo malformado', everyRelay({ status: 200, body: { round: 'x' } })],
  ])('[TECH-110] %s deixa o beacon indisponível', async (_label, replies) => {
    const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS, transport: transport(replies) });
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
  });

  it('[TECH-110] o orçamento total encerra relays lentos e vale para todos juntos', async () => {
    const calls: string[] = [];
    const hanging: BeaconTransport = {
      get(relay, _round, signal) {
        calls.push(relay);
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error));
        });
      },
    };
    const beacon = createQuicknetBeacon({ budgetMs: 120, transport: hanging });
    const started = Date.now();
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(calls).toHaveLength(1);
  });

  it('[TECH-110] depois de uma falha, novas obtenções falham sem rede pelo mesmo orçamento', async () => {
    let now = 1_000_000;
    const relays = transport(everyRelay({ status: 503 }));
    const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS, transport: relays, now: () => now });
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
    const afterFirst = relays.calls.length;
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
    expect(relays.calls).toHaveLength(afterFirst);
    now += BUDGET_MS;
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
    expect(relays.calls.length).toBeGreaterThan(afterFirst);
  });

  it('[TECH-093] o transporte padrão consulta só /public/<rodada> da chain fixada, sem cache', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(real), { status: 200 }));
    const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS });
    expect((await beacon.verifiedRound(real.round)).round).toBe(real.round);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${QUICKNET_RELAYS[0]}/${QUICKNET.chainHash}/public/${real.round}`);
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });

  it('[TECH-093] o transporte padrão recusa corpo acima do limite', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('x'.repeat(64 * 1024), { status: 200 })),
    );
    const beacon = createQuicknetBeacon({ budgetMs: BUDGET_MS });
    await expect(beacon.verifiedRound(real.round)).rejects.toBeInstanceOf(
      InitialDrawBeaconUnavailableError,
    );
  });
});
