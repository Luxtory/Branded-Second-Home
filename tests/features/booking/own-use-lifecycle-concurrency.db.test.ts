import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import { createOwnUseLifecycleInventory } from '@/features/inventory';
import { waitForLockWaiter } from '../../support/platform-fixtures';
import {
  addDays,
  bookableStart,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
  type Titular,
} from './booking-support';
import {
  activate,
  addAdmin,
  asAuthorizer,
  authorize,
  bookNow,
  bookingRow,
  cancellationTerms,
  connect,
  historicBooking,
  historicCoOwnerScenario,
  lastStartedNight,
  lifecycleFacts,
  type Admin,
} from './lifecycle-support';
import { lifecycleRunner } from './own-use-lifecycle-support';

/**
 * Concorrência e idempotência do ciclo com transações reais (TECH-053, TECH-054, ADR-006; spec booking §10.11.1,
 * §10.12 D6): ordem de travas Ação → noites → reserva provada por sondagem, transições concorrentes com exatamente um
 * vencedor, uso × revogação, falha no meio com rollback integral e replay sem novo uso da autorização.
 */
describe('W13 E2 — concorrência, travas e idempotência do ciclo', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  /** Uma casa por teste com reserva em curso: só uma reserva ocupa a noite já iniciada. */
  let co2: CoOwnerScenario;
  let co3: CoOwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let S: string;
  let first: string;
  const s = (offset: number) => addDays(S, offset);
  const at = (offset: number) => addDays(first, offset);
  const BASIS = 'Registro da administração ADM-CONC';

  async function cancelInput(homeId: string, bookingId: string) {
    const terms = await cancellationTerms(h.database.pool, bookingId);
    return {
      second_home_id: homeId,
      booking_id: bookingId,
      expected_cancellation_class: terms.cancellationClass,
      expected_first_affected_date: terms.firstAffectedDate,
    };
  }

  async function authorizeNoShow(bookingId: string, homeId = co.homeId): Promise<string> {
    const outcome = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
      second_home_id: homeId,
      booking_id: bookingId,
      purpose: 'no_show',
      basis: BASIS,
    });
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    return authorize(
      h,
      outcome.result.request_id,
      `github-run:${Math.floor(Math.random() * 1e9) + 1}:1`,
    );
  }

  async function tryLock(key: string): Promise<boolean> {
    const { rows } = await h.database.pool.query<{ got: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS got`,
      [key],
    );
    return rows[0]!.got;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    co2 = await historicCoOwnerScenario(h);
    co3 = await historicCoOwnerScenario(h);
    admin = await addAdmin(h);
    S = await lastStartedNight(h, co.homeId);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  it('[TECH-053][ADR-0027 §2] ordem de travas: com a reserva presa, o cancelamento já segura a Ação e as noites', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(20), at(22));
    const input = await cancelInput(co.homeId, id);
    const holder = await connect(h.database.url);
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `app.booking:${id}`,
      ]);
      const pending = run.asTitular(a, run.handlers.cancelOwnUseBooking, input);
      await waitForLockWaiter(h.database.pool);

      expect(await tryLock(`app.stake:${a.stakeId}`)).toBe(false);
      expect(await tryLock(`app.second_home_date:${co.homeId}:${at(20)}`)).toBe(false);
      expect(await tryLock(`app.second_home_date:${co.homeId}:${at(21)}`)).toBe(false);
      await holder.query('COMMIT');
      expect(await pending).toMatchObject({ status: 'committed' });
    } finally {
      await holder.end();
    }
  });

  it('[T-1307][TECH-055] dois cancelamentos concorrentes (chaves diferentes): exatamente um vence', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(26), at(28));
    const input = await cancelInput(co.homeId, id);

    const outcomes = await Promise.all([
      run.asTitular(a, run.handlers.cancelOwnUseBooking, input),
      run.asTitular(a, run.handlers.cancelOwnUseBooking, input),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['committed', 'rejected']);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      code: 'ERR_STATE_TRANSITION',
    });
    expect(await lifecycleFacts(h, id)).toMatchObject({ transitions: 1, restores: 2 });
  });

  it('[ADR-006] envio duplo com a mesma chave: um efeito só e a mesma resposta', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(30), at(31));
    const input = await cancelInput(co.homeId, id);
    const key = randomUUID();

    const [one, two] = await Promise.all([
      run.asTitular(a, run.handlers.cancelOwnUseBooking, input, key),
      run.asTitular(a, run.handlers.cancelOwnUseBooking, input, key),
    ]);

    expect(one.status).toBe('committed');
    expect(two.status).toBe('committed');
    expect(one.operationId).toBe(two.operationId);
    expect(await lifecycleFacts(h, id)).toMatchObject({ transitions: 1, restores: 1 });
  });

  it('[TECH-053][BR-162] noites liberadas pelo cancelamento tempestivo: a outra Ação reserva logo depois, sem deadlock', async () => {
    const [a, b] = co.titulares as [Titular, Titular];
    const id = await bookNow(h, a, co.homeId, at(34), at(36));
    const input = await cancelInput(co.homeId, id);

    const [cancelled, booked] = await Promise.all([
      run.asTitular(a, run.handlers.cancelOwnUseBooking, input),
      h.book(b, { second_home_id: co.homeId, checkin_date: at(34), checkout_date: at(36) }),
    ]);

    expect(cancelled.status).toBe('committed');
    // Sem deadlock nem dupla ocupação: ou a criação veio depois do cancelamento, ou viu a noite ocupada.
    if (booked.status === 'rejected') {
      expect(booked.code).toBe('ERR_BOOKING_CONFLICT');
      expect(
        await h.book(b, { second_home_id: co.homeId, checkin_date: at(34), checkout_date: at(36) }),
      ).toMatchObject({ status: 'committed' });
    }
    const { rows } = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.date_occupancy
        WHERE second_home_id = $1 AND stay_date = ANY($2::date[]) AND released_at IS NULL`,
      [co.homeId, [at(34), at(35)]],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('[T-1307] cancelamento do Titular × no-show do Admin na mesma reserva: exatamente um vence', async () => {
    const b = co.titulares[1]!;
    const id = await historicBooking(h, {
      homeId: co.homeId,
      titular: b,
      checkin: s(-1),
      checkout: s(3),
    });
    await authorizeNoShow(id);
    const input = await cancelInput(co.homeId, id);

    const outcomes = await Promise.all([
      run.asTitular(b, run.handlers.cancelOwnUseBooking, input),
      run.asAdmin(admin, run.handlers.declareNoShow, {
        second_home_id: co.homeId,
        booking_id: id,
        basis: BASIS,
      }),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['committed', 'rejected']);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      code: expect.stringMatching(/^ERR_(STATE_TRANSITION|PERMISSION)$/),
    });
    expect((await lifecycleFacts(h, id)).transitions).toBe(1);
  });

  it('[T-1303][criterion 6] uso × revogação: exatamente um vence', async () => {
    const c = co2.titulares[0]!;
    const started = await lastStartedNight(h, co2.homeId);
    const id = await historicBooking(h, {
      homeId: co2.homeId,
      titular: c,
      checkin: addDays(started, -1),
      checkout: addDays(started, 2),
    });
    const authorizationId = await authorizeNoShow(id, co2.homeId);

    const [declared, revoked] = await Promise.allSettled([
      run.asAdmin(admin, run.handlers.declareNoShow, {
        second_home_id: co2.homeId,
        booking_id: id,
        basis: BASIS,
      }),
      asAuthorizer(h, (client) =>
        client.query(`SELECT app.revoke_booking_authorization($1, 'github-run:99:1')`, [
          authorizationId,
        ]),
      ),
    ]);

    const noShowWon = declared.status === 'fulfilled' && declared.value.status === 'committed';
    expect(revoked.status === 'fulfilled').toBe(!noShowWon);
    if (!noShowWon)
      expect(declared).toMatchObject({ status: 'fulfilled', value: { code: 'ERR_PERMISSION' } });
    expect((await bookingRow(h.database.pool, id)).state).toBe(noShowWon ? 'no_show' : 'confirmed');
  });

  it('[ADR-0027 §3][criterion 11] falha no meio desfaz tudo e a autorização continua utilizável; replay não usa de novo', async () => {
    const a = co3.titulares[0]!;
    const started = await lastStartedNight(h, co3.homeId);
    const id = await historicBooking(h, {
      homeId: co3.homeId,
      titular: a,
      checkin: addDays(started, -1),
      checkout: addDays(started, 4),
    });
    const authorizationId = await authorizeNoShow(id, co3.homeId);
    const real = createOwnUseLifecycleInventory();
    let releases = 0;
    const failing = createOwnUseLifecycleHandlers({
      inventory: {
        ...real,
        releaseOccupancy: async (tx, release) => {
          releases += 1;
          if (releases === 2) throw new Error('falha simulada no meio do fechamento');
          return real.releaseOccupancy(tx, release);
        },
      },
    });
    const input = { second_home_id: co3.homeId, booking_id: id, basis: BASIS };

    await expect(run.asAdmin(admin, failing.declareNoShow, input)).rejects.toThrow(
      'falha simulada',
    );
    expect(await lifecycleFacts(h, id)).toMatchObject({
      state: 'confirmed',
      transitions: 0,
      released: 0,
    });
    const uses = () =>
      h.database.pool
        .query<{ n: number }>(
          `SELECT count(*)::int AS n FROM app.booking_authorization_use WHERE authorization_id = $1`,
          [authorizationId],
        )
        .then((result) => result.rows[0]!.n);
    expect(await uses()).toBe(0);

    const key = randomUUID();
    const done = await run.asAdmin(admin, run.handlers.declareNoShow, input, key);
    expect(done).toMatchObject({ status: 'committed' });
    expect(await run.asAdmin(admin, run.handlers.declareNoShow, input, key)).toEqual({
      ...done,
      replayed: true,
    });
    expect(await uses()).toBe(1);
  });
});
