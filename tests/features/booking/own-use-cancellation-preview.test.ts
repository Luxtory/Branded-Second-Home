import { describe, expect, it } from 'vitest';
import {
  bookingSection,
  displayState,
} from '@/features/booking/application/own-use-booking-sections';
import {
  cancellationPreview,
  type CancellationPreviewInput,
  type PreviewNight,
} from '@/features/booking/application/own-use-cancellation-preview';
import { cancellationTerms, timelyUntil } from '@/features/booking/domain/own-use-lifecycle';

// W13 E4b (spec booking §10.15): a prévia usa a mesma regra do command; matriz Owner/Co-Owner, P-A/P-B, noites iniciadas.
const HOUR = 3_600_000_000n;
const DAY = 24n * HOUR;
const T0 = 1_800_000_000_000_000n; // 1º check-in (µs)

const night = (offsetDays: number, bucket: PreviewNight['bucket'] = 'alta'): PreviewNight => ({
  stayDate: `2026-12-${String(11 + offsetDays).padStart(2, '0')}`,
  checkinAt: T0 + BigInt(offsetDays) * DAY,
  bucket,
  exerciseYear: 2026,
});
const NIGHTS = [night(0), night(1), night(2), night(3, 'media')];
const BALANCES = [
  { bucket: 'alta' as const, exerciseYear: 2026, granted: 10, remaining: 4 },
  { bucket: 'media' as const, exerciseYear: 2026, granted: 25, remaining: 18 },
];
const base = (over: Partial<CancellationPreviewInput> = {}): CancellationPreviewInput => ({
  modality: 'co_owner',
  state: 'confirmed',
  exceptionType: null,
  nights: NIGHTS,
  balances: BALANCES,
  lifecycleOpen: true,
  at: timelyUntil(T0),
  ...over,
});

describe('W13 E4b — prévia do cancelamento', () => {
  it('[REQ-080] Co-Owner dentro do prazo (−0 µs, inclusive): todas voltam ao saldo, saldo depois por categoria', () => {
    const preview = cancellationPreview(base());
    expect(preview).toMatchObject({
      kind: 'actionable',
      cancellationClass: 'timely',
      firstAffectedDate: '2026-12-11',
      timelyUntil: timelyUntil(T0),
      returning: 4,
    });
    expect(preview.balances).toEqual([
      { bucket: 'alta', exerciseYear: 2026, granted: 10, remaining: 4, returning: 3, after: 7 },
      { bucket: 'media', exerciseYear: 2026, granted: 25, remaining: 18, returning: 1, after: 19 },
    ]);
  });

  it('[REQ-080] Co-Owner +1 µs depois do prazo: nenhuma noite volta; saldo sem mudança', () => {
    const preview = cancellationPreview(base({ at: timelyUntil(T0) + 1n }));
    expect(preview).toMatchObject({ kind: 'actionable', cancellationClass: 'late', returning: 0 });
    expect(preview.balances.map((b) => [b.bucket, b.returning, b.after])).toEqual([
      ['alta', 0, 4],
      ['media', 0, 18],
    ]);
  });

  it('[EC-10] estadia iniciada: só as não iniciadas são afetadas (fora do prazo); iniciadas não mudam', () => {
    const preview = cancellationPreview(base({ state: 'in_use', at: T0 + DAY + 1n }));
    expect(preview.started.map((n) => n.stayDate)).toEqual(['2026-12-11', '2026-12-12']);
    expect(preview.affected.map((n) => n.stayDate)).toEqual(['2026-12-13', '2026-12-14']);
    expect(preview).toMatchObject({
      cancellationClass: 'late',
      firstAffectedDate: '2026-12-13',
      returning: 0,
    });
  });

  it('[REQ-081] Owner: sem classe, sem prazo, sem saldo; as não iniciadas voltam ao calendário do Owner', () => {
    const preview = cancellationPreview(
      base({ modality: 'owner', at: T0 + DAY + 1n, balances: [] }),
    );
    expect(preview).toMatchObject({
      kind: 'actionable',
      cancellationClass: null,
      timelyUntil: null,
      returning: null,
      balances: [],
    });
    expect(preview.affected).toHaveLength(2);
  });

  it('[REQ-084] apuração: Co-Owner dentro do prazo cancela; fora do prazo suspenso; Owner a qualquer tempo', () => {
    const pb = { state: 'in_exception' as const, exceptionType: 'unauthorized_booking' as const };
    expect(cancellationPreview(base(pb)).kind).toBe('actionable');
    expect(cancellationPreview(base({ ...pb, at: timelyUntil(T0) + 1n })).kind).toBe('suspended');
    expect(
      cancellationPreview(base({ ...pb, modality: 'owner', at: T0 + DAY + 1n, balances: [] })).kind,
    ).toBe('actionable');
  });

  it('[PD-010] exceção operacional: regras normais (fora do prazo segue acionável, sem saldo devolvido)', () => {
    const pa = { state: 'in_exception' as const, exceptionType: 'operational' as const };
    expect(cancellationPreview(base({ ...pa, at: timelyUntil(T0) + 1n }))).toMatchObject({
      kind: 'actionable',
      cancellationClass: 'late',
      returning: 0,
    });
  });

  it('[ADR-0027 §5] K2 ausente → closed; todas iniciadas → nothing_left; estado terminal → not_cancellable', () => {
    expect(cancellationPreview(base({ lifecycleOpen: false })).kind).toBe('closed');
    expect(cancellationPreview(base({ at: T0 + 4n * DAY })).kind).toBe('nothing_left');
    for (const state of ['cancelled', 'no_show', 'completed'] as const)
      expect(cancellationPreview(base({ state })).kind).toBe('not_cancellable');
  });

  it('[D7] termos da prévia = termos do command no mesmo instante (classe e primeira noite afetada)', () => {
    for (const at of [timelyUntil(T0), timelyUntil(T0) + 1n, T0, T0 + DAY + 1n, T0 + 4n * DAY]) {
      const preview = cancellationPreview(base({ at }));
      expect({
        cancellationClass: preview.cancellationClass,
        firstAffectedDate: preview.firstAffectedDate,
      }).toEqual(cancellationTerms('co_owner', NIGHTS, at));
    }
  });

  it('[D7] recusa por termos: os fatos atuais da tela nas fronteiras — prazo terminado só +1 µs depois do limite; noite iniciada a partir do check-in (inclusive)', () => {
    const at = (instant: bigint) => cancellationPreview(base({ at: instant }));
    // A tela da recusa mostra só estes fatos do servidor, nunca os termos que o navegador enviou: provam a regra
    // temporal atual, não a prévia anterior.
    expect(at(timelyUntil(T0))).toMatchObject({ cancellationClass: 'timely', started: [] });
    expect(at(timelyUntil(T0) + 1n)).toMatchObject({ cancellationClass: 'late', started: [] });
    expect(at(T0 - 1n)).toMatchObject({ started: [], firstAffectedDate: '2026-12-11' });
    expect(at(T0).started.map((n) => n.stayDate)).toEqual(['2026-12-11']);
    expect(at(T0).firstAffectedDate).toBe('2026-12-12');
  });
});

describe('W13 E4b — seções e situação da lista', () => {
  const start = new Date('2026-11-03T17:00:00Z');
  const before = new Date('2026-11-03T16:59:59Z');
  it('[REQ-096] seção pelo período e pela transição gravada; job atrasado: começada segue "Confirmada"', () => {
    expect(bookingSection('confirmed', start, before)).toBe('upcoming');
    expect(bookingSection('confirmed', start, start)).toBe('in_progress');
    expect(displayState('confirmed', { exceptionType: null, cancellationClass: null })).toBe(
      'confirmed',
    );
    expect(bookingSection('in_use', start, before)).toBe('in_progress');
    expect(bookingSection('in_exception', start, before)).toBe('attention');
    for (const state of ['completed', 'cancelled', 'no_show'] as const)
      expect(bookingSection(state, start, before)).toBe('history');
  });

  it('[REQ-060][REQ-096] W20: reserva encerrada pela cessão ao Luxchange aparece como cedida, nunca como cancelamento', () => {
    expect(
      displayState('cancelled', {
        exceptionType: null,
        cancellationClass: null,
        lastKind: 'cession',
      }),
    ).toBe('ceded');
    // Sem a natureza da última transição, o comportamento da W13 não muda.
    expect(
      displayState('cancelled', {
        exceptionType: null,
        cancellationClass: 'timely',
        lastKind: 'cancellation',
      }),
    ).toBe('cancelled_timely');
    expect(displayState('cancelled', { exceptionType: null, cancellationClass: null })).toBe(
      'cancelled',
    );
  });

  it('[REQ-096][REQ-084] P-A e P-B pelo registro da exceção; classificação do cancelamento gravada', () => {
    expect(
      displayState('in_exception', { exceptionType: 'operational', cancellationClass: null }),
    ).toBe('operational_exception');
    expect(
      displayState('in_exception', {
        exceptionType: 'unauthorized_booking',
        cancellationClass: null,
      }),
    ).toBe('unauthorized_review');
    expect(displayState('cancelled', { exceptionType: null, cancellationClass: 'late' })).toBe(
      'cancelled_late',
    );
    expect(displayState('cancelled', { exceptionType: null, cancellationClass: null })).toBe(
      'cancelled',
    );
  });
});
