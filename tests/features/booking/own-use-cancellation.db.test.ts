import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWN_USE_BOOKING_CANCELLED } from '@/features/booking';
import { CapabilityNotActivatedError } from '@/features/platform';
import {
  addDays,
  bookableStart,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
  type OwnerScenario,
  type Titular,
} from './booking-support';
import {
  activate,
  addAdmin,
  bookNow,
  bookingRow,
  cancellationTerms,
  deactivate,
  historicBooking,
  historicCoOwnerScenario,
  historicOwnerScenario,
  lastStartedNight,
  lifecycleFacts,
  type Admin,
} from './lifecycle-support';
import {
  commandTraces,
  expectLifecycleEvent,
  lifecycleRunner,
  outboxOf,
} from './own-use-lifecycle-support';

/**
 * `cancel_own_use_booking` pelo handler real, com o executor de produção e o guard do Titular, sobre o PostgreSQL com os
 * privilégios reais (spec booking §10.3, §10.5, §10.12). Reservas futuras pelo command da W12; períodos iniciados por
 * fixture histórica (o banco decide pelo relógio do servidor, T3).
 */
describe('W13 E2 — cancelamento pelo Titular (cancel_own_use_booking)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let owner: OwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let S: string;
  let So: string;
  let first: string;
  const s = (offset: number) => addDays(S, offset);
  const so = (offset: number) => addDays(So, offset);
  const at = (offset: number) => addDays(first, offset);

  async function cancel(t: Titular, bookingId: string, homeId: string, key?: string) {
    const terms = await cancellationTerms(h.database.pool, bookingId);
    return run.asTitular(
      t,
      run.handlers.cancelOwnUseBooking,
      {
        second_home_id: homeId,
        booking_id: bookingId,
        expected_cancellation_class: terms.cancellationClass,
        expected_first_affected_date: terms.firstAffectedDate,
      },
      key,
    );
  }

  async function openException(
    homeId: string,
    bookingId: string,
    type: 'operational' | 'unauthorized_booking',
  ) {
    const input =
      type === 'operational'
        ? { exception_type: type, reason: 'casualty' }
        : { exception_type: type, incident_ref: 'INC-2027-007' };
    const outcome = await run.asAdmin(admin, run.handlers.openException, {
      second_home_id: homeId,
      booking_id: bookingId,
      basis: 'Relatório da administração ADM-77',
      ...input,
    });
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    return outcome.result.exception_id;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    owner = await historicOwnerScenario(h);
    admin = await addAdmin(h);
    S = await lastStartedNight(h, co.homeId);
    So = await lastStartedNight(h, owner.homeId);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  it('[REQ-080][BR-280] Co-Owner tempestivo: libera todas, spe_pool e restore por noite; evento e replay idêntico', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(20), at(23));
    const key = randomUUID();

    const outcome = await cancel(a, id, co.homeId, key);

    expect(outcome).toMatchObject({
      status: 'committed',
      replayed: false,
      result: {
        booking_id: id,
        state: 'cancelled',
        cancellation_class: 'timely',
        released_dates: [at(20), at(21), at(22)],
        forfeited_nights: null,
      },
    });
    if (outcome.status !== 'committed') return;
    const restored = outcome.result.restored!;
    expect(restored.alta + restored.media + restored.leap).toBe(3);
    expect(outcome.result.cancelled_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(await lifecycleFacts(h, id)).toMatchObject({
      state: 'cancelled',
      cancellation_class: 'timely',
      transitions: 1,
      active_occupancies: 0,
      released: 3,
      reserved: 0,
      restores: 3,
      corrections: 0,
    });
    const payload = await expectLifecycleEvent(
      h,
      outcome.operationId,
      OWN_USE_BOOKING_CANCELLED,
      id,
    );
    expect(payload).toMatchObject({
      cause: 'titular',
      exception_id: null,
      cancellation_class: 'timely',
      released_nights: 3,
      first_released_date: at(20),
      forfeited_nights: null,
    });
    const replay = await cancel(a, id, co.homeId, key);
    expect(replay).toEqual({ ...outcome, replayed: true });
    expect(await outboxOf(h, outcome.operationId)).toHaveLength(1);
  });

  it('[REQ-080][BR-281] Co-Owner tardio: as não iniciadas viram forfeited_right, consumo mantido, sem restore', async () => {
    const b = co.titulares[1]!;
    const id = await historicBooking(h, {
      homeId: co.homeId,
      titular: b,
      checkin: s(2),
      checkout: s(4),
    });
    const consumedBefore = (await lifecycleFacts(h, id)).consumed;

    const outcome = await cancel(b, id, co.homeId);

    expect(outcome).toMatchObject({
      status: 'committed',
      result: {
        cancellation_class: 'late',
        released_dates: [s(2), s(3)],
        restored: null,
        forfeited_nights: 2,
      },
    });
    expect(await lifecycleFacts(h, id)).toMatchObject({
      state: 'cancelled',
      cancellation_class: 'late',
      forfeited: 2,
      restores: 0,
      consumed: consumedBefore,
    });
    if (outcome.status === 'committed')
      expect(
        await expectLifecycleEvent(h, outcome.operationId, OWN_USE_BOOKING_CANCELLED, id),
      ).toMatchObject({ cancellation_class: 'late', restored: null, forfeited_nights: 2 });
  });

  it('[EC-10][REQ-080] período parcialmente iniciado: só as noites não iniciadas mudam; as iniciadas ficam mantidas', async () => {
    const a = co.titulares[0]!;
    const id = await historicBooking(h, {
      homeId: co.homeId,
      titular: a,
      checkin: s(-1),
      checkout: s(2),
    });

    const outcome = await cancel(a, id, co.homeId);

    expect(outcome).toMatchObject({
      status: 'committed',
      result: { cancellation_class: 'late', released_dates: [s(1)], forfeited_nights: 1 },
    });
    expect(await lifecycleFacts(h, id)).toMatchObject({
      active_occupancies: 2,
      released: 1,
      forfeited: 1,
    });
    const audit = await h.database.pool.query<{ after: { nights: unknown } }>(
      `SELECT after FROM app.audit_log WHERE operation_id = $1`,
      [outcome.operationId],
    );
    expect(audit.rows[0]!.after.nights).toEqual([
      { stay_date: s(-1), outcome: 'kept' },
      { stay_date: s(0), outcome: 'kept' },
      { stay_date: s(1), outcome: 'released' },
    ]);
  });

  it('[REQ-081][BR-163] Owner: sem classe, sem ledger, custódia owner, nada no Inventário', async () => {
    const t = owner.titular;
    const id = await bookNow(h, t, owner.homeId, at(5), at(7));

    const outcome = await cancel(t, id, owner.homeId);

    expect(outcome).toMatchObject({
      status: 'committed',
      result: {
        cancellation_class: null,
        released_dates: [at(5), at(6)],
        restored: null,
        forfeited_nights: null,
      },
    });
    const { rows } = await h.database.pool.query<{
      owner: number;
      luxtory: number;
      ledger: number;
    }>(
      `SELECT (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND stay_date = ANY($2::date[])
                AND closed_at IS NULL AND holder_kind = 'owner') AS owner,
              (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND holder_kind = 'luxtory') AS luxtory,
              (SELECT count(*)::int FROM app.use_right_ledger WHERE second_home_id = $1) AS ledger`,
      [owner.homeId, [at(5), at(6)]],
    );
    expect(rows[0]).toEqual({ owner: 2, luxtory: 0, ledger: 0 });
    if (outcome.status === 'committed')
      expect(
        await expectLifecycleEvent(h, outcome.operationId, OWN_USE_BOOKING_CANCELLED, id),
      ).toMatchObject({ cancellation_class: null, restored: null, forfeited_nights: null });
  });

  it('[REQ-080][D7][T-1308] termos diferentes da prévia → ERR_CANCELLATION_TERMS_CHANGED sem efeito, repetido igual', async () => {
    const b = co.titulares[1]!;
    const id = await historicBooking(h, {
      homeId: co.homeId,
      titular: b,
      checkin: s(5),
      checkout: s(6),
    });
    const before = await lifecycleFacts(h, id);
    const key = randomUUID();
    const wrong = {
      second_home_id: co.homeId,
      booking_id: id,
      expected_cancellation_class: 'timely',
      expected_first_affected_date: s(5),
    };

    const refused = await run.asTitular(b, run.handlers.cancelOwnUseBooking, wrong, key);
    expect(refused).toMatchObject({ status: 'rejected', code: 'ERR_CANCELLATION_TERMS_CHANGED' });
    expect(await run.asTitular(b, run.handlers.cancelOwnUseBooking, wrong, key)).toMatchObject({
      code: 'ERR_CANCELLATION_TERMS_CHANGED',
      replayed: true,
    });
    const wrongDate = {
      ...wrong,
      expected_cancellation_class: 'late',
      expected_first_affected_date: s(6),
    };
    expect(await run.asTitular(b, run.handlers.cancelOwnUseBooking, wrongDate)).toMatchObject({
      code: 'ERR_CANCELLATION_TERMS_CHANGED',
    });
    expect(await lifecycleFacts(h, id)).toEqual(before);
    expect(await commandTraces(h, key)).toMatchObject({ states: ['failed'], events: 0 });
    // A prévia emite chave nova com os termos atuais: aceito.
    expect(await cancel(b, id, co.homeId)).toMatchObject({ status: 'committed' });
  });

  it('[T-1309] reserva de outra party e reserva inexistente respondem igual: ERR_PERMISSION, sem efeito', async () => {
    const [a, b] = co.titulares as [Titular, Titular];
    const id = await bookNow(h, a, co.homeId, at(30), at(31));
    const terms = await cancellationTerms(h.database.pool, id);
    const input = (bookingId: string) => ({
      second_home_id: co.homeId,
      booking_id: bookingId,
      expected_cancellation_class: terms.cancellationClass,
      expected_first_affected_date: terms.firstAffectedDate,
    });

    const alien = await run.asTitular(b, run.handlers.cancelOwnUseBooking, input(id));
    const missing = await run.asTitular(b, run.handlers.cancelOwnUseBooking, input(randomUUID()));

    expect(alien).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
    expect(missing).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
    expect((await bookingRow(h.database.pool, id)).state).toBe('confirmed');
  });

  it('[ADR-0027 §5][D12] sem a K2: capability fechada, sem operação, recusa, evento ou efeito; a chave fica livre', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(34), at(35));
    const key = randomUUID();
    await deactivate(h, 'own_use_lifecycle');
    try {
      await expect(cancel(a, id, co.homeId, key)).rejects.toEqual(
        new CapabilityNotActivatedError('own_use_lifecycle'),
      );
      expect(await commandTraces(h, key)).toEqual({
        operations: 0,
        states: [],
        records: 0,
        events: 0,
      });
      expect((await bookingRow(h.database.pool, id)).state).toBe('confirmed');
    } finally {
      await activate(h, 'own_use_lifecycle');
    }
    expect(await cancel(a, id, co.homeId, key)).toMatchObject({
      status: 'committed',
      replayed: false,
    });
  });

  it('[TECH-055] sem noite não iniciada → ERR_STATE_TRANSITION; reserva já cancelada → ERR_STATE_TRANSITION', async () => {
    const a = co.titulares[0]!;
    const past = await historicBooking(h, {
      homeId: co.homeId,
      titular: a,
      checkin: s(-6),
      checkout: s(-4),
    });
    const input = {
      second_home_id: co.homeId,
      booking_id: past,
      expected_cancellation_class: 'late',
      expected_first_affected_date: s(-5),
    };

    expect(await run.asTitular(a, run.handlers.cancelOwnUseBooking, input)).toMatchObject({
      code: 'ERR_STATE_TRANSITION',
    });
    const id = await bookNow(h, a, co.homeId, at(38), at(39));
    expect(await cancel(a, id, co.homeId)).toMatchObject({ status: 'committed' });
    const again = await run.asTitular(a, run.handlers.cancelOwnUseBooking, {
      second_home_id: co.homeId,
      booking_id: id,
      expected_cancellation_class: 'timely',
      expected_first_affected_date: at(38),
    });
    expect(again).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
  });

  it('[PD-010][REQ-083] em exceção operacional o Titular cancela com as regras normais e encerra a exceção', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(42), at(44));
    const exceptionId = await openException(co.homeId, id, 'operational');

    const outcome = await cancel(a, id, co.homeId);

    expect(outcome).toMatchObject({
      status: 'committed',
      result: { cancellation_class: 'timely' },
    });
    const resolution = await h.database.pool.query(
      `SELECT outcome, resolution_source FROM app.booking_exception_resolution WHERE exception_id = $1`,
      [exceptionId],
    );
    expect(resolution.rows).toEqual([
      { outcome: 'cancelled', resolution_source: 'titular_cancellation' },
    ]);
    if (outcome.status === 'committed')
      expect(
        await expectLifecycleEvent(h, outcome.operationId, OWN_USE_BOOKING_CANCELLED, id),
      ).toMatchObject({
        cause: 'titular',
        exception_id: exceptionId,
        exception_type: 'operational',
      });
  });

  it('[REQ-084][EC-16] apuração: Co-Owner tardio suspenso, tempestivo encerra; Owner cancela a qualquer tempo', async () => {
    const [a, b] = co.titulares as [Titular, Titular];
    const late = await historicBooking(h, {
      homeId: co.homeId,
      titular: b,
      checkin: s(8),
      checkout: s(9),
    });
    await openException(co.homeId, late, 'unauthorized_booking');
    const suspended = await run.asTitular(b, run.handlers.cancelOwnUseBooking, {
      second_home_id: co.homeId,
      booking_id: late,
      expected_cancellation_class: 'late',
      expected_first_affected_date: s(8),
    });
    expect(suspended).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
    expect((await bookingRow(h.database.pool, late)).state).toBe('in_exception');

    const timely = await bookNow(h, a, co.homeId, at(46), at(47));
    await openException(co.homeId, timely, 'unauthorized_booking');
    expect(await cancel(a, timely, co.homeId)).toMatchObject({
      status: 'committed',
      result: { cancellation_class: 'timely' },
    });

    const ownerLate = await historicBooking(h, {
      homeId: owner.homeId,
      titular: owner.titular,
      checkin: so(-1),
      checkout: so(2),
    });
    await openException(owner.homeId, ownerLate, 'unauthorized_booking');
    expect(await cancel(owner.titular, ownerLate, owner.homeId)).toMatchObject({
      status: 'committed',
      result: { cancellation_class: null, released_dates: [so(1)] },
    });
  });
});
