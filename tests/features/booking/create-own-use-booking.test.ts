import { describe, expect, it } from 'vitest';
import {
  createCreateOwnUseBookingHandler,
  OwnUseBookingNotActivatedError,
  type NightState,
  type OwnUseFacts,
  type Representation,
  type SealedOwnUseNight,
} from '@/features/booking/application/create-own-use-booking';
import { addCivilDays, stayNights } from '@/features/booking/domain/own-use-stay';
import {
  CommandRejection,
  LockSequence,
  type Actor,
  type AuditRecord,
  type OutboxEventDraft,
} from '@/features/platform';

const NOW = new Date('2027-03-01T12:00:00.000Z');
const HOME = '00000000-0000-4000-8000-000000000a01';
const PARTY = '00000000-0000-4000-8000-000000000b01';
const STAKE = '00000000-0000-4000-8000-000000000c01';
const titular: Actor = {
  kind: 'user',
  userId: '00000000-0000-4000-8000-000000000d01',
  actingPartyId: PARTY,
  role: 'titular',
};
const coOwner: Representation = { holdingId: 'holding-1', role: 'co_owner', stakeId: STAKE };
const ownerHolding: Representation = { holdingId: 'holding-o', role: 'owner', stakeId: null };
const facts: OwnUseFacts = {
  acquisitionId: 'acq-1',
  operationStartDate: '2027-01-01',
  formalizedAt: new Date('2026-11-01T12:00:00Z'),
  timezone: 'America/Sao_Paulo',
  drawn: [{ stakeId: STAKE, position: 1 }],
};

const seasonOf = (date: string): 'alta' | 'media' =>
  ['01', '07', '12'].includes(date.slice(5, 7)) ? 'alta' : 'media';
const night = (date: string): SealedOwnUseNight => ({
  stayDate: date,
  exerciseYear: Number(date.slice(0, 4)),
  season: seasonOf(date),
  isLeapDay: date.endsWith('-02-29'),
  checkInAt: new Date(`${date}T17:00:00Z`),
});

interface Scenario {
  activated?: boolean;
  representation?: Representation | null;
  sealedUntil?: string;
  holder?: (date: string) => string;
  occupied?: readonly string[];
  window?: (year: number, leap: boolean) => Date | null;
  remaining?: Record<string, number>;
  neighbors?: readonly string[];
  reserveFails?: boolean;
}

function harness(scenario: Scenario = {}) {
  const calls: string[] = [];
  const consumed: { stayDate: string; exerciseYear: number; bucket: string }[] = [];
  const occupancies: { stayDate: string; custodyId: string; stakeId: string | null }[] = [];
  const windowCalls: { year: number; leap: boolean }[] = [];
  const sealedUntil = scenario.sealedUntil ?? '2028-12-31';
  const handler = createCreateOwnUseBookingHandler<object>({
    newId: () => 'booking-1',
    store: {
      isActivated: async () => {
        calls.push('activation');
        return scenario.activated ?? true;
      },
      lockRepresentation: async () => {
        calls.push('representation');
        return scenario.representation === undefined ? coOwner : scenario.representation;
      },
      lockStake: async (_tx, stakeId) => {
        calls.push(`stake:${stakeId}`);
      },
      lockNights: async (_tx, _home, dates) => {
        calls.push(`nights:${dates.join(',')}`);
      },
      sealedNights: async (_tx, _home, checkin, checkout) =>
        stayNights(checkin, checkout)
          .filter((date) => date <= sealedUntil)
          .map(night),
      ownUseNights: async () => scenario.neighbors ?? [],
      insertBooking: async () => {
        calls.push('booking');
        return new Date('2027-03-01T12:00:00.500Z');
      },
    },
    inventory: {
      nightStates: async (_tx, _home, dates) =>
        dates.map((date): NightState => ({
          stayDate: date,
          custodyId: `custody-${date}`,
          holderKind: scenario.holder?.(date) ?? 'spe_pool',
          basis: null,
          stakeId: null,
          occupied: (scenario.occupied ?? []).includes(date),
        })),
      reserveRight: async (_tx, transition) => {
        calls.push(`reserve:${transition.stayDate}`);
        return scenario.reserveFails ? null : `reserved-${transition.stayDate}`;
      },
      occupy: async (_tx, rows) => {
        for (const row of rows)
          occupancies.push({
            stayDate: row.stayDate,
            custodyId: row.custodyId,
            stakeId: row.stakeId,
          });
      },
    },
    rights: {
      remaining: async (_tx, _stake, keys) =>
        new Map(
          keys.map((key) => [
            `${key.exerciseYear}:${key.bucket}`,
            scenario.remaining?.[`${key.exerciseYear}:${key.bucket}`] ?? 30,
          ]),
        ),
      consume: async (_tx, entry) => {
        consumed.push({
          stayDate: entry.stayDate,
          exerciseYear: entry.exerciseYear,
          bucket: entry.bucket,
        });
      },
    },
    findFacts: async () => facts,
    windowOpensAt: (_facts, _stake, year, leap) => {
      windowCalls.push({ year, leap });
      return scenario.window === undefined
        ? new Date('2026-11-01T12:00:00Z')
        : scenario.window(year, leap);
    },
  });
  const audit: AuditRecord[] = [];
  const events: OutboxEventDraft[] = [];
  const run = (checkin: string, checkout: string, actor: Actor = titular) =>
    handler.execute({
      input: { second_home_id: HOME, checkin_date: checkin, checkout_date: checkout },
      actor,
      authorizationRef: 'holding:holding-1',
      operationId: 'op-1',
      now: NOW,
      tx: {},
      locks: new LockSequence(),
      audit: (record) => audit.push(record),
      emit: (event) => events.push(event),
    });
  return { handler, run, calls, consumed, occupancies, windowCalls, audit, events };
}

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'committed';
  } catch (error) {
    if (error instanceof CommandRejection) return error.code;
    throw error;
  }
};

describe('create_own_use_booking (aplicação, sem banco)', () => {
  it('[ADR-0026] sem a ativação, falha fechado antes de qualquer trava ou leitura', async () => {
    const h = harness({ activated: false });
    await expect(h.run('2027-03-10', '2027-03-12')).rejects.toBeInstanceOf(
      OwnUseBookingNotActivatedError,
    );
    expect(h.calls).toEqual(['activation']);
  });

  it('[TECH-051] sem party representada ou sem holding vigente → ERR_PERMISSION', async () => {
    expect(
      await code(harness().run('2027-03-10', '2027-03-12', { ...titular, actingPartyId: null })),
    ).toBe('ERR_PERMISSION');
    expect(await code(harness({ representation: null }).run('2027-03-10', '2027-03-12'))).toBe(
      'ERR_PERMISSION',
    );
  });

  it('[PD-002][TECH-053] Co-Owner: trava a Ação e depois as noites em ordem; por noite, reserved_right, consumo e ocupação', async () => {
    const h = harness();
    const result = await h.run('2027-03-10', '2027-03-12');
    expect(result).toMatchObject({
      booking_id: 'booking-1',
      nights: 2,
      consumed: { alta: 0, media: 2, leap: 0 },
    });
    expect(h.calls).toEqual([
      'activation',
      'representation',
      `stake:${STAKE}`,
      'nights:2027-03-10,2027-03-11',
      'booking',
      'reserve:2027-03-10',
      'reserve:2027-03-11',
    ]);
    expect(h.consumed).toEqual([
      { stayDate: '2027-03-10', exerciseYear: 2027, bucket: 'media' },
      { stayDate: '2027-03-11', exerciseYear: 2027, bucket: 'media' },
    ]);
    expect(h.occupancies.map((row) => row.custodyId)).toEqual([
      'reserved-2027-03-10',
      'reserved-2027-03-11',
    ]);
    expect(h.events).toEqual([
      expect.objectContaining({
        type: 'booking.own_use_confirmed',
        dedupKey: 'booking.own_use_confirmed:booking-1',
        payload: expect.objectContaining({ recipient_party_id: PARTY, nights: 2 }),
      }),
    ]);
    expect(h.audit).toEqual([
      expect.objectContaining({ objectType: 'booking', objectId: 'booking-1', before: null }),
    ]);
  });

  it('[REQ-037][REQ-035] Owner: sem trava de Ação, janela, saldo nem limite de 14; ocupa sobre owner', async () => {
    const h = harness({ representation: ownerHolding, holder: () => 'owner' });
    const result = await h.run('2027-03-01', addCivilDays('2027-03-01', 20));
    expect(result).toMatchObject({ nights: 20, consumed: null });
    expect(h.windowCalls).toEqual([]);
    expect(h.consumed).toEqual([]);
    expect(h.calls.some((call) => call.startsWith('stake:') || call.startsWith('reserve:'))).toBe(
      false,
    );
    expect(
      h.occupancies.every((row) => row.stakeId === null && row.custodyId.startsWith('custody-')),
    ).toBe(true);
  });

  it('[REQ-098] ordem das recusas: duração → capacidade → conflito → janela → saldo → adjacência', async () => {
    expect(await code(harness().run('2027-03-10', '2027-03-10'))).toBe('ERR_STAY_LENGTH');
    expect(
      await code(
        harness({ sealedUntil: '2027-01-01', window: () => null }).run('2027-03-01', '2027-03-16'),
      ),
    ).toBe('ERR_STAY_LENGTH');
    expect(
      await code(
        harness({ sealedUntil: '2027-03-10', window: () => null }).run('2027-03-10', '2027-03-12'),
      ),
    ).toBe('ERR_CAPACITY_UNAVAILABLE');
    expect(
      await code(
        harness({ occupied: ['2027-03-11'], window: () => null }).run('2027-03-10', '2027-03-12'),
      ),
    ).toBe('ERR_BOOKING_CONFLICT');
    expect(
      await code(
        harness({ window: () => null, remaining: { '2027:media': 0 } }).run(
          '2027-03-10',
          '2027-03-12',
        ),
      ),
    ).toBe('ERR_WINDOW_NOT_OPEN');
    expect(
      await code(
        harness({
          remaining: { '2027:media': 1 },
          neighbors: stayNights('2027-02-24', '2027-03-10'),
        }).run('2027-03-10', '2027-03-12'),
      ),
    ).toBe('ERR_USE_RIGHT_BALANCE');
    expect(
      await code(
        harness({ neighbors: stayNights('2027-02-24', '2027-03-10') }).run(
          '2027-03-10',
          '2027-03-12',
        ),
      ),
    ).toBe('ERR_STAY_LENGTH');
  });

  it('[TECH-043] a primeira noite já iniciada (check-in passado) → ERR_CAPACITY_UNAVAILABLE', async () => {
    expect(await code(harness().run('2027-02-28', '2027-03-02'))).toBe('ERR_CAPACITY_UNAVAILABLE');
  });

  it('[REQ-034][D4] custódia que não é spe_pool (Luxtory, reserved_right devolvido) → ERR_CAPACITY_UNAVAILABLE', async () => {
    expect(
      await code(
        harness({ holder: (date) => (date === '2027-03-11' ? 'luxtory' : 'spe_pool') }).run(
          '2027-03-10',
          '2027-03-12',
        ),
      ),
    ).toBe('ERR_CAPACITY_UNAVAILABLE');
    expect(await code(harness({ holder: () => 'use_right' }).run('2027-03-10', '2027-03-12'))).toBe(
      'ERR_CAPACITY_UNAVAILABLE',
    );
    expect(
      await code(
        harness({ representation: ownerHolding, holder: () => 'spe_pool' }).run(
          '2027-03-10',
          '2027-03-12',
        ),
      ),
    ).toBe('ERR_CAPACITY_UNAVAILABLE');
  });

  it('[INV-1][TECH-053] a custódia fechada por outra reserva entre a leitura e a escrita → ERR_BOOKING_CONFLICT', async () => {
    expect(await code(harness({ reserveFails: true }).run('2027-03-10', '2027-03-12'))).toBe(
      'ERR_BOOKING_CONFLICT',
    );
  });

  it('[EC-1][REQ-034] período que cruza exercício e categoria: janela e saldo de cada exercício, consumo noite a noite', async () => {
    const h = harness();
    await h.run('2027-12-30', '2028-01-02');
    expect(h.windowCalls).toEqual([
      { year: 2027, leap: false },
      { year: 2028, leap: false },
    ]);
    expect(h.consumed.map((row) => `${row.exerciseYear}:${row.bucket}`)).toEqual([
      '2027:alta',
      '2027:alta',
      '2028:alta',
    ]);
    expect(
      await code(
        harness({ window: (year) => (year === 2028 ? null : new Date('2026-11-01')) }).run(
          '2027-12-30',
          '2028-01-02',
        ),
      ),
    ).toBe('ERR_WINDOW_NOT_OPEN');
    expect(
      await code(harness({ remaining: { '2028:alta': 0 } }).run('2027-12-30', '2028-01-02')),
    ).toBe('ERR_USE_RIGHT_BALANCE');
  });

  it('[REQ-031][EC-4][TECH-027] o 29/02 consome o leap, abre na base (janela própria) e conta para a adjacência', async () => {
    const h = harness();
    const result = await h.run('2028-02-28', '2028-03-01');
    expect(result).toMatchObject({ consumed: { alta: 0, media: 1, leap: 1 } });
    expect(h.windowCalls).toEqual([
      { year: 2028, leap: false },
      { year: 2028, leap: true },
    ]);
    expect(
      await code(harness({ remaining: { '2028:leap': 0 } }).run('2028-02-29', '2028-03-01')),
    ).toBe('ERR_USE_RIGHT_BALANCE');
    expect(
      await code(
        harness({ neighbors: stayNights('2028-02-15', '2028-02-29') }).run(
          '2028-02-29',
          '2028-03-01',
        ),
      ),
    ).toBe('ERR_STAY_LENGTH');
    expect(
      await code(
        harness({ neighbors: stayNights('2028-02-16', '2028-02-29') }).run(
          '2028-02-29',
          '2028-03-01',
        ),
      ),
    ).toBe('committed');
  });
});
