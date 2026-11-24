import { describe, expect, it } from 'vitest';
import { buildDepositConsumers } from '@/features/luxchange/application/deposit-consumers';
import { creditsOriginatedEvent } from '@/features/luxchange/application/deposit-events';
import {
  bookingNights,
  DEPOSIT_MIN_NOTICE_HOURS,
  evaluateDeposit,
  nightAvailability,
  sameCredits,
  sameNightCredits,
  sumCredits,
  withinNotice,
  type DepositBookingFacts,
  type DepositHolding,
  type DepositNightFacts,
} from '@/features/luxchange/domain/deposit';

const NOW = Date.parse('2027-01-01T12:00:00.000Z');
const FAR = '2027-03-10T17:00:00.000Z';
const owner: DepositHolding = { id: 'h-owner', modality: 'owner', stakeId: null };
const co: DepositHolding = { id: 'h-co', modality: 'co_owner', stakeId: 's-1' };

const night = (stayDate: string, partial: Partial<DepositNightFacts> = {}): DepositNightFacts => ({
  stayDate,
  checkinAt: FAR,
  custody: { holderKind: 'owner', stakeId: null, basis: null, inventoryOrigin: null },
  occupancy: null,
  ...partial,
});
const reserved = (stayDate: string, bookingId: string): DepositNightFacts =>
  night(stayDate, {
    custody: {
      holderKind: 'use_right',
      stakeId: 's-1',
      basis: 'reserved_right',
      inventoryOrigin: null,
    },
    occupancy: { bookingId, channel: 'own_use' },
  });
const booking = (
  id: string,
  checkinDate: string,
  checkoutDate: string,
  extra: Partial<DepositBookingFacts> = {},
) => ({
  id,
  holdingId: 'h-co',
  stakeId: 's-1',
  channel: 'own_use',
  state: 'confirmed',
  checkinDate,
  checkoutDate,
  ...extra,
});

describe('W20 — regras puras do depósito (REQ-051, REQ-060, TECH-043)', () => {
  it('[TECH-043] antecedência de 14 dias em instantes: a fronteira é inclusiva', () => {
    const checkin = Date.parse(FAR);
    const limit = checkin - DEPOSIT_MIN_NOTICE_HOURS * 3_600_000;
    expect(DEPOSIT_MIN_NOTICE_HOURS).toBe(14 * 24);
    expect(withinNotice(FAR, limit)).toBe(true);
    expect(withinNotice(FAR, limit + 1)).toBe(false);
  });

  it('[REQ-051][TECH-023] Owner: só capacidade própria livre; reservada pede cancelamento antes', () => {
    const none = () => undefined;
    expect(nightAvailability(owner, night('2027-03-10'), none, NOW)).toEqual({
      kind: 'eligible',
      bookingId: null,
    });
    expect(
      nightAvailability(
        owner,
        night('2027-03-10', { occupancy: { bookingId: 'b', channel: 'own_use' } }),
        none,
        NOW,
      ),
    ).toEqual({ kind: 'booked' });
    expect(
      nightAvailability(
        owner,
        night('2027-03-10', {
          custody: {
            holderKind: 'luxtory',
            stakeId: null,
            basis: null,
            inventoryOrigin: 'luxchange_cession',
          },
        }),
        none,
        NOW,
      ),
    ).toEqual({ kind: 'ceded' });
    expect(
      nightAvailability(
        owner,
        night('2027-03-10', { checkinAt: '2027-01-10T17:00:00.000Z' }),
        none,
        NOW,
      ),
    ).toEqual({ kind: 'notice' });
    expect(
      nightAvailability(
        owner,
        night('2027-03-10', {
          custody: {
            holderKind: 'luxtory',
            stakeId: null,
            basis: null,
            inventoryOrigin: 'annual_allocation',
          },
        }),
        none,
        NOW,
      ),
    ).toEqual({ kind: 'unavailable' });
  });

  it('[REQ-060][BR-151] Co-Owner: só data reservada da própria reserva confirmada', () => {
    const b = booking('b-1', '2027-03-10', '2027-03-12');
    const of = (id: string) => (id === 'b-1' ? b : undefined);
    expect(nightAvailability(co, reserved('2027-03-10', 'b-1'), of, NOW)).toEqual({
      kind: 'eligible',
      bookingId: 'b-1',
    });
    expect(
      nightAvailability(
        co,
        night('2027-03-10', {
          custody: { holderKind: 'spe_pool', stakeId: null, basis: null, inventoryOrigin: null },
        }),
        of,
        NOW,
      ),
    ).toEqual({ kind: 'not_reserved' });
    for (const other of [
      booking('b-1', '2027-03-10', '2027-03-12', { state: 'in_exception' }),
      booking('b-1', '2027-03-10', '2027-03-12', { holdingId: 'h-other' }),
    ])
      expect(nightAvailability(co, reserved('2027-03-10', 'b-1'), () => other, NOW)).toEqual({
        kind: 'unavailable',
      });
    expect(
      nightAvailability(
        co,
        night('2027-03-10', {
          custody: {
            holderKind: 'use_right',
            stakeId: 's-1',
            basis: 'forfeited_right',
            inventoryOrigin: null,
          },
        }),
        of,
        NOW,
      ),
    ).toEqual({ kind: 'unavailable' });
  });

  it('[ADR-0036 §2] Co-Owner cede reservas inteiras; parcial é recusada', () => {
    const b = booking('b-1', '2027-03-10', '2027-03-12');
    const facts = [reserved('2027-03-10', 'b-1'), reserved('2027-03-11', 'b-1')];
    expect(
      evaluateDeposit({
        holding: co,
        selected: ['2027-03-10'],
        nights: facts,
        bookings: [b],
        nowMs: NOW,
      }),
    ).toEqual({
      ok: false,
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
    expect(
      evaluateDeposit({
        holding: co,
        selected: ['2027-03-10', '2027-03-11'],
        nights: facts,
        bookings: [b],
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, bookings: [b] });
  });

  it('[REQ-098] ordem das recusas: noite não selada e antecedência antes da disponibilidade', () => {
    expect(
      evaluateDeposit({
        holding: owner,
        selected: ['2027-03-10'],
        nights: [],
        bookings: [],
        nowMs: NOW,
      }),
    ).toEqual({
      ok: false,
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
    const facts = [
      night('2027-01-05', { checkinAt: '2027-01-05T17:00:00.000Z' }),
      night('2027-03-10', { occupancy: { bookingId: 'b', channel: 'own_use' } }),
    ];
    expect(
      evaluateDeposit({
        holding: owner,
        selected: ['2027-01-05', '2027-03-10'],
        nights: facts,
        bookings: [],
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, code: 'ERR_MIN_NOTICE' });
  });

  it('[TECH-033] Créditos somados e comparados exatamente, sem Number', () => {
    expect(sumCredits([])).toBe('0');
    expect(sumCredits(['0.1', '0.2'])).toBe('0.3');
    expect(sumCredits(['1234.5', '987.65', '1'])).toBe('2223.15');
    expect(sumCredits(['9007199254740993', '1'])).toBe('9007199254740994');
    expect(sameCredits('12.5', '12.50')).toBe(false);
    expect(sameCredits('12.5', '12.5')).toBe(true);
    expect(sameCredits('abc', '1')).toBe(false);
    expect(() => sumCredits(['1.0'])).toThrow(RangeError);
  });

  it('[ADR-0036 §8] termos por noite: mesma quantidade e igualdade exata em cada data, na ordem das datas', () => {
    expect(sameNightCredits(['4000', '6000'], ['4000', '6000'])).toBe(true);
    // Mesma soma, valores trocados ou redistribuídos entre as datas: não são os termos revisados.
    expect(sameNightCredits(['4000', '6000'], ['6000', '4000'])).toBe(false);
    expect(sameNightCredits(['4000', '6000'], ['4500', '5500'])).toBe(false);
    expect(sameNightCredits(['4000'], ['4000', '6000'])).toBe(false);
    expect(sameNightCredits(['1234.5'], ['1234.50'])).toBe(false);
  });

  it('noites de uma reserva em datas civis, atravessando o fim do mês', () => {
    expect(bookingNights({ checkinDate: '2027-02-27', checkoutDate: '2027-03-02' })).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
    ]);
  });

  it('[REQ-097][TECH-091] o consumidor grava uma notificação só com datas, contagem, quantidade e a operação', async () => {
    const drafts: unknown[] = [];
    const [consumer] = buildDepositConsumers<null>({
      clock: { now: () => new Date('2027-01-01T00:00:00Z') },
      notify: async (_tx, draft) => {
        drafts.push(draft);
        return true;
      },
    });
    const event = creditsOriginatedEvent({
      lot_id: '00000000-0000-4000-8000-000000000001',
      recipient_party_id: '00000000-0000-4000-8000-000000000002',
      second_home_id: '00000000-0000-4000-8000-000000000003',
      nights: 2,
      first_night: '2027-03-10',
      last_night: '2027-03-12',
      credits: '2469.12',
      expires_at: '2028-09-01T12:00:00.000Z',
    });
    expect(event.dedupKey).toBe(
      'luxchange.credits_originated:00000000-0000-4000-8000-000000000001',
    );
    await consumer!.handle(
      {
        id: '00000000-0000-4000-8000-000000000009',
        type: event.type,
        dedupKey: event.dedupKey,
        operationId: '00000000-0000-4000-8000-000000000010',
        occurredAt: new Date(),
        payload: event.payload,
      },
      null,
    );
    expect(drafts).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000009',
        recipientPartyId: '00000000-0000-4000-8000-000000000002',
        kind: 'luxchange.deposit_completed',
        data: {
          second_home_id: '00000000-0000-4000-8000-000000000003',
          operation_id: '00000000-0000-4000-8000-000000000010',
          nights: 2,
          first_night: '2027-03-10',
          last_night: '2027-03-12',
          credits: '2469.12',
          expires_at: '2028-09-01T12:00:00.000Z',
        },
        at: new Date('2027-01-01T00:00:00Z'),
      },
    ]);
    await expect(
      consumer!.handle(
        {
          id: 'x',
          type: event.type,
          dedupKey: 'x',
          operationId: 'y',
          occurredAt: new Date(),
          payload: { lot_id: 1 },
        },
        null,
      ),
    ).rejects.toThrow();
  });
});
