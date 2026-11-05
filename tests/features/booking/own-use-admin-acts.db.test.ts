import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
} from '@/features/booking';
import { createPostgresBookingLifecycleStore } from '@/features/booking/infrastructure/postgres-booking-lifecycle-store';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import { CapabilityNotActivatedError } from '@/features/platform';
import {
  addDays,
  bookableStart,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
} from './booking-support';
import {
  activate,
  addAdmin,
  authorize,
  bookNow,
  bookingRow,
  deactivate,
  historicBooking,
  historicCoOwnerScenario,
  historicException,
  historicOwnerScenario,
  lastStartedNight,
  lifecycleFacts,
  revoke,
  type Admin,
} from './lifecycle-support';
import {
  commandTraces,
  expectLifecycleEvent,
  expectMarkerConfined,
  expectNoEvent,
  lifecycleRunner,
} from './own-use-lifecycle-support';

type Purpose = 'no_show' | 'recovery' | 'exception_cancellation' | 'invalidation';

/**
 * Atos Admin do ciclo pelos handlers reais (executor de produção, guard com AAL2 e papel ativo, PostgreSQL com os
 * privilégios reais): exceção, resolução, no-show, invalidação, recuperação e a solicitação de autorização (spec
 * booking §10.5, §10.12). A autorização é emitida pelo papel autorizador real (`app.authorize_booking_action`).
 */
describe('W13 E2 — atos Admin do ciclo da reserva', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  /** Owner só para a solicitação com reserva em curso (sem colidir com as noites do no-show). */
  let owner2: OwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let S: string;
  let So: string;
  let first: string;
  const s = (offset: number) => addDays(S, offset);
  const so = (offset: number) => addDays(So, offset);
  const at = (offset: number) => addDays(first, offset);
  const BASIS = 'Relatório da administração ADM-2027-11';

  const target = (homeId: string, bookingId: string) => ({
    second_home_id: homeId,
    booking_id: bookingId,
  });

  async function committed<R>(outcome: Promise<{ status: string; result?: R }>): Promise<R> {
    const value = await outcome;
    if (value.status !== 'committed') throw new Error(JSON.stringify(value));
    return value.result as R;
  }

  async function requestAndAuthorize(
    homeId: string,
    bookingId: string,
    purpose: Purpose,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { request_id: requestId } = await committed<{ request_id: string }>(
      run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target(homeId, bookingId),
        purpose,
        basis: BASIS,
        ...extra,
      }),
    );
    return authorize(h, requestId, `github-run:${Math.floor(Math.random() * 1e9) + 1}:1`);
  }

  async function openException(
    homeId: string,
    bookingId: string,
    type: 'operational' | 'unauthorized_booking',
  ): Promise<string> {
    const input =
      type === 'operational'
        ? { exception_type: type, reason: 'emergency_maintenance' }
        : { exception_type: type, incident_ref: 'INC-2027-042' };
    const result = await committed<{ exception_id: string }>(
      run.asAdmin(admin, run.handlers.openException, {
        ...target(homeId, bookingId),
        basis: BASIS,
        ...input,
      }),
    );
    return result.exception_id;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    owner = await historicOwnerScenario(h);
    owner2 = await historicOwnerScenario(h);
    admin = await addAdmin(h);
    S = await lastStartedNight(h, co.homeId);
    So = await lastStartedNight(h, owner.homeId);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  describe('guard, MFA e K2', () => {
    it('[TECH-050] Admin sem MFA (AAL1) é recusado antes de qualquer escrita, inclusive na solicitação', async () => {
      const id = await bookNow(h, co.titulares[0]!, co.homeId, at(10), at(11));
      const key = randomUUID();

      const opened = await run.asAdmin(
        admin,
        run.handlers.openException,
        {
          ...target(co.homeId, id),
          exception_type: 'operational',
          reason: 'security',
          basis: BASIS,
        },
        key,
        'aal1',
      );
      const requested = await run.asAdmin(
        admin,
        run.handlers.requestBookingAuthorization,
        { ...target(co.homeId, id), purpose: 'no_show', basis: BASIS },
        randomUUID(),
        'aal1',
      );

      expect(opened).toEqual({
        status: 'rejected',
        operationId: null,
        code: 'ERR_PERMISSION',
        replayed: false,
      });
      expect(requested).toMatchObject({
        status: 'rejected',
        operationId: null,
        code: 'ERR_PERMISSION',
      });
      expect(await commandTraces(h, key)).toEqual({
        operations: 0,
        states: [],
        records: 0,
        events: 0,
      });
    });

    it('[ADR-0027 §5][D12] sem a K2 os atos fecham; a solicitação (fora da K2) funciona e não muda nada', async () => {
      const id = await bookNow(h, co.titulares[0]!, co.homeId, at(12), at(13));
      await deactivate(h, 'own_use_lifecycle');
      try {
        await expect(
          run.asAdmin(admin, run.handlers.openException, {
            ...target(co.homeId, id),
            exception_type: 'operational',
            reason: 'security',
            basis: BASIS,
          }),
        ).rejects.toEqual(new CapabilityNotActivatedError('own_use_lifecycle'));
        const facts = await lifecycleFacts(h, id);
        const requested = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
          ...target(co.homeId, id),
          purpose: 'no_show',
          basis: BASIS,
        });
        // Fora da janela do no-show: recusada, mas pela regra de emissão — não pela K2.
        expect(requested).toMatchObject({ status: 'rejected', code: 'ERR_STATE_TRANSITION' });
        expect(await lifecycleFacts(h, id)).toEqual(facts);
      } finally {
        await activate(h, 'own_use_lifecycle');
      }
    });

    it('[spec booking §10.12 D1] corrida com a K2 e com a revogação: o banco decide e o executor traduz', async () => {
      const real = createPostgresBookingLifecycleStore();
      const id = await bookNow(h, co.titulares[0]!, co.homeId, at(14), at(15));
      const exceptionId = await openException(co.homeId, id, 'operational');
      const authorizationId = await requestAndAuthorize(co.homeId, id, 'exception_cancellation');
      await revoke(h, authorizationId);
      // Pré-checagem que ainda vê a autorização viva (corrida): o gatilho do uso recusa por 42501 nomeado.
      const racing = createOwnUseLifecycleHandlers({
        store: {
          ...real,
          liveAuthorization: async (tx, query) =>
            (await real.liveAuthorization(tx, query)) ?? {
              id: authorizationId,
              scopeDates: [at(14)],
              scopeCustodyIds: [],
              expectedClass: 'timely',
            },
        },
      });
      const input = {
        ...target(co.homeId, id),
        exception_id: exceptionId,
        outcome: 'cancelled',
        basis: BASIS,
      };
      const key = randomUUID();

      expect(await run.asAdmin(admin, racing.resolveException, input, key)).toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
      });
      expect(await run.asAdmin(admin, racing.resolveException, input, key)).toMatchObject({
        code: 'ERR_PERMISSION',
        replayed: true,
      });
      expect((await bookingRow(h.database.pool, id)).state).toBe('in_exception');

      // K2 removida depois da leitura do handler: o gatilho fecha, sem operação, recusa ou evento.
      const closedKey = randomUUID();
      const blind = createOwnUseLifecycleHandlers({
        store: { ...real, lifecycleActivated: () => Promise.resolve(true) },
      });
      await deactivate(h, 'own_use_lifecycle');
      try {
        await expect(
          run.asAdmin(admin, blind.resolveException, { ...input, outcome: 'confirmed' }, closedKey),
        ).rejects.toEqual(new CapabilityNotActivatedError('own_use_lifecycle'));
        expect(await commandTraces(h, closedKey)).toEqual({
          operations: 0,
          states: [],
          records: 0,
          events: 0,
        });
      } finally {
        await activate(h, 'own_use_lifecycle');
      }
    });
  });

  describe('exceção e resolução sem efeito econômico', () => {
    it('[PD-010][REQ-083] exceção operacional do Co-Owner: evento com o prazo de 360 h; resolução confirmed antes do check-out', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(18), at(20));
      const facts = await lifecycleFacts(h, id);
      const opened = await run.asAdmin(admin, run.handlers.openException, {
        ...target(co.homeId, id),
        exception_type: 'operational',
        reason: 'casualty',
        basis: BASIS,
      });
      expect(opened).toMatchObject({ status: 'committed', result: { state: 'in_exception' } });
      if (opened.status !== 'committed') return;
      const payload = await expectLifecycleEvent(
        h,
        opened.operationId,
        OWN_USE_EXCEPTION_OPENED,
        id,
      );
      const limit = await h.database.pool.query<{ until: string }>(
        `SELECT to_char((i.first_checkin_at - interval '360 hours') AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS until FROM app.booking_period_instants($1) AS i`,
        [id],
      );
      expect(payload).toMatchObject({
        exception_type: 'operational',
        reason: 'casualty',
        timely_until: limit.rows[0]!.until,
      });
      expect(await lifecycleFacts(h, id)).toMatchObject({
        ...facts,
        state: 'in_exception',
        transitions: 1,
      });

      const completedEarly = await run.asAdmin(admin, run.handlers.resolveException, {
        ...target(co.homeId, id),
        exception_id: opened.result.exception_id,
        outcome: 'completed',
        basis: BASIS,
      });
      expect(completedEarly).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
      const resolved = await run.asAdmin(admin, run.handlers.resolveException, {
        ...target(co.homeId, id),
        exception_id: opened.result.exception_id,
        outcome: 'confirmed',
        basis: BASIS,
      });
      expect(resolved).toMatchObject({
        status: 'committed',
        result: { state: 'confirmed', released_dates: [] },
      });
      if (resolved.status === 'committed')
        expect(
          await expectLifecycleEvent(h, resolved.operationId, OWN_USE_EXCEPTION_RESOLVED, id),
        ).toMatchObject({ outcome: 'confirmed', exception_type: 'operational' });
      expect(await lifecycleFacts(h, id)).toMatchObject({
        ...facts,
        state: 'confirmed',
        transitions: 2,
      });
    });

    it('[REQ-084] apuração encerrada sem comprovação depois do check-out → completed; confirmed recusado; exceção errada recusada', async () => {
      const t = owner.titular;
      const id = await historicBooking(h, {
        homeId: owner.homeId,
        titular: t,
        checkin: so(-6),
        checkout: so(-4),
      });
      await historicException(h, id, admin, 'unauthorized_booking');
      const exceptionId = (
        await h.database.pool.query<{ id: string }>(
          `SELECT id FROM app.booking_exception WHERE booking_id = $1`,
          [id],
        )
      ).rows[0]!.id;
      const resolve = (outcome: string, exception = exceptionId) =>
        run.asAdmin(admin, run.handlers.resolveException, {
          ...target(owner.homeId, id),
          exception_id: exception,
          outcome,
          basis: BASIS,
        });

      expect(await resolve('confirmed')).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
      expect(await resolve('completed', randomUUID())).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
      const done = await resolve('completed');
      expect(done).toMatchObject({ status: 'committed', result: { state: 'completed' } });
      if (done.status === 'committed')
        expect(
          await expectLifecycleEvent(h, done.operationId, OWN_USE_EXCEPTION_RESOLVED, id),
        ).toMatchObject({ outcome: 'completed', exception_type: 'unauthorized_booking' });
    });

    it('[TECH-055] exceção depois do check-out e a partir de estado terminal → ERR_STATE_TRANSITION; reserva inexistente → ERR_NOT_FOUND', async () => {
      const past = await historicBooking(h, {
        homeId: owner.homeId,
        titular: owner.titular,
        checkin: so(-10),
        checkout: so(-8),
      });
      const open = (bookingId: string) =>
        run.asAdmin(admin, run.handlers.openException, {
          ...target(owner.homeId, bookingId),
          exception_type: 'operational',
          reason: 'force_majeure',
          basis: BASIS,
        });

      expect(await open(past)).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
      expect(await open(randomUUID())).toMatchObject({ code: 'ERR_NOT_FOUND' });
    });
  });

  describe('atos com efeito econômico e autorização independente', () => {
    it('[PD-010][EC-12][TECH-051] cancelamento P-A: sem autorização → ERR_PERMISSION; com ela, classe no instante (tardio → forfeited_right)', async () => {
      const b = co.titulares[1]!;
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: b,
        checkin: s(3),
        checkout: s(5),
      });
      const exceptionId = await openException(co.homeId, id, 'operational');
      const input = {
        ...target(co.homeId, id),
        exception_id: exceptionId,
        outcome: 'cancelled',
        basis: BASIS,
      };

      expect(await run.asAdmin(admin, run.handlers.resolveException, input)).toMatchObject({
        code: 'ERR_PERMISSION',
      });
      await requestAndAuthorize(co.homeId, id, 'exception_cancellation');
      const outcome = await run.asAdmin(admin, run.handlers.resolveException, input);

      expect(outcome).toMatchObject({
        status: 'committed',
        result: { state: 'cancelled', cancellation_class: 'late', released_dates: [s(3), s(4)] },
      });
      expect(await lifecycleFacts(h, id)).toMatchObject({ forfeited: 2, restores: 0 });
      const luxtory = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.date_custody WHERE second_home_id = $1 AND holder_kind = 'luxtory'
            AND stay_date = ANY($2::date[])`,
        [co.homeId, [s(3), s(4)]],
      );
      expect(luxtory.rows[0]!.n).toBe(0);
      if (outcome.status === 'committed')
        expect(
          await expectLifecycleEvent(h, outcome.operationId, OWN_USE_BOOKING_CANCELLED, id),
        ).toMatchObject({
          cause: 'exception',
          exception_id: exceptionId,
          cancellation_class: 'late',
          forfeited_nights: 2,
        });
    });

    it('[PD-010][BR-280] cancelamento P-A tempestivo do Co-Owner devolve o Direito de Uso; P-A do Owner só libera', async () => {
      const a = co.titulares[0]!;
      const timely = await bookNow(h, a, co.homeId, at(24), at(26));
      const exceptionId = await openException(co.homeId, timely, 'operational');
      await requestAndAuthorize(co.homeId, timely, 'exception_cancellation');
      expect(
        await run.asAdmin(admin, run.handlers.resolveException, {
          ...target(co.homeId, timely),
          exception_id: exceptionId,
          outcome: 'cancelled',
          basis: BASIS,
        }),
      ).toMatchObject({ status: 'committed', result: { cancellation_class: 'timely' } });
      expect(await lifecycleFacts(h, timely)).toMatchObject({ restores: 2, reserved: 0 });

      const ownerBooking = await bookNow(h, owner.titular, owner.homeId, at(24), at(25));
      const ownerException = await openException(owner.homeId, ownerBooking, 'operational');
      await requestAndAuthorize(owner.homeId, ownerBooking, 'exception_cancellation');
      expect(
        await run.asAdmin(admin, run.handlers.resolveException, {
          ...target(owner.homeId, ownerBooking),
          exception_id: ownerException,
          outcome: 'cancelled',
          basis: BASIS,
        }),
      ).toMatchObject({
        status: 'committed',
        result: { cancellation_class: null, released_dates: [at(24)] },
      });
    });

    it('[REQ-084][EC-16] invalidação do Owner por resolve_exception; a do Co-Owner por resolve_exception é recusada', async () => {
      const ownerBooking = await bookNow(h, owner.titular, owner.homeId, at(28), at(30));
      const ownerException = await openException(
        owner.homeId,
        ownerBooking,
        'unauthorized_booking',
      );
      await requestAndAuthorize(owner.homeId, ownerBooking, 'invalidation');
      const invalidated = await run.asAdmin(admin, run.handlers.resolveException, {
        ...target(owner.homeId, ownerBooking),
        exception_id: ownerException,
        outcome: 'cancelled',
        basis: BASIS,
      });
      expect(invalidated).toMatchObject({ status: 'committed', result: { state: 'cancelled' } });
      if (invalidated.status === 'committed')
        expect(
          await expectLifecycleEvent(
            h,
            invalidated.operationId,
            OWN_USE_BOOKING_INVALIDATED,
            ownerBooking,
          ),
        ).toMatchObject({ corrected: null, released_nights: 2 });

      const a = co.titulares[0]!;
      const coBooking = await bookNow(h, a, co.homeId, at(28), at(29));
      const coException = await openException(co.homeId, coBooking, 'unauthorized_booking');
      expect(
        await run.asAdmin(admin, run.handlers.resolveException, {
          ...target(co.homeId, coBooking),
          exception_id: coException,
          outcome: 'cancelled',
          basis: BASIS,
        }),
      ).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
    });

    it('[REQ-084][TECH-026][TECH-110] correct_use_right: correction por noite não iniciada, spe_pool, sem restore; fora da apuração recusado', async () => {
      const a = co.titulares[0]!;
      const id = await bookNow(h, a, co.homeId, at(50), at(53));
      const pa = await bookNow(h, a, co.homeId, at(56), at(57));
      const consumedBefore = (await lifecycleFacts(h, id)).consumed;
      const paException = await openException(co.homeId, pa, 'operational');
      expect(
        await run.asAdmin(admin, run.handlers.correctUseRight, {
          ...target(co.homeId, pa),
          exception_id: paException,
          basis: BASIS,
        }),
      ).toMatchObject({ code: 'ERR_STATE_TRANSITION' });

      const exceptionId = await openException(co.homeId, id, 'unauthorized_booking');
      const input = { ...target(co.homeId, id), exception_id: exceptionId, basis: BASIS };
      expect(await run.asAdmin(admin, run.handlers.correctUseRight, input)).toMatchObject({
        code: 'ERR_PERMISSION',
      });
      await requestAndAuthorize(co.homeId, id, 'invalidation');
      const outcome = await run.asAdmin(admin, run.handlers.correctUseRight, input);

      expect(outcome).toMatchObject({
        status: 'committed',
        result: { state: 'cancelled', released_dates: [at(50), at(51), at(52)] },
      });
      expect(await lifecycleFacts(h, id)).toMatchObject({
        state: 'cancelled',
        corrections: 3,
        restores: 0,
        reserved: 0,
        forfeited: 0,
        consumed: consumedBefore - 3,
      });
      if (outcome.status !== 'committed') return;
      const corrected = outcome.result.corrected;
      expect(corrected.alta + corrected.media + corrected.leap).toBe(3);
      expect(
        await expectLifecycleEvent(h, outcome.operationId, OWN_USE_BOOKING_INVALIDATED, id),
      ).toMatchObject({ exception_id: exceptionId, released_nights: 3 });
    });

    it('[TECH-046][BR-282][BR-283][BR-284] no-show com autorização, depois recuperação só das futuras perdidas, sem evento', async () => {
      const b = co.titulares[1]!;
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: b,
        checkin: s(-1),
        checkout: s(3),
      });
      const noShowInput = { ...target(co.homeId, id), basis: BASIS };
      expect(await run.asAdmin(admin, run.handlers.declareNoShow, noShowInput)).toMatchObject({
        code: 'ERR_PERMISSION',
      });
      // Recuperação antes do no-show commitado: a solicitação nem é registrada.
      expect(
        await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
          ...target(co.homeId, id),
          purpose: 'recovery',
          basis: BASIS,
        }),
      ).toMatchObject({ code: 'ERR_STATE_TRANSITION' });

      await requestAndAuthorize(co.homeId, id, 'no_show');
      const declared = await run.asAdmin(admin, run.handlers.declareNoShow, noShowInput);
      expect(declared).toMatchObject({
        status: 'committed',
        result: { state: 'no_show', released_dates: [s(1), s(2)], forfeited_nights: 2 },
      });
      if (declared.status === 'committed')
        expect(
          await expectLifecycleEvent(h, declared.operationId, OWN_USE_NO_SHOW_DECLARED, id),
        ).toMatchObject({ released_nights: 2, first_released_date: s(1), forfeited_nights: 2 });

      const recoverInput = { ...target(co.homeId, id), basis: BASIS };
      expect(
        await run.asAdmin(admin, run.handlers.recoverFutureCapacity, recoverInput),
      ).toMatchObject({
        code: 'ERR_PERMISSION',
      });
      await requestAndAuthorize(co.homeId, id, 'recovery');
      const recovered = await run.asAdmin(admin, run.handlers.recoverFutureCapacity, recoverInput);

      expect(recovered).toMatchObject({
        status: 'committed',
        result: { recovered_dates: [s(1), s(2)] },
      });
      if (recovered.status === 'committed') await expectNoEvent(h, recovered.operationId);
      const custody = await h.database.pool.query<{ n: number; ref: boolean }>(
        `SELECT count(*)::int AS n, bool_and(authorization_ref LIKE 'booking_authorization:%') AS ref
           FROM app.date_custody WHERE second_home_id = $1 AND closed_at IS NULL AND holder_kind = 'luxtory'
            AND inventory_origin = 'recovered_future_capacity' AND stay_date = ANY($2::date[])`,
        [co.homeId, [s(1), s(2)]],
      );
      expect(custody.rows[0]).toEqual({ n: 2, ref: true });
      expect(await lifecycleFacts(h, id)).toMatchObject({ forfeited: 0, restores: 0 });
    });

    it('[TECH-046][REQ-081] no-show: antes do 1º check-in recusado; Owner libera as futuras e a custódia segue owner', async () => {
      const future = await bookNow(h, owner.titular, owner.homeId, at(60), at(61));
      expect(
        await run.asAdmin(admin, run.handlers.declareNoShow, {
          ...target(owner.homeId, future),
          basis: BASIS,
        }),
      ).toMatchObject({ code: 'ERR_STATE_TRANSITION' });

      const id = await historicBooking(h, {
        homeId: owner.homeId,
        titular: owner.titular,
        checkin: so(-1),
        checkout: so(2),
      });
      await requestAndAuthorize(owner.homeId, id, 'no_show');
      expect(
        await run.asAdmin(admin, run.handlers.declareNoShow, {
          ...target(owner.homeId, id),
          basis: BASIS,
        }),
      ).toMatchObject({
        status: 'committed',
        result: { released_dates: [so(1)], forfeited_nights: null },
      });
      const custody = await h.database.pool.query<{ holder: string }>(
        `SELECT holder_kind AS holder FROM app.date_custody
          WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
        [owner.homeId, so(1)],
      );
      expect(custody.rows).toEqual([{ holder: 'owner' }]);
    });

    it('[ADR-0027 §4][A3] recuperação depois de P-A tardia exige atestação de disponibilidade', async () => {
      const b = co.titulares[1]!;
      const id = await historicBooking(h, {
        homeId: co.homeId,
        titular: b,
        checkin: s(7),
        checkout: s(8),
      });
      const exceptionId = await openException(co.homeId, id, 'operational');
      await requestAndAuthorize(co.homeId, id, 'exception_cancellation');
      await committed(
        run.asAdmin(admin, run.handlers.resolveException, {
          ...target(co.homeId, id),
          exception_id: exceptionId,
          outcome: 'cancelled',
          basis: BASIS,
        }),
      );

      expect(
        await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
          ...target(co.homeId, id),
          purpose: 'recovery',
          basis: BASIS,
        }),
      ).toMatchObject({ code: 'ERR_VALIDATION' });
      await requestAndAuthorize(co.homeId, id, 'recovery', { availability_attested: true });
      expect(
        await run.asAdmin(admin, run.handlers.recoverFutureCapacity, {
          ...target(co.homeId, id),
          basis: BASIS,
        }),
      ).toMatchObject({ status: 'committed', result: { recovered_dates: [s(7)] } });
    });
  });

  describe('solicitação de autorização e privacidade (D11)', () => {
    it('[ADR-0027 §4][spec booking §10.11.1] escopo derivado no servidor; nenhuma data do cliente; só o id sai; nada muda', async () => {
      const home = owner2.homeId;
      const started = await lastStartedNight(h, home);
      const id = await historicBooking(h, {
        homeId: home,
        titular: owner2.titular,
        checkin: addDays(started, -1),
        checkout: addDays(started, 3),
      });
      const facts = await lifecycleFacts(h, id);

      const forged = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target(home, id),
        purpose: 'no_show',
        basis: BASIS,
        expected_dates: [addDays(started, 1)],
      });
      expect(forged).toMatchObject({
        status: 'rejected',
        operationId: null,
        code: 'ERR_VALIDATION',
      });
      const attestedWrong = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target(home, id),
        purpose: 'no_show',
        basis: BASIS,
        availability_attested: true,
      });
      expect(attestedWrong).toMatchObject({ code: 'ERR_VALIDATION' });

      const outcome = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target(home, id),
        purpose: 'no_show',
        basis: BASIS,
      });
      expect(outcome).toMatchObject({ status: 'committed' });
      if (outcome.status !== 'committed') return;
      expect(Object.keys(outcome.result)).toEqual(['request_id']);
      await expectNoEvent(h, outcome.operationId);
      const request = await h.database.pool.query<{ dates: string[]; unstarted: string[] }>(
        `SELECT r.expected_dates::text[] AS dates,
                app.booking_unstarted_nights(r.booking_id, clock_timestamp())::text[] AS unstarted
           FROM app.booking_authorization_request r WHERE r.id = $1`,
        [outcome.result.request_id],
      );
      expect(request.rows[0]!.dates).toEqual(request.rows[0]!.unstarted);
      expect(await lifecycleFacts(h, id)).toEqual(facts);
      const authorizations = await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.booking_authorization WHERE request_id = $1 OR id = $1`,
        [outcome.result.request_id],
      );
      expect(authorizations.rows[0]!.n).toBe(0);
    });

    it('[D11][T-1314] base e referência de incidente: forma de dado pessoal recusada; nunca em log, outbox ou resultado', async () => {
      const id = await bookNow(h, co.titulares[0]!, co.homeId, at(64), at(65));
      const personal = await run.asAdmin(admin, run.handlers.openException, {
        ...target(co.homeId, id),
        exception_type: 'operational',
        reason: 'security',
        basis: 'Contato do hóspede 123.456.789-01',
      });
      expect(personal).toMatchObject({
        status: 'rejected',
        operationId: null,
        code: 'ERR_VALIDATION',
      });
      const email = await run.asAdmin(admin, run.handlers.openException, {
        ...target(co.homeId, id),
        exception_type: 'unauthorized_booking',
        incident_ref: 'fulano@exemplo.com',
        basis: BASIS,
      });
      expect(email).toMatchObject({ code: 'ERR_VALIDATION' });

      const marker = `ADM-${randomUUID().slice(0, 8)}`;
      const incident = `INC-${randomUUID().slice(0, 8)}`;
      const opened = await run.asAdmin(admin, run.handlers.openException, {
        ...target(co.homeId, id),
        exception_type: 'unauthorized_booking',
        incident_ref: incident,
        basis: `Relatório ${marker}`,
      });
      expect(opened).toMatchObject({ status: 'committed' });
      if (opened.status !== 'committed') return;
      const resolved = await run.asAdmin(admin, run.handlers.resolveException, {
        ...target(co.homeId, id),
        exception_id: opened.result.exception_id,
        outcome: 'confirmed',
        basis: `Encerramento ${marker}`,
      });
      const requested = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
        ...target(co.homeId, id),
        purpose: 'no_show',
        basis: `Pedido ${marker}`,
      });

      await expectMarkerConfined(h, run.logs, marker, [opened, resolved, requested]);
      await expectMarkerConfined(h, run.logs, incident, [opened, resolved, requested]);
      // Onde a base fica: a linha de domínio e a auditoria interna (TECH-092).
      const kept = await h.database.pool.query<{ transition: boolean; audit: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM app.booking_state_transition WHERE basis LIKE '%' || $1 || '%') AS transition,
                EXISTS (SELECT 1 FROM app.audit_log WHERE after::text LIKE '%' || $1 || '%') AS audit`,
        [marker],
      );
      expect(kept.rows[0]).toEqual({ transition: true, audit: true });
    });
  });
});
