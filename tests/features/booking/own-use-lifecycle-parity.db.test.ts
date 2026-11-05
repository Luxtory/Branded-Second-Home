import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closingEffect,
  isTimelyCancellation,
  noShowWindowOpen,
  RELEASE_REASON,
  timelyUntil,
  type ClosingKind,
} from '@/features/booking/domain/own-use-lifecycle';
import { microsToIso } from '@/features/booking/infrastructure/lifecycle-instants';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

/** 14:00 locais do dia no fuso (03 §3.1), em µs. */
const checkin = (date: string, zone: string): bigint =>
  Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: zone, plainTime: '14:00' }).toInstant()
    .epochNanoseconds / 1000n;

/**
 * Gêmeas TypeScript × funções SQL da E1 (spec booking §10.4, §10.12 D10), no PostgreSQL real e ao microssegundo: o
 * banco é a autoridade; a gêmea serve à prévia e à recusa antecipada, e só é aceita se for idêntica.
 */
describe('W13 E2 — equivalência das regras do ciclo com o SQL (µs)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(() => db.drop());

  it('[TECH-040][D10] leitura exata do instante em µs (sem Date) e escrita ISO com 6 casas', async () => {
    const value = 1_801_234_567_890_123n;
    const { rows } = await db.pool.query<{ back: string; iso: string }>(
      `SELECT (extract(epoch FROM $1::timestamptz) * 1000000)::bigint::text AS back,
              to_char($1::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS iso`,
      [microsToIso(value)],
    );

    expect(BigInt(rows[0]!.back)).toBe(value);
    expect(rows[0]!.iso).toBe(microsToIso(value));
  });

  it('[REQ-080][spec booking §10.4] 360 h: grade −1 µs / exato / +1 µs em fusos com e sem horário de verão', async () => {
    const zones = [
      ['2027-03-20', 'America/New_York'],
      ['2027-11-10', 'America/New_York'],
      ['2027-04-05', 'Europe/Lisbon'],
      ['2027-02-01', 'America/Sao_Paulo'],
      ['2028-02-29', 'America/Sao_Paulo'],
    ] as const;
    for (const [date, zone] of zones) {
      const first = checkin(date, zone);
      const sqlFirst = await db.pool.query<{ us: string }>(
        `SELECT (extract(epoch FROM app.local_instant($1::date + time '14:00', $2)) * 1000000)::bigint::text AS us`,
        [date, zone],
      );
      expect(BigInt(sqlFirst.rows[0]!.us), `${date} ${zone}`).toBe(first);
      for (const offset of [-3_600_000_000n, -1n, 0n, 1n, 3_600_000_000n]) {
        const at = timelyUntil(first) + offset;
        const { rows } = await db.pool.query<{ timely: boolean }>(
          `SELECT app.own_use_cancellation_timely($1::timestamptz, $2::timestamptz) AS timely`,
          [microsToIso(first), microsToIso(at)],
        );
        expect(rows[0]!.timely, `${date} ${zone} ${offset}`).toBe(isTimelyCancellation(first, at));
      }
    }
  });

  it('[TECH-046] janela do no-show idêntica ao SQL nas fronteiras', async () => {
    const first = checkin('2027-02-01', 'America/Sao_Paulo');
    const { rows: out } = await db.pool.query<{ us: string }>(
      `SELECT (extract(epoch FROM app.booking_checkout_at('2027-02-03', 'America/Sao_Paulo')) * 1000000)::bigint::text
         AS us`,
    );
    const checkout = BigInt(out[0]!.us);
    for (const at of [first - 1n, first, checkout - 1n, checkout]) {
      const { rows } = await db.pool.query<{ open: boolean }>(
        `SELECT app.booking_no_show_window_open($1::timestamptz, $2::timestamptz, $3::timestamptz) AS open`,
        [microsToIso(first), microsToIso(checkout), microsToIso(at)],
      );
      expect(rows[0]!.open).toBe(noShowWindowOpen(first, checkout, at));
    }
  });

  it('[spec booking §10.3] motivo da liberação e sucessora idênticos às funções do banco', async () => {
    const kinds: readonly ClosingKind[] = [
      'cancellation',
      'no_show',
      'exception_resolution',
      'invalidation',
    ];
    for (const kind of kinds) {
      const reason = await db.pool.query<{ reason: string }>(
        `SELECT app.booking_release_reason($1) AS reason`,
        [kind],
      );
      expect(reason.rows[0]!.reason).toBe(RELEASE_REASON[kind]);
      for (const cancellationClass of ['timely', 'late', null] as const) {
        const { rows } = await db.pool.query<{ successor: string }>(
          `SELECT app.own_use_reserved_right_successor(ROW(gen_random_uuid(), gen_random_uuid(), NULL, 'confirmed',
             'cancelled', $1, gen_random_uuid(), now(), $2, NULL, NULL)::app.booking_state_transition) AS successor`,
          [kind, cancellationClass],
        );
        expect(rows[0]!.successor, `${kind} ${cancellationClass}`).toBe(
          closingEffect('co_owner', kind, cancellationClass).successor,
        );
      }
    }
  });
});
