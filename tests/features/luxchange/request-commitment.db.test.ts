import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import type { CommandHandler, DatabaseTransaction } from '@/features/platform';
import { addDays } from '../booking/booking-support';
import { activate, bookNow } from '../booking/lifecycle-support';
import {
  TEST_VALIDITY_MONTHS,
  creditsHarness,
  originate,
  reactivate,
  secondTitular,
  suspend,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { staffRunner } from '../pricing/pricing-support';
import { depositRunner, expectedCredits, type DepositHarness } from './luxchange-support';
import {
  ageRequest,
  closeRequest,
  newRequester,
  pricedNights,
  publishNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
} from './request-support';

/**
 * W21 E1 — compromisso efetivo das datas do complemento (PD-012 item 5; ADR-0037 §5–§6; TECH-024, TECH-044; EC-17, EC-19,
 * EC-20, EC-21). Enquanto a Request pode ser aceita, os atos do Titular sobre a unidade comprometida são recusados pelos
 * commands reais das W12/W13/W20 (`custody_committed_to_request` → `ERR_CAPACITY_UNAVAILABLE`); vencida ou inelegível, a
 * recusa cessa no mesmo instante, sem job e com o índice físico ainda `active`.
 */
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const capacityRefused = { status: 'rejected', code: 'ERR_CAPACITY_UNAVAILABLE' };

describe('W21 — compromisso efetivo do complemento por datas (ADR-0037 §5–§6)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let d: DepositHarness;
  const pool = () => c.h.database.pool;

  const depositInput = (homeId: string, nights: readonly string[], prlMinor: bigint) => ({
    second_home_id: homeId,
    nights,
    expected_night_credits: nights.map(() => expectedCredits(prlMinor)),
    expected_credits: expectedCredits(prlMinor * BigInt(nights.length)),
    expected_validity_months: TEST_VALIDITY_MONTHS,
  });
  const ownerUnit = (r: CreditTitular, night: string) => ({
    kind: 'owner_night' as const,
    holdingId: r.holdingId,
    homeId: r.homeId,
    nights: [night],
  });
  const unitState = async (requestId: string) =>
    (
      await pool().query<{ state: string }>(
        'SELECT DISTINCT state FROM app.luxchange_request_complement_night WHERE request_id = $1',
        [requestId],
      )
    ).rows.map((row) => row.state);
  const cancel = (titular: CreditTitular, bookingId: string, firstNight: string) =>
    depositRunner(d, titular)(
      {
        second_home_id: titular.homeId,
        booking_id: bookingId,
        expected_cancellation_class: 'timely',
        expected_first_affected_date: firstNight,
      },
      {
        handler: createOwnUseLifecycleHandlers().cancelOwnUseBooking as unknown as CommandHandler<
          unknown,
          never,
          DatabaseTransaction
        >,
      },
    );

  /** Request de 500 Créditos com a noite Owner `night` (200) comprometida e 300 em Garantia. */
  async function commitOwnerNight(r: CreditTitular, night: string, holder = f.holder) {
    const lot = await originate(c, '300', { titular: r });
    const nights = await pricedNights(f, [5_000n], holder.homeId);
    const sent = await sendRequest(f, {
      requester: r,
      holder,
      nights,
      complement: [ownerUnit(r, night)],
      holds: [{ lotId: lot, quantity: '300' }],
    });
    return { ...sent, lot };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking', 'own_use_lifecycle');
    d = { c, admin: { ...c.admin, role: 'admin' }, multiplierId: null, run: staffRunner(c.h) };
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[PD-012][EC-20] noite Owner comprometida: reserva própria, depósito, outro complemento e capacidade solicitada por outro membro são recusados', async () => {
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    await commitOwnerNight(r, night!);
    expect(
      await c.h.book(r, {
        second_home_id: r.homeId,
        checkin_date: night!,
        checkout_date: addDays(night!, 1),
      }),
    ).toMatchObject(capacityRefused);
    expect(await depositRunner(d, r)(depositInput(r.homeId, [night!], 2_000n))).toMatchObject(
      capacityRefused,
    );
    await expect(commitOwnerNight(r, night!)).rejects.toEqual(
      constraint('luxchange_complement_night_active'),
    );
    const other = await newRequester(f);
    const lot = await originate(c, '200', { titular: other });
    await expect(
      sendRequest(f, {
        requester: other,
        holder: r,
        nights: [night!],
        holds: [{ lotId: lot, quantity: '200' }],
      }),
    ).rejects.toEqual(constraint('custody_committed_to_request'));
  });

  it('[TECH-044][EC-21] vencido o prazo, sem job: nenhuma recusa residual com o índice ainda active; o encerramento posterior só libera', async () => {
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    const sent = await commitOwnerNight(r, night!);
    await ageRequest(f, sent.requestId);
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await unitState(sent.requestId)).toEqual(['active']);
    await bookNow(c.h, r, r.homeId, night!, addDays(night!, 1));
    await closeRequest(f, sent, 'expire_requests');
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'expired' });
    expect(await unitState(sent.requestId)).toEqual(['released']);
  });

  it('[EC-21][TECH-053] reutilização pelo mesmo solicitante materializa o encerramento na mesma transação; pendente aceitável não é encerrada pelo envio', async () => {
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    const first = await commitOwnerNight(r, night!);
    const nights = await pricedNights(f, [5_000n]);
    // A Garantia liberada pelo encerramento materializado volta ao FEFO na mesma transação: o novo envio a reutiliza.
    const reuse = {
      requester: r,
      nights,
      complement: [ownerUnit(r, night!)],
      holds: [{ lotId: first.lot, quantity: '300' }],
    };
    await expect(sendRequest(f, { ...reuse, materialize: [first] })).rejects.toEqual(
      constraint('luxchange_request_still_acceptable'),
    );
    await ageRequest(f, first.requestId);
    await expect(sendRequest(f, reuse)).rejects.toEqual(
      constraint('luxchange_complement_night_active'),
    );
    const second = await sendRequest(f, { ...reuse, materialize: [first] });
    const { rows } = await pool().query<{ state: string; reason: string; closed_by: string }>(
      `SELECT state, closure_reason AS reason, closed_by_operation AS closed_by FROM app.luxchange_request WHERE id = $1`,
      [first.requestId],
    );
    expect(rows[0]).toEqual({ state: 'expired', reason: 'expired', closed_by: second.operationId });
    expect(await unitState(first.requestId)).toEqual(['released']);
    expect(await unitState(second.requestId)).toEqual(['active']);
  });

  it('[EC-17][TECH-024] inelegibilidade provada (Membership do detentor) libera a data no mesmo instante, antes do encerramento', async () => {
    const holder = await secondTitular(c);
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    const sent = await commitOwnerNight(r, night!, holder);
    await suspend(c, holder.partyId);
    try {
      await bookNow(c.h, r, r.homeId, night!, addDays(night!, 1));
    } finally {
      await reactivate(c, holder.partyId);
    }
    await closeRequest(f, sent, 'close_ineligible_request');
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({
      state: 'cancelled_pre_accept',
      closure_reason: 'holder_membership',
    });
  });

  describe('reserva Co-Owner comprometida [PD-012][EC-17][EC-19]', () => {
    let co: CreditTitular;
    beforeAll(async () => {
      const scenario = await c.h.coOwnerScenario();
      const titular = scenario.titulares[0]!;
      await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
      co = { ...titular, homeId: scenario.homeId };
    }, 240_000);

    async function commitBooking() {
      const nights = f.freshNights(2);
      await publishNights(c, co.homeId, Object.fromEntries(nights.map((night) => [night, 3_000n])));
      const bookingId = await bookNow(c.h, co, co.homeId, nights[0]!, addDays(nights[1]!, 1));
      const requested = await pricedNights(f, [5_000n]);
      const sent = await sendRequest(f, {
        requester: co,
        nights: requested,
        complement: [
          {
            kind: 'co_owner_booking',
            holdingId: co.holdingId,
            homeId: co.homeId,
            bookingId,
            nights,
          },
        ],
        holds: [],
      });
      return { bookingId, nights, sent };
    }

    it('cancelamento e depósito da reserva são recusados enquanto efetivo; vencido o prazo, o cancelamento confirma sem job', async () => {
      const { bookingId, nights, sent } = await commitBooking();
      expect(await cancel(co, bookingId, nights[0]!)).toMatchObject(capacityRefused);
      expect(await depositRunner(d, co)(depositInput(co.homeId, nights, 3_000n))).toMatchObject(
        capacityRefused,
      );
      const { rows } = await pool().query<{ state: string }>(
        'SELECT state FROM app.booking WHERE id = $1',
        [bookingId],
      );
      expect(rows[0]!.state).toBe('confirmed');
      await ageRequest(f, sent.requestId);
      expect(await cancel(co, bookingId, nights[0]!)).toMatchObject({ status: 'committed' });
      await closeRequest(f, sent, 'expire_requests', co);
      expect(await unitState(sent.requestId)).toEqual(['released']);
    });

    it('a mesma reserva não entra em dois complementos; reserva não confirmada não é comprometida', async () => {
      const { bookingId, nights } = await commitBooking();
      const requested = await pricedNights(f, [5_000n]);
      await expect(
        sendRequest(f, {
          requester: co,
          nights: requested,
          complement: [
            {
              kind: 'co_owner_booking',
              holdingId: co.holdingId,
              homeId: co.homeId,
              bookingId,
              nights,
            },
          ],
          holds: [],
        }),
      ).rejects.toEqual(constraint('luxchange_complement_booking_active'));
    });
  });

  describe('capacidade solicitada [TECH-024][PD-005]', () => {
    it('Requests de membros diferentes coexistem sobre a mesma noite do detentor; reserva Co-Owner do detentor só inteira', async () => {
      const nights = await pricedNights(f, [5_000n]);
      for (let i = 0; i < 2; i += 1) {
        const r = await newRequester(f);
        const lot = await originate(c, '500', { titular: r });
        await sendRequest(f, { requester: r, nights, holds: [{ lotId: lot, quantity: '500' }] });
      }
      const scenario = await c.h.coOwnerScenario();
      const titular = scenario.titulares[0]!;
      await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
      const holder: CreditTitular = { ...titular, homeId: scenario.homeId };
      const booked = f.freshNights(2);
      await publishNights(
        c,
        holder.homeId,
        Object.fromEntries(booked.map((night) => [night, 5_000n])),
      );
      const bookingId = await bookNow(
        c.h,
        holder,
        holder.homeId,
        booked[0]!,
        addDays(booked[1]!, 1),
      );
      const r = await newRequester(f);
      const lot = await originate(c, '1000', { titular: r });
      await expect(
        sendRequest(f, {
          requester: r,
          holder,
          nights: booked.slice(0, 1),
          holderBookingId: bookingId,
          holds: [{ lotId: lot, quantity: '500' }],
        }),
      ).rejects.toEqual(constraint('luxchange_request_whole_booking'));
      await sendRequest(f, {
        requester: r,
        holder,
        nights: booked,
        holderBookingId: bookingId,
        holds: [{ lotId: lot, quantity: '1000' }],
      });
    });
  });
});
