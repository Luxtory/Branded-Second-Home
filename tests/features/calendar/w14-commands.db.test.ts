import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createParameterHandlers } from '@/features/admin/parameters';
import { createGuestNominationHandlers } from '@/features/booking/presentation/guest-nomination-handlers';
import { createLuxtorySelectionHandlers } from '@/features/calendar/luxtory-selection';
import { CapabilityNotActivatedError } from '@/features/platform';
import {
  addDays,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
} from '../booking/booking-support';
import {
  activate,
  addAdmin,
  bookNow,
  cancellationTerms,
  deactivate,
  lastStartedNight,
  type Admin,
} from '../booking/lifecycle-support';
import { lifecycleRunner } from '../booking/own-use-lifecycle-support';
import { freeNights, sideEffects } from './luxtory-selection-support';
import {
  completeDrawWithCalendar,
  formalizeCoOwnerAt,
  LEAP_AHEAD,
  sealByFixture,
} from './use-right-support';

const HOUR_MS = 3_600_000;
const iso = (at: number) => new Date(at).toISOString();

describe('W14 E3 — commands pelo executor real (TECH-054): seleção Luxtory, set_parameter e nominate_guest', () => {
  let h: BookingHarness;
  let run: ReturnType<typeof lifecycleRunner>;
  let co: CoOwnerScenario;
  let admin: Admin;
  const selection = createLuxtorySelectionHandlers();
  const parameters = createParameterHandlers();
  const nomination = createGuestNominationHandlers();

  const select = (homeId: string, nights: { stay_date: string; purpose: string }[], key?: string) =>
    run.asAdmin(
      admin,
      selection.selectLuxtoryCapacity,
      { second_home_id: homeId, nights, basis: 'Ata W14' },
      key,
    );
  const publish = (homeId: string, extra: Record<string, unknown> = {}, key?: string) =>
    run.asAdmin(
      admin,
      parameters.setParameter,
      {
        second_home_id: homeId,
        key: 'guest_rules',
        value: 'Regras de convidados (texto de teste)',
        effective_from: null,
        effective_to: null,
        basis: 'Ata W14',
        ...extra,
      },
      key,
    );

  async function custodyOf(homeId: string, date: string) {
    const { rows } = await h.database.pool.query<{ holder_kind: string; purpose: string | null }>(
      `SELECT holder_kind, purpose FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
      [homeId, date],
    );
    return rows[0]!;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    run = lifecycleRunner(h);
    co = await h.coOwnerScenario(2);
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  describe('select_luxtory_capacity', () => {
    it('[TECH-051][ADR-0030] com a K3 fechada, a funcionalidade fica fechada: nada gravado, nem operação', async () => {
      await deactivate(h, 'luxtory_selection');
      const [night] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 1);
      const key = randomUUID();
      await expect(
        select(co.homeId, [{ stay_date: night!, purpose: 'maintenance' }], key),
      ).rejects.toBeInstanceOf(CapabilityNotActivatedError);
      const { rows } = await h.database.pool.query(
        `SELECT 1 FROM app.operation WHERE idempotency_key = $1`,
        [key],
      );
      expect(rows).toEqual([]);
      expect(await custodyOf(co.homeId, night!)).toMatchObject({ holder_kind: 'spe_pool' });
    });

    it('[REQ-036][TECH-022] seleciona noites com finalidade por data; replay devolve o mesmo; payload diferente conflita', async () => {
      await activate(h, 'own_use_booking', 'own_use_lifecycle', 'luxtory_selection');
      const [a, b] = await freeNights(h.database.pool, co.homeId, co.year, 'media', 2);
      const before = await sideEffects(h.database.pool, co.homeId);
      const key = randomUUID();
      const nights = [
        { stay_date: b!, purpose: 'marketing' },
        { stay_date: a!, purpose: 'inventory' },
      ];
      const outcome = await select(co.homeId, nights, key);
      expect(outcome).toMatchObject({
        status: 'committed',
        result: {
          second_home_id: co.homeId,
          selected: [
            { stay_date: a, purpose: 'inventory' },
            { stay_date: b, purpose: 'marketing' },
          ],
        },
      });
      expect(await custodyOf(co.homeId, a!)).toEqual({
        holder_kind: 'luxtory',
        purpose: 'inventory',
      });
      expect(await custodyOf(co.homeId, b!)).toEqual({
        holder_kind: 'luxtory',
        purpose: 'marketing',
      });
      expect(await sideEffects(h.database.pool, co.homeId)).toEqual(before);
      expect(await select(co.homeId, nights, key)).toMatchObject({
        status: 'committed',
        replayed: true,
      });
      expect(
        await select(co.homeId, [{ stay_date: a!, purpose: 'production' }], key),
      ).toMatchObject({
        status: 'rejected',
        code: 'ERR_IDEMPOTENCY_CONFLICT',
      });
    });

    it('[REQ-036][TECH-027][REQ-037] recusas funcionais: noite já selecionada, iniciada, 29/02, janela, Owner e entrada', async () => {
      const [taken] = await freeNights(h.database.pool, co.homeId, co.year, 'alta', 1);
      await select(co.homeId, [{ stay_date: taken!, purpose: 'promotion' }]);
      expect(await select(co.homeId, [{ stay_date: taken!, purpose: 'production' }])).toMatchObject(
        {
          status: 'rejected',
          code: 'ERR_CAPACITY_UNAVAILABLE',
        },
      );
      const started = await lastStartedNight(h, co.homeId);
      expect(
        await select(co.homeId, [{ stay_date: started, purpose: 'maintenance' }]),
      ).toMatchObject({
        code: 'ERR_CAPACITY_UNAVAILABLE',
      });
      const leap = await formalizeCoOwnerAt(h, 2, `${LEAP_AHEAD}-01-01`, new Date());
      await sealByFixture(h, leap.homeId, LEAP_AHEAD);
      await completeDrawWithCalendar(h, leap.acquisitionId);
      expect(
        await select(leap.homeId, [{ stay_date: `${LEAP_AHEAD}-02-29`, purpose: 'maintenance' }]),
      ).toMatchObject({
        code: 'ERR_CAPACITY_UNAVAILABLE',
      });
      expect(
        await select(leap.homeId, [{ stay_date: `${LEAP_AHEAD}-03-10`, purpose: 'maintenance' }]),
      ).toMatchObject({
        code: 'ERR_WINDOW_NOT_OPEN',
      });
      const owner = await h.ownerScenario();
      const [ownerNight] = (
        await h.database.pool.query<{ d: string }>(
          `SELECT stay_date::text AS d FROM app.second_home_date WHERE second_home_id = $1
             AND checkin_at > now() + interval '30 days' ORDER BY stay_date LIMIT 1`,
          [owner.homeId],
        )
      ).rows;
      expect(
        await select(owner.homeId, [{ stay_date: ownerNight!.d, purpose: 'maintenance' }]),
      ).toMatchObject({
        code: 'ERR_CAPACITY_UNAVAILABLE',
      });
      const { home } = await h.root();
      expect(
        await select(home.id, [{ stay_date: `${co.year}-03-10`, purpose: 'maintenance' }]),
      ).toMatchObject({
        code: 'ERR_NOT_FOUND',
      });
      for (const nights of [
        [],
        [{ stay_date: taken!, purpose: 'other' }],
        [
          { stay_date: taken!, purpose: 'marketing' },
          { stay_date: taken!, purpose: 'promotion' },
        ],
      ])
        expect(await select(co.homeId, nights)).toMatchObject({
          status: 'rejected',
          code: 'ERR_VALIDATION',
        });
      expect(
        await run.asTitular(co.titulares[0]!, selection.selectLuxtoryCapacity, {
          second_home_id: co.homeId,
          nights: [{ stay_date: taken!, purpose: 'marketing' }],
          basis: 'Ata W14',
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
    });

    it('[REQ-016][INV-4] lote acima da capacidade da categoria é recusado inteiro (ERR_USE_RIGHT_BALANCE)', async () => {
      const home = await h.coOwnerScenario(2);
      const media = await freeNights(h.database.pool, home.homeId, home.year, 'media', 7);
      const before = await sideEffects(h.database.pool, home.homeId);
      expect(
        await select(
          home.homeId,
          media.map((date) => ({ stay_date: date, purpose: 'maintenance' })),
        ),
      ).toMatchObject({ status: 'rejected', code: 'ERR_USE_RIGHT_BALANCE' });
      expect(await sideEffects(h.database.pool, home.homeId)).toEqual(before);
      expect(
        await select(
          home.homeId,
          media.slice(0, 6).map((date) => ({ stay_date: date, purpose: 'maintenance' })),
        ),
      ).toMatchObject({ status: 'committed' });
    });
  });

  describe('set_parameter', () => {
    it('[REQ-095][TECH-030] publica guest_rules; autoridade e autor do guard; replay devolve o mesmo', async () => {
      const home = await h.coOwnerScenario(2);
      const key = randomUUID();
      const outcome = await publish(home.homeId, {}, key);
      expect(outcome).toMatchObject({
        status: 'committed',
        result: { key: 'guest_rules', effective_to: null },
      });
      const { rows } = await h.database.pool.query(
        `SELECT authority, created_by, authorization_ref FROM app.parameter WHERE second_home_id = $1`,
        [home.homeId],
      );
      expect(rows).toEqual([
        { authority: 'admin', created_by: admin.userId, authorization_ref: 'Ata W14' },
      ]);
      expect(await publish(home.homeId, {}, key)).toMatchObject({
        status: 'committed',
        replayed: true,
      });
    });

    it('[REQ-095][D3] vigência: agendada bloqueia a imediata; término explícito nunca antecipado; começar nele é aceito', async () => {
      const home = await h.coOwnerScenario(2);
      const t0 = Date.now() + HOUR_MS;
      expect(
        await publish(home.homeId, { effective_from: iso(t0), effective_to: iso(t0 + HOUR_MS) }),
      ).toMatchObject({
        status: 'committed',
      });
      expect(await publish(home.homeId)).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
      expect(
        await publish(home.homeId, { effective_from: iso(t0 + HOUR_MS - 1000) }),
      ).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
      expect(await publish(home.homeId, { effective_from: iso(t0 + HOUR_MS) })).toMatchObject({
        status: 'committed',
      });
      expect(
        await publish(home.homeId, { effective_from: iso(Date.now() - 60_000) }),
      ).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
    });

    it('[REQ-095][TECH-051] entrada inválida, outro papel e Second Home inexistente são recusados', async () => {
      const home = await h.coOwnerScenario(2);
      for (const extra of [
        { value: '   ' },
        { basis: '' },
        { key: 'membership_base' },
        { effective_from: iso(Date.now() + 2 * HOUR_MS), effective_to: iso(Date.now() + HOUR_MS) },
      ])
        expect(await publish(home.homeId, extra)).toMatchObject({
          status: 'rejected',
          code: 'ERR_VALIDATION',
        });
      expect(
        await run.asTitular(home.titulares[0]!, parameters.setParameter, {
          second_home_id: home.homeId,
          key: 'guest_rules',
          value: 'Regras',
          effective_from: null,
          effective_to: null,
          basis: 'Ata W14',
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
    });
  });

  describe('nominate_guest', () => {
    let home: CoOwnerScenario;
    let booking: string;

    const nominate = (
      rulesId: string,
      key?: string,
      titular = home.titulares[0]!,
      bookingId = booking,
    ) =>
      run.asTitular(
        titular,
        nomination.nominateGuest,
        { second_home_id: home.homeId, booking_id: bookingId, guest_rules_id: rulesId },
        key,
      );

    beforeAll(async () => {
      await activate(h, 'own_use_booking', 'own_use_lifecycle');
      home = await h.coOwnerScenario(2);
      const [night] = await freeNights(h.database.pool, home.homeId, home.year, 'media', 1);
      booking = await bookNow(h, home.titulares[0]!, home.homeId, night!, addDays(night!, 1));
    });

    it('[REQ-092][TECH-001] sem guest_rules vigente → ERR_PARAMETER_MISSING', async () => {
      expect(await nominate(randomUUID())).toMatchObject({
        status: 'rejected',
        code: 'ERR_PARAMETER_MISSING',
      });
    });

    it('[REQ-092][BR-330][BR-331][BR-332] declara sob a versão vigente; mudança de regras e repetição são recusadas', async () => {
      const v1 = await publish(home.homeId);
      if (v1.status !== 'committed') throw new Error('rules fixture');
      const before = await sideEffects(h.database.pool, home.homeId);
      const key = randomUUID();
      expect(await nominate(v1.result.parameter_id, key)).toMatchObject({
        status: 'committed',
        result: { booking_id: booking, guest_rules_id: v1.result.parameter_id },
      });
      expect(await sideEffects(h.database.pool, home.homeId)).toEqual(before);
      expect(await nominate(v1.result.parameter_id, key)).toMatchObject({
        status: 'committed',
        replayed: true,
      });
      expect(await nominate(v1.result.parameter_id)).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
      const v2 = await publish(home.homeId);
      if (v2.status !== 'committed') throw new Error('rules fixture');
      expect(await nominate(v1.result.parameter_id)).toMatchObject({
        code: 'ERR_GUEST_RULES_CHANGED',
      });
      expect(await nominate(v2.result.parameter_id)).toMatchObject({ status: 'committed' });
    });

    it('[REQ-092][TECH-050] outro Titular ou o Admin não declaram; reserva cancelada não recebe declaração', async () => {
      const { rows } = await h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.parameter_at('guest_rules', $1, clock_timestamp())`,
        [home.homeId],
      );
      const rules = rows[0]!.id;
      expect(await nominate(rules, undefined, home.titulares[1]!)).toMatchObject({
        code: 'ERR_PERMISSION',
      });
      expect(
        await run.asAdmin(admin, nomination.nominateGuest, {
          second_home_id: home.homeId,
          booking_id: booking,
          guest_rules_id: rules,
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
      const [night] = await freeNights(h.database.pool, home.homeId, home.year, 'media', 1);
      const other = await bookNow(h, home.titulares[0]!, home.homeId, night!, addDays(night!, 1));
      const terms = await cancellationTerms(h.database.pool, other);
      expect(
        await run.asTitular(home.titulares[0]!, run.handlers.cancelOwnUseBooking, {
          second_home_id: home.homeId,
          booking_id: other,
          expected_cancellation_class: terms.cancellationClass,
          expected_first_affected_date: terms.firstAffectedDate,
        }),
      ).toMatchObject({ status: 'committed' });
      expect(await nominate(rules, undefined, home.titulares[0]!, other)).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
    });
  });
});
