import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  advanceSteps,
  cancellationTerms,
  closingEffect,
  isAllowedTransition,
  isTimelyCancellation,
  microsFromMillis,
  noShowWindowOpen,
  resolutionAllowed,
  timelyUntil,
  unstartedNights,
  type BookingState,
  type TransitionKind,
} from '@/features/booking/domain/own-use-lifecycle';

const STATES: readonly BookingState[] = [
  'confirmed',
  'in_use',
  'completed',
  'cancelled',
  'no_show',
  'in_exception',
];
const KINDS: readonly TransitionKind[] = [
  'advance',
  'cancellation',
  'no_show',
  'exception_opening',
  'exception_resolution',
  'invalidation',
];

/** Instante em µs a partir de um ISO com até 6 casas (sem passar por `Date`). */
const micros = (iso: string): bigint => Temporal.Instant.from(iso).epochNanoseconds / 1000n;
/** 14:00 locais do dia, no fuso da Second Home (03 §3.1). */
const checkin = (date: string, zone: string): bigint =>
  Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: zone, plainTime: '14:00' }).toInstant()
    .epochNanoseconds / 1000n;

describe('ciclo da reserva — domínio (W13 E2)', () => {
  it('[TECH-055] só os 13 pares da tabela por natureza; todo o resto é recusado', () => {
    const allowed = KINDS.flatMap((kind) =>
      STATES.flatMap((from) =>
        STATES.filter((to) => isAllowedTransition(kind, from, to)).map(
          (to) => `${kind}:${from}>${to}`,
        ),
      ),
    );

    expect(allowed).toEqual([
      'advance:confirmed>in_use',
      'advance:in_use>completed',
      'cancellation:confirmed>cancelled',
      'cancellation:in_use>cancelled',
      'cancellation:in_exception>cancelled',
      'no_show:confirmed>no_show',
      'no_show:in_use>no_show',
      'exception_opening:confirmed>in_exception',
      'exception_opening:in_use>in_exception',
      'exception_resolution:in_exception>confirmed',
      'exception_resolution:in_exception>completed',
      'exception_resolution:in_exception>cancelled',
      'invalidation:in_exception>cancelled',
    ]);
  });

  it('[REQ-080][TECH-043] 360 h sobre instantes: −1 µs e exato tempestivos, +1 µs tardio, sem perda de precisão', () => {
    const first = micros('2027-02-01T17:00:00Z');
    const limit = micros('2027-01-17T17:00:00Z');

    expect(timelyUntil(first)).toBe(limit);
    expect(isTimelyCancellation(first, limit - 1n)).toBe(true);
    expect(isTimelyCancellation(first, limit)).toBe(true);
    expect(isTimelyCancellation(first, limit + 1n)).toBe(false);
    // O relógio do servidor (ms) entra sem perda: só tem resolução menor.
    expect(microsFromMillis(Date.parse('2027-01-17T17:00:00.001Z'))).toBe(limit + 1000n);
  });

  it('[REQ-080][spec booking §10.4] fusos com e sem horário de verão: o limite é Instant.subtract({ hours: 360 })', () => {
    const cases = [
      ['2027-03-20', 'America/New_York'], // 360 h antes cruza a mudança de 14/03
      ['2027-11-10', 'America/New_York'], // cruza a volta de 07/11
      ['2027-04-05', 'Europe/Lisbon'], // cruza 28/03
      ['2027-02-01', 'America/Sao_Paulo'], // sem horário de verão: sempre 14:00
    ] as const;
    for (const [date, zone] of cases) {
      const first = checkin(date, zone);
      const expected =
        Temporal.Instant.fromEpochNanoseconds(first * 1000n).subtract({ hours: 360 })
          .epochNanoseconds / 1000n;

      expect(timelyUntil(first), `${date} ${zone}`).toBe(expected);
      expect(isTimelyCancellation(first, expected)).toBe(true);
      expect(isTimelyCancellation(first, expected + 1n)).toBe(false);
    }
    const saoPaulo = Temporal.Instant.fromEpochNanoseconds(
      timelyUntil(checkin('2027-02-01', 'America/Sao_Paulo')) * 1000n,
    ).toZonedDateTimeISO('America/Sao_Paulo');
    expect(saoPaulo.hour).toBe(14);
    const newYork = Temporal.Instant.fromEpochNanoseconds(
      timelyUntil(checkin('2027-03-20', 'America/New_York')) * 1000n,
    ).toZonedDateTimeISO('America/New_York');
    expect(newYork.hour).toBe(13);
  });

  it('[TECH-046][D8] no-show na janela estrita [1º check-in, check-out): antes e no check-out recusado, check-out − 1 µs aceito', () => {
    const first = micros('2027-02-01T17:00:00Z');
    const checkout = micros('2027-02-03T13:00:00Z');

    expect(noShowWindowOpen(first, checkout, first - 1n)).toBe(false);
    expect(noShowWindowOpen(first, checkout, first)).toBe(true);
    expect(noShowWindowOpen(first, checkout, checkout - 1n)).toBe(true);
    expect(noShowWindowOpen(first, checkout, checkout)).toBe(false);
  });

  it('[REQ-084] resolução sem cancelamento: confirmed só antes do check-out, completed só a partir dele', () => {
    const checkout = micros('2027-02-03T13:00:00Z');

    expect(resolutionAllowed('confirmed', checkout, checkout - 1n)).toBe(true);
    expect(resolutionAllowed('confirmed', checkout, checkout)).toBe(false);
    expect(resolutionAllowed('completed', checkout, checkout - 1n)).toBe(false);
    expect(resolutionAllowed('completed', checkout, checkout)).toBe(true);
  });

  it('[EC-10][REQ-080][REQ-081] termos: classe só no Co-Owner; primeira noite não iniciada; início parcial', () => {
    const nights = [
      { stayDate: '2027-02-02', checkinAt: micros('2027-02-02T17:00:00Z') },
      { stayDate: '2027-02-01', checkinAt: micros('2027-02-01T17:00:00Z') },
      { stayDate: '2027-02-03', checkinAt: micros('2027-02-03T17:00:00Z') },
    ];
    const during = micros('2027-02-02T17:00:00Z');

    expect(unstartedNights(nights, during).map((night) => night.stayDate)).toEqual(['2027-02-03']);
    expect(cancellationTerms('co_owner', nights, during)).toEqual({
      cancellationClass: 'late',
      firstAffectedDate: '2027-02-03',
    });
    expect(cancellationTerms('owner', nights, during)).toEqual({
      cancellationClass: null,
      firstAffectedDate: '2027-02-03',
    });
    expect(cancellationTerms('co_owner', nights, micros('2027-01-01T00:00:00Z'))).toEqual({
      cancellationClass: 'timely',
      firstAffectedDate: '2027-02-01',
    });
    expect(cancellationTerms('co_owner', nights, micros('2027-02-04T00:00:00Z'))).toEqual({
      cancellationClass: 'late',
      firstAffectedDate: null,
    });
    expect(cancellationTerms('co_owner', [], during)).toEqual({
      cancellationClass: null,
      firstAffectedDate: null,
    });
  });

  it('[spec booking §10.3][TECH-022][TECH-026] efeito por noite: sucessora e reversão pela natureza, classe e modalidade', () => {
    expect(closingEffect('co_owner', 'cancellation', 'timely')).toEqual({
      releaseReason: 'cancelled',
      successor: 'spe_pool',
      reversal: 'restore',
    });
    expect(closingEffect('co_owner', 'cancellation', 'late')).toEqual({
      releaseReason: 'cancelled',
      successor: 'forfeited_right',
      reversal: null,
    });
    expect(closingEffect('co_owner', 'no_show', null)).toEqual({
      releaseReason: 'no_show',
      successor: 'forfeited_right',
      reversal: null,
    });
    expect(closingEffect('co_owner', 'exception_resolution', 'timely')).toEqual({
      releaseReason: 'exception',
      successor: 'spe_pool',
      reversal: 'restore',
    });
    expect(closingEffect('co_owner', 'exception_resolution', 'late')).toEqual({
      releaseReason: 'exception',
      successor: 'forfeited_right',
      reversal: null,
    });
    expect(closingEffect('co_owner', 'invalidation', null)).toEqual({
      releaseReason: 'invalidation',
      successor: 'spe_pool',
      reversal: 'correction',
    });
    for (const kind of ['cancellation', 'no_show', 'exception_resolution', 'invalidation'] as const)
      expect(closingEffect('owner', kind, null)).toMatchObject({ successor: null, reversal: null });
  });
});

describe('ciclo da reserva — avanço do job (W13 E3)', () => {
  const first = 1_800_000_000_000_000n;
  const checkout = first + 20n * 3_600_000_000n;

  it('[TECH-055][spec booking §10.14] em uso a partir do 1º check-in; concluída a partir do check-out; fronteiras em µs', () => {
    expect(advanceSteps('confirmed', first, checkout, first - 1n)).toEqual([]);
    expect(advanceSteps('confirmed', first, checkout, first)).toEqual(['in_use']);
    expect(advanceSteps('confirmed', first, checkout, checkout - 1n)).toEqual(['in_use']);
    expect(advanceSteps('in_use', first, checkout, checkout - 1n)).toEqual([]);
    expect(advanceSteps('in_use', first, checkout, checkout)).toEqual(['completed']);
  });

  it('[TECH-055] atrasada: confirmed → in_use → completed na mesma passada', () => {
    expect(advanceSteps('confirmed', first, checkout, checkout)).toEqual(['in_use', 'completed']);
    expect(advanceSteps('confirmed', first, checkout, checkout + 86_400_000_000n)).toEqual([
      'in_use',
      'completed',
    ]);
  });

  it('[TECH-055][REQ-084] exceção e estados terminais nunca avançam, em qualquer instante', () => {
    for (const state of ['in_exception', 'completed', 'cancelled', 'no_show'] as const)
      for (const at of [first - 1n, first, checkout, checkout + 1n])
        expect(advanceSteps(state, first, checkout, at), `${state} ${at}`).toEqual([]);
  });
});
