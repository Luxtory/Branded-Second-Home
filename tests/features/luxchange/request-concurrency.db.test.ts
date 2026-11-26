import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import type { CommandHandler, DatabaseTransaction } from '@/features/platform';
import { addDays } from '../booking/booking-support';
import { activate, bookNow, connect, openOperation } from '../booking/lifecycle-support';
import {
  creditsHarness,
  lotRow,
  originate,
  reactivate,
  secondTitular,
  suspend,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { staffRunner } from '../pricing/pricing-support';
import { depositRunner, openDepositOperation, type DepositHarness } from './luxchange-support';
import {
  ageRequest,
  closeRequest,
  newRequester,
  pricedNights,
  publishNights,
  requestFixture,
  requestRow,
  sendRequest,
  writeClosing,
  writeRequest,
  type ClosingCommand,
  type RequestFixture,
  type RequestSpec,
  type SentRequest,
} from './request-support';

/**
 * W21 E1 — concorrência com PostgreSQL real e intercalação controlada (`03` §12 CONC-13 a CONC-17; ADR-0037 §6; TECH-053):
 * uma transação trava e espera, a outra tenta, a ordem dos COMMIT é imposta. Cada corrida termina com um vencedor só, sem
 * efeito parcial nem duplicidade; as invariantes rodam no `drop()`. O aceite (aceite alheio, aceite × exceção) é da W22.
 */
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const capacityRefused = { status: 'rejected', code: 'ERR_CAPACITY_UNAVAILABLE' };
const WAIT_LIMIT_MS = 15_000;

describe('W21 — Request sob concorrência (CONC-13 a CONC-17)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let d: DepositHarness;
  const pool = () => c.h.database.pool;

  /** Espera até `count` sessões aguardarem trava neste banco. */
  async function waiters(count: number): Promise<void> {
    const deadline = Date.now() + WAIT_LIMIT_MS;
    while (Date.now() < deadline) {
      const { rows } = await pool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (rows[0]!.n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`fewer than ${count} sessions waiting for a lock`);
  }

  /** Envio gravado e mantido aberto (travas presas) até `commit()`. */
  async function openSend(spec: RequestSpec) {
    const requester = spec.requester ?? c.titular;
    const holder = spec.holder ?? f.holder;
    const client = await connect(c.h.database.appUrl);
    await client.query('BEGIN');
    const op = await openDepositOperation(client, requester, holder.homeId, 'send_request');
    const sent = await writeRequest(client, op, f, spec);
    return {
      sent,
      async commit() {
        await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await client.query('COMMIT');
        await client.end();
      },
    };
  }

  /** Encerramento gravado e mantido aberto até `commit()`. */
  async function openClosing(
    request: SentRequest,
    command: ClosingCommand,
    requester: CreditTitular,
  ) {
    const client = await connect(c.h.database.appUrl);
    await client.query('BEGIN');
    const actor =
      command === 'withdraw_request'
        ? { kind: 'titular' as const, titular: requester }
        : { kind: 'system' as const };
    const op = await openOperation(client, command, actor);
    await writeClosing(client, op, request);
    return {
      async commit() {
        await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await client.query('COMMIT');
        await client.end();
      },
    };
  }

  /** Trava consultiva exclusiva presa por outra sessão (o "ato em andamento"), solta em `release()`. */
  async function holdKey(key: string) {
    const client = await connect(c.h.database.url);
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
    return {
      async release() {
        await client.query('COMMIT');
        await client.end();
      },
    };
  }
  const nightKey = (homeId: string, night: string) =>
    `app.second_home_date:${homeId.toLowerCase()}:${night}`;
  const settle = <T>(promise: Promise<T>) =>
    promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

  const ownerUnit = (r: CreditTitular, night: string) => ({
    kind: 'owner_night' as const,
    holdingId: r.holdingId,
    homeId: r.homeId,
    nights: [night],
  });
  /** Envio de 500 Créditos com a noite Owner `night` comprometida (200) e 300 em Garantia num lote novo. */
  async function ownerSpec(
    r: CreditTitular,
    night: string,
    holder = f.holder,
    reusedLot?: string,
  ): Promise<RequestSpec> {
    const lot = reusedLot ?? (await originate(c, '300', { titular: r }));
    const nights = await pricedNights(f, [5_000n], holder.homeId);
    return {
      requester: r,
      holder,
      nights,
      complement: [ownerUnit(r, night)],
      holds: [{ lotId: lot, quantity: '300' }],
    };
  }
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
  const occupied = async (homeId: string, night: string) =>
    (
      await pool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.date_occupancy WHERE second_home_id = $1 AND stay_date = $2 AND released_at IS NULL`,
        [homeId, night],
      )
    ).rows[0]!.n;

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking', 'own_use_lifecycle');
    d = { c, admin: { ...c.admin, role: 'admin' }, multiplierId: null, run: staffRunner(c.h) };
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  describe('[CONC-14] complemento × reserva própria e depósito da noite Owner', () => {
    it('envio primeiro: a reserva e o depósito esperam a noite e são recusados depois do COMMIT', async () => {
      const r = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], r.homeId);
      const send = await openSend(await ownerSpec(r, night!));
      const booking = settle(
        c.h.book(r, {
          second_home_id: r.homeId,
          checkin_date: night!,
          checkout_date: addDays(night!, 1),
        }),
      );
      const deposit = settle(
        depositRunner(
          d,
          r,
        )({
          second_home_id: r.homeId,
          nights: [night!],
          expected_night_credits: ['200'],
          expected_credits: '200',
          expected_validity_months: 18,
        }),
      );
      await waiters(2);
      await send.commit();
      expect(await booking).toEqual({ ok: true, value: expect.objectContaining(capacityRefused) });
      expect(await deposit).toEqual({ ok: true, value: expect.objectContaining(capacityRefused) });
      expect(await occupied(r.homeId, night!)).toBe(0);
      expect(await requestRow(pool(), send.sent.requestId)).toMatchObject({ state: 'pending' });
    });

    it('reserva primeiro: o envio espera a noite e é recusado pela ocupação; nada do envio fica gravado', async () => {
      const r = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], r.homeId);
      const spec = await ownerSpec(r, night!);
      const gate = await holdKey(nightKey(r.homeId, night!));
      const booking = settle(bookNow(c.h, r, r.homeId, night!, addDays(night!, 1)));
      await waiters(1);
      const send = settle(sendRequest(f, spec));
      await waiters(2);
      await gate.release();
      expect(await booking).toMatchObject({ ok: true });
      expect(await send).toEqual({ ok: false, error: constraint('custody_complement_source') });
      expect(await occupied(r.homeId, night!)).toBe(1);
      expect(await lotRow(pool(), spec.holds[0]!.lotId)).toMatchObject({
        held: '0',
        available: '300',
      });
    });
  });

  describe('[CONC-13] complemento × cancelamento da reserva Co-Owner', () => {
    let co: CreditTitular;
    beforeAll(async () => {
      const scenario = await c.h.coOwnerScenario();
      const titular = scenario.titulares[0]!;
      await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
      co = { ...titular, homeId: scenario.homeId };
    }, 240_000);
    async function booked() {
      const nights = f.freshNights(2);
      await publishNights(c, co.homeId, Object.fromEntries(nights.map((night) => [night, 3_000n])));
      const bookingId = await bookNow(c.h, co, co.homeId, nights[0]!, addDays(nights[1]!, 1));
      const requested = await pricedNights(f, [5_000n]);
      const spec: RequestSpec = {
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
      };
      return { bookingId, nights, spec };
    }
    const bookingState = async (id: string) =>
      (await pool().query<{ state: string }>('SELECT state FROM app.booking WHERE id = $1', [id]))
        .rows[0]!.state;

    it('envio primeiro: o cancelamento espera e é recusado; a reserva segue confirmada e comprometida', async () => {
      const { bookingId, nights, spec } = await booked();
      const send = await openSend(spec);
      const cancellation = settle(cancel(co, bookingId, nights[0]!));
      await waiters(1);
      await send.commit();
      expect(await cancellation).toEqual({
        ok: true,
        value: expect.objectContaining(capacityRefused),
      });
      expect(await bookingState(bookingId)).toBe('confirmed');
    });

    it('cancelamento primeiro: o envio espera e é recusado pela reserva cancelada', async () => {
      const { bookingId, nights, spec } = await booked();
      const gate = await holdKey(nightKey(co.homeId, nights[0]!));
      const cancellation = settle(cancel(co, bookingId, nights[0]!));
      await waiters(1);
      const send = settle(sendRequest(f, spec));
      await waiters(2);
      await gate.release();
      expect(await cancellation).toEqual({
        ok: true,
        value: expect.objectContaining({ status: 'committed' }),
      });
      expect(await send).toEqual({ ok: false, error: constraint('luxchange_complement_booking') });
      expect(await bookingState(bookingId)).toBe('cancelled');
    });
  });

  it('[CONC-15] complemento × complemento do mesmo solicitante sobre a mesma noite: exatamente um confirma', async () => {
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    const first = await openSend(await ownerSpec(r, night!));
    const second = settle(sendRequest(f, await ownerSpec(r, night!)));
    await waiters(1);
    await first.commit();
    expect(await second).toEqual({
      ok: false,
      error: constraint('luxchange_complement_night_active'),
    });
    const { rows } = await pool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.luxchange_request_complement_night
        WHERE second_home_id = $1 AND stay_date = $2 AND state = 'active'`,
      [r.homeId, night],
    );
    expect(rows[0]!.n).toBe(1);
  });

  describe('[CONC-16][EC-20] capacidade solicitada × compromisso da mesma noite (estrutura da W21; o aceite é da W22)', () => {
    it('compromisso primeiro: a Request de outro membro espera a noite e é recusada', async () => {
      const x = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], x.homeId);
      const commit = await openSend(await ownerSpec(x, night!));
      const y = await newRequester(f);
      const lot = await originate(c, '200', { titular: y });
      const request = settle(
        sendRequest(f, {
          requester: y,
          holder: x,
          nights: [night!],
          holds: [{ lotId: lot, quantity: '200' }],
        }),
      );
      await waiters(1);
      await commit.commit();
      expect(await request).toEqual({
        ok: false,
        error: constraint('custody_committed_to_request'),
      });
    });

    it('Request primeiro: o compromisso espera, confirma (a capacidade solicitada não é bloqueada) e a Request alheia fica inelegível', async () => {
      const x = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], x.homeId);
      const y = await newRequester(f);
      const lot = await originate(c, '200', { titular: y });
      const request = await openSend({
        requester: y,
        holder: x,
        nights: [night!],
        holds: [{ lotId: lot, quantity: '200' }],
      });
      const commit = settle(sendRequest(f, await ownerSpec(x, night!)));
      await waiters(1);
      await request.commit();
      expect(await commit).toMatchObject({ ok: true });
      await closeRequest(f, request.sent, 'close_ineligible_request');
      expect(await requestRow(pool(), request.sent.requestId)).toMatchObject({
        state: 'cancelled_pre_accept',
        closure_reason: 'capacity_unavailable',
      });
    });
  });

  describe('[CONC-17][EC-21] expiração × reutilização do complemento', () => {
    it('job primeiro: o envio que materializaria espera a Request e falha; repetido sem materializar, confirma', async () => {
      const r = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], r.homeId);
      const oldSpec = await ownerSpec(r, night!);
      const old = await sendRequest(f, oldSpec);
      await ageRequest(f, old.requestId);
      const job = await openClosing(old, 'expire_requests', r);
      // A Garantia liberada pelo encerramento volta ao lote mais antigo: o FEFO do novo envio começa por ele.
      const spec = await ownerSpec(r, night!, f.holder, oldSpec.holds[0]!.lotId);
      const reuse = settle(sendRequest(f, { ...spec, materialize: [old] }));
      await waiters(1);
      await job.commit();
      expect(await reuse).toEqual({
        ok: false,
        error: constraint('conflict_luxchange_request_closed'),
      });
      await sendRequest(f, spec);
      expect(await requestRow(pool(), old.requestId)).toMatchObject({ state: 'expired' });
    });

    it('envio primeiro: materializa o encerramento; o job espera e encontra a Request encerrada', async () => {
      const r = await newRequester(f);
      const [night] = await pricedNights(f, [2_000n], r.homeId);
      const oldSpec = await ownerSpec(r, night!);
      const old = await sendRequest(f, oldSpec);
      await ageRequest(f, old.requestId);
      const reuse = await openSend({
        ...(await ownerSpec(r, night!, f.holder, oldSpec.holds[0]!.lotId)),
        materialize: [old],
      });
      const job = settle(closeRequest(f, old, 'expire_requests'));
      await waiters(1);
      await reuse.commit();
      expect(await job).toEqual({
        ok: false,
        error: constraint('conflict_luxchange_request_closed'),
      });
      const { rows } = await pool().query<{ refunds: number }>(
        `SELECT count(*)::int AS refunds FROM app.refund x JOIN app.fee_charge f ON f.payment_id = x.payment_id
          WHERE f.operation_id = $1`,
        [old.operationId],
      );
      expect(rows[0]!.refunds).toBe(1);
    });
  });

  it('[ADR-0037 §6] retirada × job de expiração: um encerramento e um estorno só', async () => {
    const r = await newRequester(f);
    const [night] = await pricedNights(f, [2_000n], r.homeId);
    const sent = await sendRequest(f, await ownerSpec(r, night!));
    await ageRequest(f, sent.requestId);
    const withdrawal = await openClosing(sent, 'withdraw_request', r);
    const job = settle(closeRequest(f, sent, 'expire_requests'));
    await waiters(1);
    await withdrawal.commit();
    expect(await job).toEqual({
      ok: false,
      error: constraint('conflict_luxchange_request_closed'),
    });
    const { rows } = await pool().query<{ transitions: number; refunds: number }>(
      `SELECT (SELECT count(*)::int FROM app.luxchange_request_transition WHERE request_id = $1) AS transitions,
              (SELECT count(*)::int FROM app.refund x JOIN app.fee_charge f ON f.payment_id = x.payment_id
                WHERE f.operation_id = $2) AS refunds`,
      [sent.requestId, sent.operationId],
    );
    expect(rows[0]).toEqual({ transitions: 1, refunds: 1 });
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({
      state: 'expired',
      closure_reason: 'expired',
    });
  });

  it('[CONC-8][INV-6] dois envios sobre os mesmos Créditos: exatamente um confirma', async () => {
    const r = await newRequester(f);
    const lot = await originate(c, '100', { titular: r });
    const nights = await pricedNights(f, [600n]);
    const first = await openSend({ requester: r, nights, holds: [{ lotId: lot, quantity: '60' }] });
    const second = settle(
      sendRequest(f, { requester: r, nights, holds: [{ lotId: lot, quantity: '60' }] }),
    );
    await waiters(1);
    await first.commit();
    expect(await second).toEqual({ ok: false, error: constraint('credits_available_nonnegative') });
    expect(await lotRow(pool(), lot)).toMatchObject({ held: '60', available: '40' });
  });

  it('[TECH-053][EC-17] envio × suspensão do Membership do detentor: a suspensão espera o envio e torna a Request inelegível', async () => {
    const holder = await secondTitular(c);
    const r = await newRequester(f);
    const lot = await originate(c, '500', { titular: r });
    const nights = await pricedNights(f, [5_000n], holder.homeId);
    const send = await openSend({
      requester: r,
      holder,
      nights,
      holds: [{ lotId: lot, quantity: '500' }],
    });
    const suspension = settle(suspend(c, holder.partyId));
    await waiters(1);
    await send.commit();
    expect(await suspension).toMatchObject({ ok: true });
    await reactivate(c, holder.partyId);
    await closeRequest(f, send.sent, 'close_ineligible_request');
    expect(await requestRow(pool(), send.sent.requestId)).toMatchObject({
      closure_reason: 'holder_membership',
    });
  });
});
