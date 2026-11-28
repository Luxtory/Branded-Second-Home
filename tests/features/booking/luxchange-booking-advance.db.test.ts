import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAdvanceBookingStatesJob,
  createFlagNoShowCandidatesJob,
} from '@/features/booking/jobs';
import { createPostgresBookingLifecycleStore } from '@/features/booking/infrastructure/postgres-booking-lifecycle-store';
import { createAcceptRequestProductionHandler } from '@/features/luxchange';
import { JOB_SOURCE } from '../calendar/sealing-support';
import { creditsHarness, type CreditsHarness } from '../credits/credits-support';
import { requestApp } from '../luxchange/request-app-support';
import {
  newRequester,
  pricedNights,
  requestFixture,
  sendRequest,
  type RequestFixture,
} from '../luxchange/request-support';
import { fundRequestCredits } from '../luxchange/w22-support';
import { activate, asOperation, insertTransition } from './lifecycle-support';

describe('W22 E2 — avanço da reserva Luxchange pelo job existente', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  const pool = () => c.h.database.pool;

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_lifecycle');
  }, 240_000);
  afterAll(async () => c?.h.close());

  async function acceptedBooking() {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '500');
    const nights = await pricedNights(f, [5_000n]);
    const sent = await sendRequest(f, {
      requester,
      holder: f.holder,
      nights,
      holds: [{ lotId, quantity: '500' }],
    });
    const result = await requestApp(f).executorFor(f.holder)(
      createAcceptRequestProductionHandler(c.h.db),
      {
        request_id: sent.requestId,
        party_id: f.holder.partyId,
        expected_credits: '500',
      },
    );
    if (result.status !== 'committed') throw new Error(`Expected acceptance: ${result.code}`);
    return { id: result.result.receipt.booking_id, requester };
  }

  async function passBookingBoundary(id: string, checkoutReached: boolean) {
    await pool().query(
      `INSERT INTO public.booking_test_period (booking_id, first_checkin_at, checkout_at)
       SELECT $1, clock_timestamp() - interval '2 days',
              CASE WHEN $2 THEN clock_timestamp() - interval '1 day' ELSE p.checkout_at END
         FROM public.booking_test_actual_period($1) p
       ON CONFLICT (booking_id) DO UPDATE SET checkout_at = EXCLUDED.checkout_at`,
      [id, checkoutReached],
    );
  }

  const stateOf = async (id: string) =>
    (await pool().query<{ state: string }>('SELECT state FROM app.booking WHERE id=$1', [id]))
      .rows[0]!.state;
  const history = async (id: string) =>
    (
      await pool().query<{
        id: string;
        kind: string;
        from_state: string;
        to_state: string;
        operation_id: string;
      }>(
        `SELECT t.id,t.kind,t.from_state,t.to_state,t.operation_id FROM app.booking_state_transition t
    LEFT JOIN app.booking_state_transition predecessor ON predecessor.id=t.previous_transition_id
    WHERE t.booking_id=$1 ORDER BY predecessor.id NULLS FIRST`,
        [id],
      )
    ).rows;

  it('[REQ-096][TECH-055][TECH-090] avança no check-in e no check-out, e executa em atraso uma única vez', async () => {
    const normal = await acceptedBooking();
    const late = await acceptedBooking();
    const env = {
      database: c.h.db,
      log: c.h.jobLog,
      source: { ...JOB_SOURCE, COMMAND_LOCK_TIMEOUT_MS: '20000' },
    };
    const run = () => createAdvanceBookingStatesJob(env)({ correlationId: randomUUID() });
    expect(await run()).toMatchObject({ processed: 0, failed: 0 });
    expect(await stateOf(normal.id)).toBe('confirmed');
    expect(await history(normal.id)).toEqual([]);
    const { rows: period } = await pool().query<{ ddl: string }>(
      `SELECT pg_get_functiondef('app.booking_period_instants(uuid)'::regprocedure) AS ddl`,
    );
    // Shift the two fixture periods in this database. The job and triggers still compare against the live clock.
    await pool().query(`CREATE TABLE public.booking_test_period (
        booking_id uuid PRIMARY KEY, first_checkin_at timestamptz NOT NULL, checkout_at timestamptz NOT NULL)`);
    await pool().query('GRANT SELECT ON public.booking_test_period TO luxtory_app');
    await pool().query(
      period[0]!.ddl.replace('app.booking_period_instants(', 'public.booking_test_actual_period('),
    );
    try {
      await pool().query(`CREATE OR REPLACE FUNCTION app.booking_period_instants(p_booking uuid,
          OUT first_checkin_at timestamptz, OUT last_checkin_at timestamptz, OUT checkout_at timestamptz)
        LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
          SELECT p.first_checkin_at, p.first_checkin_at, p.checkout_at
          FROM public.booking_test_period p WHERE p.booking_id = p_booking
          UNION ALL
          SELECT i.* FROM public.booking_test_actual_period(p_booking) i
          WHERE NOT EXISTS (SELECT 1 FROM public.booking_test_period p WHERE p.booking_id = p_booking)
        $$`);
      await passBookingBoundary(normal.id, false);
      expect(await run()).toMatchObject({ processed: 1, transitions: 1, failed: 0 });
      expect(await stateOf(normal.id)).toBe('in_use');
      expect(await stateOf(late.id)).toBe('confirmed');
      expect(
        await createFlagNoShowCandidatesJob(env)({ correlationId: randomUUID() }),
      ).toMatchObject({ processed: 0, failed: 0 });

      await passBookingBoundary(normal.id, true);
      expect(await run()).toMatchObject({ processed: 1, transitions: 1, failed: 0 });
      expect(await stateOf(normal.id)).toBe('completed');
      expect((await history(normal.id)).map((t) => [t.kind, t.from_state, t.to_state])).toEqual([
        ['advance', 'confirmed', 'in_use'],
        ['advance', 'in_use', 'completed'],
      ]);

      await passBookingBoundary(late.id, true);
      const blocker = await pool().connect();
      let runs: ReturnType<typeof run>[] = [];
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `app.booking:${late.id}`,
        ]);
        runs = [run(), run()];
        await expect
          .poll(
            async () =>
              (
                await pool().query<{ count: number }>(
                  `SELECT count(*)::int AS count
          FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'
          AND cardinality(pg_blocking_pids(pid))>0`,
                  [],
                )
              ).rows[0]!.count,
            { timeout: 12000, interval: 25 },
          )
          .toBe(2);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled(runs);
      }
      const results = await Promise.all(runs);
      expect(results.map((r) => r.failed)).toEqual([0, 0]);
      expect(results.reduce((count, r) => count + (r.processed ?? 0), 0)).toBe(1);
      const chain = await history(late.id);
      expect(chain.map((t) => [t.kind, t.from_state, t.to_state])).toEqual([
        ['advance', 'confirmed', 'in_use'],
        ['advance', 'in_use', 'completed'],
      ]);
      expect(chain[1]!.operation_id).toBe(chain[0]!.operation_id);
      expect(await stateOf(late.id)).toBe('completed');
      expect(await run()).toMatchObject({ processed: 0, failed: 0 });
      const { rows: audit } = await pool().query(
        `SELECT before,after FROM app.audit_log WHERE operation_id=$1`,
        [chain[0]!.operation_id],
      );
      expect(audit).toEqual([
        {
          before: { state: 'confirmed' },
          after: {
            state: 'completed',
            act: 'advance_booking_states',
            transition_ids: chain.map((t) => t.id),
          },
        },
      ]);
      const { rows: operations } = await pool().query<{ id: string; state: string }>(
        `SELECT id,state FROM app.operation WHERE command='advance_booking_states'`,
      );
      expect(operations).toHaveLength(3);
      expect(operations.every((op) => op.state === 'committed')).toBe(true);
      const { rows: effects } = await pool().query(
        `SELECT
        (SELECT count(*)::int FROM app.credit_entry WHERE operation_id=ANY($1::uuid[])) AS credits,
        (SELECT count(*)::int FROM app.credit_lot WHERE origin_operation_id=ANY($1::uuid[])) AS lots,
        (SELECT count(*)::int FROM app.fee_charge WHERE operation_id=ANY($1::uuid[])) AS fees,
        (SELECT count(*)::int FROM app.settlement WHERE operation_id=ANY($1::uuid[])) AS settlements,
        (SELECT count(*)::int FROM app.fee_charge_reversal WHERE operation_id=ANY($1::uuid[])) AS reversals,
        (SELECT count(*)::int FROM app.refund WHERE operation_id=ANY($1::uuid[])) AS refunds,
        (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=ANY($1::uuid[]) OR closed_by_operation=ANY($1::uuid[])) AS custody,
        (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation=ANY($1::uuid[]) OR released_by_operation=ANY($1::uuid[])) AS occupancy,
        (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id=ANY($1::uuid[])) AS use_right,
        (SELECT count(*)::int FROM app.outbox WHERE operation_id=ANY($1::uuid[])) AS events`,
        [operations.map((op) => op.id)],
      );
      expect(effects).toEqual([
        {
          credits: 0,
          lots: 0,
          fees: 0,
          settlements: 0,
          reversals: 0,
          refunds: 0,
          custody: 0,
          occupancy: 0,
          use_right: 0,
          events: 0,
        },
      ]);
    } finally {
      await pool().query(period[0]!.ddl);
    }
    const { rows: breaches } = await pool()
      .query(`SELECT invariant FROM app.luxchange_invariant_breaches()
      UNION ALL SELECT invariant FROM app.booking_invariant_breaches()
      UNION ALL SELECT invariant FROM app.credit_invariant_breaches()`);
    expect(breaches).toEqual([]);
  }, 120_000);

  it('[REQ-096][TECH-055] mantém a leitura W13 e rejeita transições fora do avanço no PostgreSQL', async () => {
    const { id, requester } = await acceptedBooking();
    const legacyStore = createPostgresBookingLifecycleStore();
    expect(await c.h.db.transaction().execute((tx) => legacyStore.findBooking(tx, id))).toBeNull();
    for (const [command, kind, toState] of [
      ['cancel_own_use_booking', 'cancellation', 'cancelled'],
      ['declare_no_show', 'no_show', 'no_show'],
      ['open_exception', 'exception_opening', 'in_exception'],
      ['resolve_exception', 'invalidation', 'cancelled'],
    ] as const) {
      await expect(
        asOperation(
          c.h.database.appUrl,
          command,
          command === 'cancel_own_use_booking'
            ? { kind: 'titular', titular: requester }
            : { kind: 'admin', admin: c.admin },
          (client, op) => insertTransition(client, op, { bookingId: id, kind, toState }),
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'luxchange_request_booking_transition',
      });
    }
    expect(await stateOf(id)).toBe('confirmed');
    expect(await history(id)).toEqual([]);
  });
});
