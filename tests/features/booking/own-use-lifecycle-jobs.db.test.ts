import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAdvanceBookingStatesJob,
  createFlagNoShowCandidatesJob,
} from '@/features/booking/jobs';
import {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
} from '@/features/booking';
import { createOwnUseBookingConsumers } from '@/features/booking/jobs';
import {
  systemClock,
  type DatabaseTransaction,
  type JobRunner,
  type OutboxConsumer,
} from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase } from '../../support/test-database';
import { JOB_SOURCE } from '../calendar/sealing-support';
import {
  addDays,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from './booking-support';
import {
  activate,
  addAdmin,
  asOperation,
  authorize,
  cancellationTerms,
  deactivate,
  historicBooking,
  historicCoOwnerScenario,
  historicException,
  historicOwnerScenario,
  insertTransition,
  lastStartedNight,
  type Admin,
} from './lifecycle-support';
import { lifecycleRunner } from './own-use-lifecycle-support';

/**
 * Jobs do ciclo da reserva pelo runner de produção (executor real, guard de sistema, PostgreSQL com os privilégios
 * reais do `luxtory_app`): spec booking §10.14. Os instantes são os do banco; as fixtures históricas põem as noites no
 * passado sem depender da data real.
 */
describe('W13 E3 — jobs do ciclo da reserva', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let co2: CoOwnerScenario;
  let owner: OwnerScenario;
  let owner2: OwnerScenario;
  let co3: CoOwnerScenario;
  let owner3: OwnerScenario;
  let owner4: OwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let S: string;
  let S2: string;
  let So: string;
  let So2: string;
  const s = (offset: number) => addDays(S, offset);
  const s2 = (offset: number) => addDays(S2, offset);
  const so = (offset: number) => addDays(So, offset);
  const so2 = (offset: number) => addDays(So2, offset);
  const BASIS = 'Relatório da administração ADM-2027-11';
  /** Primeira noite iniciada da casa: 2 noites a partir dela mantêm a janela do no-show aberta em qualquer hora. */
  const inWindow = async (homeId: string) => {
    const first = await lastStartedNight(h, homeId);
    return { checkin: first, checkout: addDays(first, 2) };
  };

  const flag = (): JobRunner =>
    createFlagNoShowCandidatesJob({
      log: h.jobLog,
      database: h.db,
      clock: h.clock,
      source: JOB_SOURCE,
    });

  const isFlagged = async (bookingId: string) =>
    (
      await h.database.pool.query(
        `SELECT 1 FROM app.booking_no_show_candidate WHERE booking_id = $1`,
        [bookingId],
      )
    ).rows.length === 1;

  const advance = (): JobRunner =>
    createAdvanceBookingStatesJob({
      log: h.jobLog,
      database: h.db,
      clock: h.clock,
      source: JOB_SOURCE,
    });

  async function transitionsOf(bookingId: string) {
    const { rows } = await h.database.pool.query<{
      kind: string;
      from_state: string;
      to_state: string;
      operation_id: string;
    }>(
      `SELECT kind, from_state, to_state, operation_id FROM app.booking_state_transition
        WHERE booking_id = $1 ORDER BY recorded_at, id`,
      [bookingId],
    );
    return rows;
  }

  const stateOf = async (bookingId: string) =>
    (
      await h.database.pool.query<{ state: string }>(
        `SELECT state FROM app.booking WHERE id = $1`,
        [bookingId],
      )
    ).rows[0]!.state;

  const jobOperations = async (command: string) =>
    (
      await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.operation WHERE command = $1`,
        [command],
      )
    ).rows[0]!.n;

  /** Rastro econômico ou de notificação de um conjunto de operações: os jobs nunca deixam nenhum. */
  async function footprint(operationIds: readonly string[]) {
    const { rows } = await h.database.pool.query<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM app.outbox WHERE operation_id = ANY($1::uuid[])) AS events,
              (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id = ANY($1::uuid[])) AS ledger,
              (SELECT count(*)::int FROM app.date_custody
                WHERE opened_by_operation = ANY($1::uuid[]) OR closed_by_operation = ANY($1::uuid[])) AS custody,
              (SELECT count(*)::int FROM app.date_occupancy WHERE released_by_operation = ANY($1::uuid[])) AS released`,
      [[...operationIds]],
    );
    return rows[0];
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    co2 = await historicCoOwnerScenario(h);
    owner = await historicOwnerScenario(h);
    owner2 = await historicOwnerScenario(h);
    co3 = await historicCoOwnerScenario(h);
    owner3 = await historicOwnerScenario(h);
    owner4 = await historicOwnerScenario(h);
    admin = await addAdmin(h);
    S = await lastStartedNight(h, co.homeId);
    S2 = await lastStartedNight(h, co2.homeId);
    So = await lastStartedNight(h, owner.homeId);
    So2 = await lastStartedNight(h, owner2.homeId);
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  describe('advance_booking_states (TECH-055, TECH-090)', () => {
    it('[TECH-055][spec booking §10.14] em uso a partir do 1º check-in; atrasada vai a completed por duas transições na mesma operação', async () => {
      const started = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[0]!,
        checkin: s(0),
        checkout: s(2),
      });
      const late = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[1]!,
        checkin: s(-4),
        checkout: s(-2),
      });
      const future = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[1]!,
        checkin: s(5),
        checkout: s(6),
      });

      const result = await advance()({ correlationId: randomUUID() });

      expect(result).toMatchObject({ failed: 0, deferred: 0 });
      expect(await stateOf(started)).toBe('in_use');
      expect(await stateOf(late)).toBe('completed');
      expect(await stateOf(future)).toBe('confirmed');
      const lateChain = await transitionsOf(late);
      expect(lateChain.map((t) => [t.kind, t.from_state, t.to_state])).toEqual([
        ['advance', 'confirmed', 'in_use'],
        ['advance', 'in_use', 'completed'],
      ]);
      expect(new Set(lateChain.map((t) => t.operation_id)).size).toBe(1);
      const operations = [...lateChain, ...(await transitionsOf(started))].map(
        (t) => t.operation_id,
      );
      expect(await footprint(operations)).toEqual({
        events: 0,
        ledger: 0,
        custody: 0,
        released: 0,
      });
    });

    it('[TECH-055] em uso com o check-out alcançado vai a completed; repetição não grava operação nova', async () => {
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[0]!,
        checkin: s(-7),
        checkout: s(-5),
      });
      await asOperation(h.database.appUrl, 'advance_booking_states', { kind: 'system' }, (c, op) =>
        insertTransition(c, op, { bookingId: id, kind: 'advance', toState: 'in_use' }),
      );

      await advance()({ correlationId: randomUUID() });
      expect(await stateOf(id)).toBe('completed');
      const operations = await jobOperations('advance_booking_states');
      const again = await advance()({ correlationId: randomUUID() });

      expect(again).toMatchObject({ processed: 0, failed: 0 });
      expect(await jobOperations('advance_booking_states')).toBe(operations);
    });

    it('[TECH-055][REQ-084] reserva em exceção e reserva terminal nunca avançam', async () => {
      const inException = await historicBooking(h, {
        homeId: owner.homeId,
        titular: owner.titular,
        checkin: so(-4),
        checkout: so(-2),
      });
      await historicException(h, inException, admin, 'operational');
      const cancelled = await historicBooking(h, {
        homeId: owner.homeId,
        titular: owner.titular,
        checkin: so(0),
        checkout: so(3),
      });
      const terms = await cancellationTerms(h.database.pool, cancelled);
      expect(
        await run.asTitular(owner.titular, run.handlers.cancelOwnUseBooking, {
          second_home_id: owner.homeId,
          booking_id: cancelled,
          expected_cancellation_class: terms.cancellationClass,
          expected_first_affected_date: terms.firstAffectedDate,
        }),
      ).toMatchObject({ status: 'committed' });

      expect(await advance()({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
      expect(await stateOf(inException)).toBe('in_exception');
      expect(await stateOf(cancelled)).toBe('cancelled');
      expect((await transitionsOf(cancelled)).map((t) => t.kind)).toEqual(['cancellation']);
    });

    it('[TECH-101][TECH-053] duas execuções concorrentes: um único avanço, sem operação de recusa nem falha', async () => {
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[1]!,
        checkin: s(-13),
        checkout: s(-11),
      });

      const results = await Promise.all([
        advance()({ correlationId: randomUUID() }),
        advance()({ correlationId: randomUUID() }),
      ]);

      expect(results.map((r) => r.failed)).toEqual([0, 0]);
      expect((await transitionsOf(id)).map((t) => t.to_state)).toEqual(['in_use', 'completed']);
      const { rows } = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.operation WHERE command = 'advance_booking_states'
            AND id IN (SELECT operation_id FROM app.booking_state_transition WHERE booking_id = $1)`,
        [id],
      );
      expect(rows[0]!.n).toBe(1);
      const failedOps = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.operation WHERE command = 'advance_booking_states' AND state = 'failed'`,
      );
      expect(failedOps.rows[0]!.n).toBe(0);
    });

    it('[TECH-053][T-1307] job × cancelamento do Titular e job × abertura de exceção: estados compatíveis, cadeia linear', async () => {
      const cancelling = await historicBooking(h, {
        homeId: co2.homeId,
        titular: co2.titulares[0]!,
        checkin: s2(0),
        checkout: s2(3),
      });
      const terms = await cancellationTerms(h.database.pool, cancelling);
      const opening = await historicBooking(h, {
        homeId: owner2.homeId,
        titular: owner2.titular,
        checkin: so2(0),
        checkout: so2(3),
      });

      const [, cancelled, opened] = await Promise.all([
        advance()({ correlationId: randomUUID() }),
        run.asTitular(co2.titulares[0]!, run.handlers.cancelOwnUseBooking, {
          second_home_id: co2.homeId,
          booking_id: cancelling,
          expected_cancellation_class: terms.cancellationClass,
          expected_first_affected_date: terms.firstAffectedDate,
        }),
        run.asAdmin(admin, run.handlers.openException, {
          second_home_id: owner2.homeId,
          booking_id: opening,
          exception_type: 'operational',
          reason: 'security',
          basis: 'Relatório da administração ADM-2027-11',
        }),
      ]);

      expect(cancelled).toMatchObject({ status: 'committed' });
      expect(opened).toMatchObject({ status: 'committed' });
      expect(await stateOf(cancelling)).toBe('cancelled');
      expect(await stateOf(opening)).toBe('in_exception');
      // Quem chegou primeiro decide; nunca dois avanços nem avanço depois do ato.
      expect([['cancellation'], ['advance', 'cancellation']]).toContainEqual(
        (await transitionsOf(cancelling)).map((t) => t.kind),
      );
      expect([['exception_opening'], ['advance', 'exception_opening']]).toContainEqual(
        (await transitionsOf(opening)).map((t) => t.kind),
      );
    });

    it('[ADR-0027 §5] com K1 e K2 fechadas o job continua (fora da K2, sem efeito econômico)', async () => {
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[0]!,
        checkin: s(-16),
        checkout: s(-14),
      });
      await deactivate(h, 'own_use_booking', 'own_use_lifecycle');
      try {
        expect(await advance()({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
        expect(await stateOf(id)).toBe('completed');
      } finally {
        await activate(h, 'own_use_booking', 'own_use_lifecycle');
      }
    });

    it('[TECH-090][spec booking §10.14] banco sem reserva: varredura vazia, nenhuma operação gravada', async () => {
      const fresh = await createTestDatabase();
      const database = appDatabase(fresh.appUrl);
      try {
        const env = { log: h.jobLog, database, clock: h.clock, source: JOB_SOURCE };
        const result = await createAdvanceBookingStatesJob(env)({ correlationId: randomUUID() });
        const flagged = await createFlagNoShowCandidatesJob(env)({ correlationId: randomUUID() });
        expect(flagged).toEqual({
          candidates: 0,
          processed: 0,
          skipped: 0,
          failed: 0,
          deferred: 0,
        });

        expect(result).toEqual({
          candidates: 0,
          processed: 0,
          skipped: 0,
          failed: 0,
          deferred: 0,
          transitions: 0,
        });
        const { rows } = await fresh.pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM app.operation`,
        );
        expect(rows[0]!.n).toBe(0);
      } finally {
        await database.destroy();
        await fresh.drop();
      }
    });
  });

  describe('flag_no_show_candidates (TECH-046, TECH-090; ADR-0027 §7)', () => {
    it('[TECH-046][ADR-0027 §7] o no-show do Admin não depende do registro; depois dele a reserva não é sinalizada', async () => {
      const period = await inWindow(owner4.homeId);
      const id = await historicBooking(h, {
        homeId: owner4.homeId,
        titular: owner4.titular,
        ...period,
      });
      expect(await isFlagged(id)).toBe(false);
      const target = { second_home_id: owner4.homeId, booking_id: id };
      const requested = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target,
        purpose: 'no_show',
        basis: BASIS,
      });
      if (requested.status !== 'committed') throw new Error(JSON.stringify(requested));
      await authorize(h, requested.result.request_id, 'github-run:8101:1');
      expect(
        await run.asAdmin(admin, run.handlers.declareNoShow, { ...target, basis: BASIS }),
      ).toMatchObject({ status: 'committed' });

      expect(await flag()({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
      expect(await isFlagged(id)).toBe(false);
      expect(await stateOf(id)).toBe('no_show');
    });

    it('[TECH-046][TECH-101] registro único: execuções concorrentes e repetidas não duplicam, não falham e nunca declaram no-show', async () => {
      const period = await inWindow(co3.homeId);
      const id = await historicBooking(h, {
        homeId: co3.homeId,
        titular: co3.titulares[0]!,
        ...period,
      });

      const results = await Promise.all([
        flag()({ correlationId: randomUUID() }),
        flag()({ correlationId: randomUUID() }),
      ]);
      expect(results.map((r) => r.failed)).toEqual([0, 0]);
      expect(await isFlagged(id)).toBe(true);
      const operations = await jobOperations('flag_no_show_candidates');
      expect(await flag()({ correlationId: randomUUID() })).toMatchObject({
        processed: 0,
        failed: 0,
      });
      expect(await jobOperations('flag_no_show_candidates')).toBe(operations);
      const failedOps = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.operation WHERE command = 'flag_no_show_candidates' AND state = 'failed'`,
      );
      expect(failedOps.rows[0]!.n).toBe(0);
      // Candidata nunca vira no-show: o estado segue o do avanço, sem transição de no-show.
      expect(['confirmed', 'in_use']).toContain(await stateOf(id));
      expect((await transitionsOf(id)).filter((t) => t.kind === 'no_show')).toEqual([]);
      const { rows } = await h.database.pool.query<{ operation_id: string }>(
        `SELECT operation_id FROM app.booking_no_show_candidate WHERE booking_id = $1`,
        [id],
      );
      expect(await footprint(rows.map((row) => row.operation_id))).toEqual({
        events: 0,
        ledger: 0,
        custody: 0,
        released: 0,
      });
    });

    it('[spec booking §10.14] ordem dos crons indiferente: candidatos antes ou depois do avanço; K1/K2 fechadas não impedem', async () => {
      const period = await inWindow(owner3.homeId);
      const id = await historicBooking(h, {
        homeId: owner3.homeId,
        titular: owner3.titular,
        ...period,
      });
      await deactivate(h, 'own_use_booking', 'own_use_lifecycle');
      try {
        await advance()({ correlationId: randomUUID() });
        expect(await stateOf(id)).toBe('in_use');
        expect(await flag()({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
        expect(await isFlagged(id)).toBe(true);
      } finally {
        await activate(h, 'own_use_booking', 'own_use_lifecycle');
      }
      // E a reserva sinalizada antes do avanço (teste anterior) também avançou depois, sem perder o registro.
      await advance()({ correlationId: randomUUID() });
      const coThree = await h.database.pool.query<{ id: string; state: string }>(
        `SELECT b.id, b.state FROM app.booking b JOIN app.booking_no_show_candidate c ON c.booking_id = b.id
          WHERE b.second_home_id = $1`,
        [co3.homeId],
      );
      expect(coThree.rows.map((row) => row.state)).toEqual(['in_use']);
    });

    it('[TECH-046][REQ-084] fora da janela ou em exceção não registra — e não registra depois (limite conhecido)', async () => {
      const closed = await historicBooking(h, {
        homeId: co.homeId,
        titular: co.titulares[1]!,
        checkin: s(-20),
        checkout: s(-18),
      });
      const inException = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.booking WHERE second_home_id = $1 AND state = 'in_exception'`,
        [owner2.homeId],
      );

      expect(await flag()({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
      expect(await isFlagged(closed)).toBe(false);
      expect(await stateOf(closed)).toBe('confirmed');
      for (const row of inException.rows) expect(await isFlagged(row.id)).toBe(false);
    });
  });

  describe('consumidores do outbox — entrega real pelo dispatcher (REQ-097, TECH-091)', () => {
    const TYPES = [
      OWN_USE_BOOKING_CANCELLED,
      OWN_USE_NO_SHOW_DECLARED,
      OWN_USE_EXCEPTION_OPENED,
      OWN_USE_EXCEPTION_RESOLVED,
      OWN_USE_BOOKING_INVALIDATED,
    ];
    const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const sweep = (consumers: readonly OutboxConsumer<DatabaseTransaction>[]) =>
      dispatchOutbox({
        store: createPostgresOutboxStore(h.db),
        consumers: new ConsumerRegistry<DatabaseTransaction>(consumers),
        clock: systemClock,
        batchSize: 200,
        log: quiet,
      });
    const booking = () => createOwnUseBookingConsumers({ clock: systemClock });

    async function lifecycleEvents() {
      const { rows } = await h.database.pool.query<{
        id: string;
        event_type: string;
        payload: { recipient_party_id: string };
        delivered_at: Date | null;
        last_error: string | null;
      }>(
        `SELECT id, event_type, payload, delivered_at, last_error FROM app.outbox WHERE event_type = ANY($1::text[])`,
        [TYPES],
      );
      return rows;
    }

    const notificationsOf = async (eventId: string) =>
      (
        await h.database.pool.query<{
          recipient_party_id: string;
          kind: string;
          data: Record<string, unknown>;
        }>(`SELECT recipient_party_id, kind, data FROM app.notification WHERE event_id = $1`, [
          eventId,
        ])
      ).rows;

    it('[REQ-097][TECH-091] os cinco eventos reais viram uma notificação cada, à party fixada; falha parcial e redespacho sem duplicata', async () => {
      // Os dois eventos que faltam neste banco: a resolução sem cancelamento e a invalidação de Owner.
      const { rows: open } = await h.database.pool.query<{ booking: string; exception: string }>(
        `SELECT b.id AS booking, x.id AS exception FROM app.booking b
           JOIN app.booking_exception x ON x.booking_id = b.id
          WHERE b.second_home_id = $1 AND b.state = 'in_exception'`,
        [owner2.homeId],
      );
      expect(
        await run.asAdmin(admin, run.handlers.resolveException, {
          second_home_id: owner2.homeId,
          booking_id: open[0]!.booking,
          exception_id: open[0]!.exception,
          outcome: 'confirmed',
          basis: BASIS,
        }),
      ).toMatchObject({ status: 'committed' });
      const unauthorized = await historicBooking(h, {
        homeId: owner.homeId,
        titular: owner.titular,
        checkin: so(5),
        checkout: so(6),
      });
      const target = { second_home_id: owner.homeId, booking_id: unauthorized };
      const opened = await run.asAdmin(admin, run.handlers.openException, {
        ...target,
        exception_type: 'unauthorized_booking',
        incident_ref: 'INC-2027-777',
        basis: BASIS,
      });
      if (opened.status !== 'committed') throw new Error(JSON.stringify(opened));
      const requested = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target,
        purpose: 'invalidation',
        basis: BASIS,
      });
      if (requested.status !== 'committed') throw new Error(JSON.stringify(requested));
      await authorize(h, requested.result.request_id, 'github-run:8201:1');
      expect(
        await run.asAdmin(admin, run.handlers.resolveException, {
          ...target,
          exception_id: opened.result.exception_id,
          outcome: 'cancelled',
          basis: BASIS,
        }),
      ).toMatchObject({ status: 'committed' });

      // Falha parcial: outro consumidor do no-show cai; o evento fica pendente, a notificação já gravada não repete.
      const failing: OutboxConsumer<DatabaseTransaction> = {
        name: 'test_failing_no_show_consumer',
        eventTypes: [OWN_USE_NO_SHOW_DECLARED],
        handle: () => Promise.reject(new Error('consumer down')),
      };
      await sweep([...booking(), failing]);
      const pending = (await lifecycleEvents()).filter(
        (e) => e.event_type === OWN_USE_NO_SHOW_DECLARED,
      );
      expect(pending.length).toBeGreaterThan(0);
      for (const event of pending) {
        expect(event).toMatchObject({ delivered_at: null, last_error: 'Error' });
        expect(await notificationsOf(event.id)).toHaveLength(1);
      }

      await sweep(booking());
      await sweep(booking());

      const events = await lifecycleEvents();
      expect(new Set(events.map((e) => e.event_type))).toEqual(new Set(TYPES));
      for (const event of events) {
        expect(event.delivered_at, event.event_type).not.toBeNull();
        const notifications = await notificationsOf(event.id);
        expect(notifications, event.event_type).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
          recipient_party_id: event.payload.recipient_party_id,
          kind: event.event_type,
        });
        const text = JSON.stringify(notifications[0]!.data);
        for (const forbidden of [
          'basis',
          'incident_ref',
          'INC-2027-777',
          'ADM-2027-11',
          'recipient_party_id',
        ])
          expect(text, `${event.event_type} ${forbidden}`).not.toContain(forbidden);
      }
    });

    it('[TECH-091] payload fora do contrato: só aquele evento fica pendente com o nome do erro, sem notificação', async () => {
      const { rows } = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.operation LIMIT 1`,
      );
      const id = randomUUID();
      await h.database.pool.query(
        `INSERT INTO app.outbox (id, operation_id, event_type, dedup_key, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, rows[0]!.id, OWN_USE_BOOKING_CANCELLED, `test:${id}`, JSON.stringify({ basis: 'x' })],
      );

      await sweep(booking());

      const { rows: after } = await h.database.pool.query<{
        delivered_at: Date | null;
        last_error: string | null;
      }>(`SELECT delivered_at, last_error FROM app.outbox WHERE id = $1`, [id]);
      expect(after[0]).toEqual({ delivered_at: null, last_error: 'ZodError' });
      expect(await notificationsOf(id)).toEqual([]);
    });

    it('[BR-284] solicitação de autorização não emite evento, logo não notifica', async () => {
      const { rows } = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.outbox o JOIN app.operation op ON op.id = o.operation_id
          WHERE op.command IN ('request_booking_authorization', 'recover_future_capacity')`,
      );
      expect(rows[0]!.n).toBe(0);
    });
  });
});
