import { describe, expect, it } from 'vitest';
import type {
  OwnUseFacts,
  SealedOwnUseNight,
} from '@/features/booking/application/create-own-use-booking';
import {
  previewOwnUseBooking,
  type PreviewHolding,
} from '@/features/booking/application/preview-own-use-booking';
import { stayNights } from '@/features/booking/domain/own-use-stay';

// Prévia da reserva (W12, spec booking §7): as mesmas regras do command, sem travas nem escrita, reunindo todos os
// motivos. Dublês das portas — a fidelidade ao banco está nos testes db (PostgreSQL real).
const NOW = new Date('2027-03-01T12:00:00.000Z');
const HOME = 'home-1';
const STAKE = 'stake-1';
const coOwner: PreviewHolding = {
  holdingId: 'holding-1',
  secondHomeId: HOME,
  role: 'co_owner',
  stakeId: STAKE,
};
const owner: PreviewHolding = {
  holdingId: 'holding-o',
  secondHomeId: HOME,
  role: 'owner',
  stakeId: null,
};
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
  sealedFrom?: string;
  sealedUntil?: string;
  holder?: (date: string) => string;
  occupied?: readonly string[];
  own?: readonly string[];
  window?: (year: number, leap: boolean) => Date | null;
  remaining?: Record<string, number>;
  facts?: OwnUseFacts | null;
}

function preview(
  holding: PreviewHolding,
  checkin: string,
  checkout: string,
  scenario: Scenario = {},
) {
  const sealedFrom = scenario.sealedFrom ?? '2027-01-01';
  const sealedUntil = scenario.sealedUntil ?? '2028-12-31';
  const root = holding.role === 'owner' ? 'owner' : 'spe_pool';
  return previewOwnUseBooking<object>(
    {
      store: {
        sealedNights: async (_tx, _home, from, to) =>
          stayNights(from, to)
            .filter((date) => date >= sealedFrom && date <= sealedUntil)
            .map(night),
        // Adjacência pela Ação (BR-112) e reserva da própria holding (motivo específico): o mesmo cenário nos dublês.
        ownUseNights: async (_tx, _stake, from, to) =>
          (scenario.own ?? []).filter((date) => date >= from && date < to),
        holdingOwnUseNights: async (_tx, _holding, from, to) =>
          (scenario.own ?? []).filter((date) => date >= from && date < to),
      },
      inventory: {
        nightStates: async (_tx, _home, dates) =>
          dates.map((date) => ({
            stayDate: date,
            custodyId: `custody-${date}`,
            holderKind: scenario.holder?.(date) ?? root,
            basis: null,
            stakeId: null,
            occupied: (scenario.occupied ?? []).includes(date),
          })),
      },
      rights: {
        remaining: async (_tx, _stake, keys) =>
          new Map(
            keys.map((key) => {
              const id = `${key.exerciseYear}:${key.bucket}`;
              return [id, scenario.remaining?.[id] ?? 100] as const;
            }),
          ),
      },
      findFacts: async () => (scenario.facts === undefined ? facts : scenario.facts),
      windowOpensAt: (_facts, _stake, year, leap) =>
        scenario.window ? scenario.window(year, leap) : new Date('2026-09-15T03:00:00Z'),
    },
    {},
    { holding, checkinDate: checkin, checkoutDate: checkout, now: NOW },
  );
}

describe('prévia da reserva de uso próprio (spec booking §7)', () => {
  it('[REQ-034][PD-002] período válido: noites sem a da saída, consumo por exercício e categoria', async () => {
    const result = await preview(coOwner, '2027-03-10', '2027-03-12');
    expect(result).toEqual({
      ok: true,
      nights: ['2027-03-10', '2027-03-11'],
      usage: [{ exerciseYear: 2027, bucket: 'media', nights: 2, remaining: 100 }],
      stay: 2,
      issues: [],
    });
  });

  it('[PD-002] saída antes ou igual à entrada → motivo de ordem, sem consultas', async () => {
    expect(await preview(coOwner, '2027-03-12', '2027-03-12')).toMatchObject({
      ok: false,
      issues: [{ code: 'order' }],
    });
  });

  it('[P-14] noite fora do calendário selado → motivo "fora do calendário" com as datas', async () => {
    expect(await preview(coOwner, '2028-12-30', '2029-01-02')).toMatchObject({
      ok: false,
      issues: [{ code: 'outside', dates: ['2029-01-01'] }],
    });
  });

  it('[TECH-043] noite já iniciada, noite indisponível e reserva da própria Ação: todos os motivos de uma vez', async () => {
    const result = await preview(coOwner, '2027-02-28', '2027-03-06', {
      occupied: ['2027-03-02', '2027-03-04'],
      own: ['2027-03-04'],
      holder: (date) => (date === '2027-03-05' ? 'luxtory' : 'spe_pool'),
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { code: 'started', dates: ['2027-02-28'] },
      { code: 'own_booking', dates: ['2027-03-04'] },
      { code: 'unavailable', dates: ['2027-03-02', '2027-03-05'] },
    ]);
  });

  it('[TECH-042] janela não aberta (ou sem janela) por exercício, com o instante de abertura', async () => {
    const result = await preview(coOwner, '2027-12-30', '2028-01-02', {
      window: (year) => (year === 2028 ? new Date('2027-09-15T03:00:00Z') : null),
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { code: 'window', exerciseYear: 2027, opensAt: null },
        { code: 'window', exerciseYear: 2028, opensAt: '2027-09-15T03:00:00.000Z' },
      ]),
    );
    expect(await preview(coOwner, '2027-03-10', '2027-03-11', { facts: null })).toMatchObject({
      issues: [{ code: 'window', exerciseYear: 2027, opensAt: null }],
    });
  });

  it('[REQ-031][PD-004] 29/02 sem atribuição à Ação → "não atribuído"; com saldo, não desconta do ordinário', async () => {
    const without = await preview(coOwner, '2028-02-28', '2028-03-01', {
      remaining: { '2028:leap': 0 },
    });
    expect(without.issues).toEqual([{ code: 'leap_not_attributed', date: '2028-02-29' }]);
    const attributed = await preview(coOwner, '2028-02-28', '2028-03-01', {
      remaining: { '2028:leap': 1 },
    });
    expect(attributed).toMatchObject({
      ok: true,
      usage: [
        { exerciseYear: 2028, bucket: 'media', nights: 1 },
        { exerciseYear: 2028, bucket: 'leap', nights: 1, remaining: 1 },
      ],
    });
  });

  it('[REQ-034][EC-4] saldo insuficiente na categoria: quanto o período usa e quanto resta', async () => {
    const result = await preview(coOwner, '2027-07-10', '2027-07-13', {
      remaining: { '2027:alta': 1 },
    });
    expect(result.issues).toEqual([
      { code: 'balance', exerciseYear: 2027, bucket: 'alta', needed: 3, remaining: 1 },
    ]);
  });

  it('[BR-111][BR-112] permanência acima de 14 noites, sozinha ou somando a reserva adjacente da Ação', async () => {
    expect(await preview(coOwner, '2027-03-01', '2027-03-16')).toMatchObject({
      ok: false,
      stay: 15,
      issues: expect.arrayContaining([{ code: 'stay_length', stay: 15, adjacent: false }]),
    });
    const adjacent = await preview(coOwner, '2027-03-10', '2027-03-20', {
      own: ['2027-03-05', '2027-03-06', '2027-03-07', '2027-03-08', '2027-03-09'],
    });
    expect(adjacent.issues).toEqual([{ code: 'stay_length', stay: 15, adjacent: true }]);
  });

  it('[REQ-037][REQ-035] Owner: sem janela, saldo nem limite de permanência; só custódia `owner` livre', async () => {
    const long = await preview(owner, '2027-03-01', '2027-04-01');
    expect(long).toMatchObject({ ok: true, usage: [], stay: 31, issues: [] });
    const blocked = await preview(owner, '2027-03-01', '2027-03-03', {
      holder: (date) => (date === '2027-03-02' ? 'spe_pool' : 'owner'),
    });
    expect(blocked.issues).toEqual([{ code: 'unavailable', dates: ['2027-03-02'] }]);
    // Sobre a própria reserva: motivo funcional específico, não indisponibilidade genérica.
    const own = await preview(owner, '2027-04-10', '2027-04-12', {
      own: ['2027-04-10', '2027-04-11'],
    });
    expect(own.issues).toEqual([{ code: 'own_booking', dates: ['2027-04-10', '2027-04-11'] }]);
  });
});
