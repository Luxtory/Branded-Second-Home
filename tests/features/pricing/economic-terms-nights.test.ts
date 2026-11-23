import { describe, expect, it } from 'vitest';
import { CommandRejection, LockSequence } from '@/features/platform';
import { resolveEconomicTerms, type EconomicTermsStore } from '@/features/pricing';

/**
 * W20 (ADR-0036 §4) — conjunto explícito de noites no resolvedor `EconomicTerms`: uma leitura do intervalo que as cobre
 * (mesma trava e instante), só as noites pedidas entram; noite intermediária sem PRL não recusa nem soma.
 */
const HOME = '00000000-0000-4000-8000-0000000000aa';

function fakeStore(prices: Readonly<Record<string, string>>) {
  const calls: string[][] = [];
  const store: EconomicTermsStore<null> = {
    lockPolicy: async () => undefined,
    policyAt: async () => null,
    lockParameters: async () => undefined,
    async prlPeriodInForce(_tx, secondHomeId, checkin, checkout) {
      calls.push([secondHomeId, checkin, checkout]);
      const nights = [];
      for (
        let at = Date.parse(`${checkin}T00:00:00Z`);
        at < Date.parse(`${checkout}T00:00:00Z`);
        at += 86_400_000
      ) {
        const stayDate = new Date(at).toISOString().slice(0, 10);
        const amount = prices[stayDate] ?? null;
        nights.push({
          stayDate,
          prlId: amount === null ? null : `prl-${stayDate}`,
          amountMinor: amount,
          currency: amount === null ? null : 'BRL',
        });
      }
      return { resolvedAt: '2027-01-01T00:00:00.000000Z', nights };
    },
    databaseInstant: async () => '2027-01-01T00:00:00.000000Z',
    parametersAt: async () =>
      new Map([['credit_multiplier', { id: 'p-1', value: '10', currency: null }]]),
  };
  return { store, calls };
}

const resolve = (store: EconomicTermsStore<null>, dates: readonly string[]) =>
  resolveEconomicTerms(null, new LockSequence(), store, {
    parameters: ['credit_multiplier'],
    nights: { secondHomeId: HOME, dates },
  });

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandRejection) return error.code;
    throw error;
  }
  return null;
}

describe('W20 — EconomicTerms por conjunto de noites (REQ-052, ADR-0036 §4)', () => {
  it('[REQ-052] uma leitura do intervalo; só as noites pedidas entram, a intermediária sem PRL não importa', async () => {
    const { store, calls } = fakeStore({ '2027-03-01': '10001', '2027-03-04': '20002' });
    const terms = await resolve(store, ['2027-03-01', '2027-03-04']);
    expect(calls).toEqual([[HOME, '2027-03-01', '2027-03-05']]);
    expect(terms.nights.map((night) => [night.stayDate, night.prlId])).toEqual([
      ['2027-03-01', 'prl-2027-03-01'],
      ['2027-03-04', 'prl-2027-03-04'],
    ]);
    expect(terms.prlTotal).toEqual({ amountMinor: '30003', currency: 'BRL' });
    expect(terms.secondHomeId).toBe(HOME);
  });

  it('[TECH-001] noite pedida sem PRL → ERR_PRL_MISSING', async () => {
    const { store } = fakeStore({ '2027-03-01': '10001' });
    expect(await code(resolve(store, ['2027-03-01', '2027-03-02']))).toBe('ERR_PRL_MISSING');
  });

  it('conjunto vazio, fora de ordem, repetido, inválido ou acima de 366 noites → ERR_VALIDATION', async () => {
    const { store, calls } = fakeStore({});
    for (const dates of [
      [],
      ['2027-03-02', '2027-03-01'],
      ['2027-03-01', '2027-03-01'],
      ['2027-02-30'],
      ['2027-13-01'],
      ['2027-01-01', '2028-01-02'],
    ])
      expect(await code(resolve(store, dates))).toBe('ERR_VALIDATION');
    expect(
      await code(
        resolveEconomicTerms(null, new LockSequence(), store, {
          parameters: [],
          period: { secondHomeId: HOME, checkin: '2027-03-01', checkout: '2027-03-02' },
          nights: { secondHomeId: HOME, dates: ['2027-03-01'] },
        }),
      ),
    ).toBe('ERR_VALIDATION');
    expect(calls).toEqual([]);
  });
});
