import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresBillingStore } from '@/features/billing';
import { createOwnUseCessionPort } from '@/features/booking';
import { createPostgresCreditStore } from '@/features/credits';
import { createLuxchangeCessionInventory } from '@/features/inventory';
import {
  createAcceptRequestHandler,
  createAcceptRequestProductionHandler,
  createSendRequestProductionHandler,
  type AcceptRequestResult,
} from '@/features/luxchange';
import { processRequestRefunds } from '@/features/luxchange/application/request-flow';
import { createPostgresRequestAcceptanceStore } from '@/features/luxchange/infrastructure/postgres-request-acceptance';
import { createLuxchangeConsumers } from '@/features/luxchange/jobs';
import { systemClock, type CommandOutcome } from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { activate, bookNow, deactivate } from '../booking/lifecycle-support';
import { addDays, revokeDelegation, secondRepresentative } from '../booking/booking-support';
import {
  creditsHarness,
  lotRow,
  publishValidity,
  reactivate,
  suspend,
  TEST_VALIDITY_MONTHS,
  type CreditTitular,
  type CreditsHarness,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { staffRunner } from '../pricing/pricing-support';
import { eventValidator } from '../../support/asyncapi';
import { ownerDelegation } from '../../support/party-fixtures';
import { deferred } from '../../support/platform-fixtures';
import { changePrl, publishMultiplier } from './luxchange-support';
import { requestApp } from './request-app-support';
import {
  ageRequest,
  newRequester,
  payFee,
  pricedNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
} from './request-support';
import { fundRequestCredits } from './w22-support';

describe('W22 E2 — aceite pelo executor real', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking', 'own_use_lifecycle');
  }, 240_000);
  afterAll(async () => c?.h.close());
  afterEach(async () => {
    const { rows } = await c.h.database.pool
      .query(`SELECT invariant FROM app.luxchange_invariant_breaches()
      UNION ALL SELECT invariant FROM app.booking_invariant_breaches()
      UNION ALL SELECT invariant FROM app.credit_invariant_breaches()`);
    expect(rows).toEqual([]);
  });

  const db = () => c.h.database.pool;
  const inputFor = (requestId: string, holder = f.holder) => ({
    party_id: holder.partyId,
    request_id: requestId,
    expected_credits: '500',
  });
  const handler = () => createAcceptRequestProductionHandler(c.h.db);
  const accept = (requestId: string, holder = f.holder) =>
    requestApp(f).executorFor(holder)(handler(), inputFor(requestId, holder));

  async function guaranteed(nights: readonly string[]) {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '500');
    const request = await sendRequest(f, {
      requester,
      holder: f.holder,
      nights,
      holds: [{ lotId, quantity: '500' }],
    });
    return { requester, lotId, request };
  }

  it('[REQ-061][REQ-064][PD-012] confirma sem complemento e faz replay sem repetir a economia', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const { requester, lotId, request } = await guaranteed(nights);
    const pool = db();
    const run = requestApp(f).executorFor(f.holder);
    const command = handler();
    const input = inputFor(request.requestId);
    const key = randomUUID();

    await deactivate(c.h, 'luxchange_deposit');
    const committed = await run(command, input, key).finally(() =>
      activate(c.h, 'luxchange_deposit'),
    );
    expect(committed).toMatchObject({
      status: 'committed',
      result: {
        receipt: {
          request_id: request.requestId,
          state: 'accepted',
          nights,
          holder_lot: { credits: '500' },
        },
        refund_ids: [],
      },
    });
    expect(await run(command, input, key)).toEqual({ ...committed, replayed: true });
    expect(await run(command, { ...input, expected_credits: '501' }, key)).toMatchObject({
      code: 'ERR_IDEMPOTENCY_CONFLICT',
    });
    expect(await accept(request.requestId)).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
    expect(await requestRow(pool, request.requestId)).toMatchObject({ state: 'accepted' });
    expect(await lotRow(pool, lotId)).toMatchObject({ held: '0', consumed: '500' });
    const { rows } = await pool.query(
      `SELECT channel, party_id, holding_id, stake_id, state FROM app.booking WHERE opened_by_operation = $1`,
      [committed.operationId],
    );
    expect(rows).toEqual([
      {
        channel: 'luxchange_request',
        party_id: requester.partyId,
        holding_id: null,
        stake_id: null,
        state: 'confirmed',
      },
    ]);
  });

  it.each([
    {
      name: 'Owner com Garantia e complemento',
      coOwner: false,
      guarantee: '300',
      potential: '200',
      consumed: '200',
      excess: '0',
    },
    {
      name: 'Co-Owner dos dois lados, G zero e excedente',
      coOwner: true,
      guarantee: '0',
      potential: '600',
      consumed: '500',
      excess: '100',
    },
  ])(
    '[REQ-060][REQ-064][PD-012] $name preserva os termos do envio',
    async ({ coOwner, guarantee, potential, consumed, excess }) => {
      async function coOwnerTitular(): Promise<CreditTitular> {
        const scenario = await c.h.coOwnerScenario();
        const member = { ...scenario.titulares[0]!, homeId: scenario.homeId };
        await activateMembership(c.h.database.appUrl, c.admin, member.partyId);
        return member;
      }
      const holder = coOwner ? await coOwnerTitular() : f.holder;
      const requester = coOwner ? await coOwnerTitular() : await newRequester(f);
      const nights = await pricedNights(f, [5_000n], holder.homeId);
      const offered = await pricedNights(
        f,
        coOwner ? [3_000n, 3_000n] : [2_000n],
        requester.homeId,
      );
      const book = (member: CreditTitular, dates: readonly string[]) =>
        bookNow(c.h, member, member.homeId, dates[0]!, addDays(dates.at(-1)!, 1));
      const holderBooking = coOwner ? await book(holder, nights) : undefined;
      const offeredBooking = coOwner ? await book(requester, offered) : undefined;
      const original = guarantee === '0' ? null : await fundRequestCredits(f, requester, guarantee);
      const sent = await sendRequest(f, {
        requester,
        holder,
        nights,
        holderBookingId: holderBooking,
        holds: original === null ? [] : [{ lotId: original, quantity: guarantee }],
        complement: [
          {
            kind: coOwner ? 'co_owner_booking' : 'owner_night',
            homeId: requester.homeId,
            holdingId: requester.holdingId,
            nights: offered,
            bookingId: offeredBooking,
          },
        ],
      });
      if (coOwner) {
        await deactivate(c.h, 'luxchange_deposit');
        try {
          await expect(accept(sent.requestId, holder)).rejects.toMatchObject({
            capability: 'luxchange_deposit',
          });
        } finally {
          await activate(c.h, 'luxchange_deposit');
        }
      }
      if (!coOwner)
        expect(
          await changePrl(
            { c, admin: { ...c.admin, role: 'admin' }, multiplierId: null, run: staffRunner(c.h) },
            holder.homeId,
            { [nights[0]!]: '9000' },
          ),
        ).toMatchObject({ status: 'committed' });
      await publishMultiplier(c, '20');
      await publishValidity(c.h, c.admin, TEST_VALIDITY_MONTHS + 1);
      const result = await accept(sent.requestId, holder).finally(async () => {
        await publishMultiplier(c, f.multiplier);
        await publishValidity(c.h, c.admin, TEST_VALIDITY_MONTHS);
      });
      expect(result).toMatchObject({
        status: 'committed',
        result: { receipt: { holder_lot: { credits: '500' } } },
      });
      const op = result.operationId;
      if (original !== null)
        expect(await lotRow(db(), original)).toMatchObject({ held: '0', consumed: guarantee });
      const facts = await db().query(
        `SELECT l.party_id, trim_scale(l.quantity)::text AS quantity,
      trim_scale(l.available)::text AS available, trim_scale(l.consumed)::text AS consumed,
      l.expires_at = app.credit_expires_at(s.resolved_at, $2) AS frozen_validity
      FROM app.credit_lot l JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
      WHERE l.origin_operation_id = $1`,
        [op, TEST_VALIDITY_MONTHS],
      );
      expect(facts.rows).toHaveLength(2);
      expect(facts.rows).toEqual(
        expect.arrayContaining([
          {
            party_id: holder.partyId,
            quantity: '500',
            available: '500',
            consumed: '0',
            frozen_validity: true,
          },
          {
            party_id: requester.partyId,
            quantity: potential,
            available: excess,
            consumed,
            frozen_validity: true,
          },
        ]),
      );
      const ceded = await db().query(
        `SELECT
      (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation = $1 AND inventory_origin='luxchange_cession') AS cessions,
      (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation = $1 AND channel='luxchange_request') AS opened,
      (SELECT count(*)::int FROM app.date_occupancy WHERE released_by_operation = $1 AND release_reason='ceded') AS released,
      (SELECT count(*)::int FROM app.booking_state_transition WHERE operation_id = $1 AND kind='cession') AS bookings,
      (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id = $1) AS rights,
      (SELECT count(*)::int FROM app.settlement WHERE operation_id = $1) AS settlements`,
        [op],
      );
      expect(ceded.rows).toEqual([
        {
          cessions: nights.length + offered.length,
          opened: nights.length,
          released: coOwner ? nights.length + offered.length : 0,
          bookings: coOwner ? 2 : 0,
          rights: 0,
          settlements: 1,
        },
      ]);

      const event = await db().query<{ id: string }>(
        `SELECT id,event_type AS type,dedup_key,operation_id,
      to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,payload
      FROM app.outbox WHERE operation_id=$1`,
        [op],
      );
      expect(event.rows).toHaveLength(1);
      expect(eventValidator('luxchange.request_accepted')(event.rows[0])).toBe(true);
      const dispatch = () =>
        dispatchOutbox({
          store: createPostgresOutboxStore(c.h.db),
          consumers: new ConsumerRegistry(createLuxchangeConsumers({ clock: systemClock })),
          clock: systemClock,
          batchSize: 75,
          log: c.h.log,
        });
      expect((await dispatch()).failed).toBe(0);
      expect((await dispatch()).failed).toBe(0);
      const { rows } = await db().query(
        `SELECT recipient_party_id AS party,kind,data FROM app.notification WHERE event_id=$1 ORDER BY kind`,
        [event.rows[0]!.id],
      );
      const stay = {
        request_id: sent.requestId,
        second_home_id: holder.homeId,
        checkin: nights[0],
        checkout: addDays(nights.at(-1)!, 1),
      };
      expect(rows).toEqual([
        {
          party: requester.partyId,
          kind: 'luxchange.request_accepted',
          data: {
            ...stay,
            booking_id: expect.any(String),
            credits_required: '500',
            guarantee_credits: guarantee,
            complement_consumption: consumed,
            complement_excess: excess,
            ...(excess === '0' ? {} : { complement_credit_expires_at: expect.any(String) }),
          },
        },
        {
          party: holder.partyId,
          kind: 'luxchange.request_received_accepted',
          data: { ...stay, holder_credits: '500', holder_credit_expires_at: expect.any(String) },
        },
      ]);
    },
  );

  it('[REQ-061][BR-211][REQ-064] falha fechada por autoridade, termos, Membership, prazo e capabilities', async () => {
    const { requester, request } = await guaranteed(await pricedNights(f, [5_000n]));
    const id = request.requestId;
    const input = inputFor(id);
    const run = requestApp(f).executorFor(f.holder);
    expect(await accept(id, requester)).toMatchObject({ code: 'ERR_NOT_FOUND' });
    expect(await accept(randomUUID())).toMatchObject({ code: 'ERR_NOT_FOUND' });
    expect(await run(handler(), { ...input, expected_credits: '500.000000000001' })).toMatchObject({
      code: 'ERR_REQUEST_TERMS_CHANGED',
    });
    expect(await run(handler(), input, '')).toMatchObject({ code: 'ERR_VALIDATION' });
    for (const capability of ['credits', 'payments', 'luxchange_exchange'] as const) {
      await deactivate(c.h, capability);
      try {
        await expect(accept(id)).rejects.toMatchObject({ capability });
      } finally {
        await activate(c.h, capability);
      }
    }
    await suspend(c, requester.partyId);
    try {
      expect(await accept(id)).toMatchObject({ code: 'ERR_MEMBERSHIP_INELIGIBLE' });
    } finally {
      await reactivate(c, requester.partyId);
    }
    const representative = { ...f.holder, ...(await secondRepresentative(c.h, f.holder)) };
    const command = handler();
    expect(
      await requestApp(f).executorFor(representative)(
        {
          ...command,
          async execute(context) {
            await revokeDelegation(c.h, representative.userId);
            return command.execute(context);
          },
        },
        input,
      ),
    ).toMatchObject({ code: 'ERR_PERMISSION' });
    await ownerDelegation(db(), { partyId: requester.partyId, userId: f.holder.userId });
    expect(await accept(id)).toMatchObject({ code: 'ERR_PERMISSION' });
    const expired = await guaranteed(await pricedNights(f, [5_000n]));
    await ageRequest(f, expired.request.requestId);
    expect(await accept(expired.request.requestId)).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
    expect(await requestRow(db(), id)).toMatchObject({ state: 'pending' });
  });

  it('[REQ-063][TECH-024][CONC-4] envio real durante a trava da noite causa 40001 e o retry inclui a concorrente', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await guaranteed(nights);
    const rival = await newRequester(f);
    const rivalLot = await fundRequestCredits(f, rival, '500');
    const app = requestApp(f);
    const shape = app.shape(rival, nights);
    const quote = await app.quote(rival, shape);
    const fee = await payFee(f, BigInt(quote.fee_amount_minor), rival);
    const send = createSendRequestProductionHandler(c.h.db);
    const senderReady = deferred<number>();
    const commitSender = deferred();
    const sending = app.executorFor(rival)(
      {
        ...send,
        async execute(context) {
          const result = await send.execute(context);
          const { rows } = await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(
            context.tx,
          );
          senderReady.resolve(rows[0]!.pid);
          await commitSender.promise;
          return result;
        },
      },
      app.sendInput(shape, quote, fee),
    );

    const attemptReady = deferred<number>();
    const retryReady = deferred();
    const allowRetry = deferred();
    const attempts: { id: string; xid: string; locks: unknown; input: unknown }[] = [];
    const failures: unknown[] = [];
    const command = handler();
    const run = app.executorFor(f.holder, 2);
    const input = inputFor(winner.request.requestId);
    const key = randomUUID();
    const refundCalls = f.gateway.calls.refunds;
    let accepting: Promise<CommandOutcome<AcceptRequestResult>> | undefined;
    try {
      const senderPid = await Promise.race([
        senderReady.promise,
        sending.then(() => {
          throw new Error('send finished before the barrier');
        }),
      ]);
      accepting = run(
        {
          ...command,
          async execute(context) {
            const { rows } = await sql<{
              pid: number;
              xid: string;
              isolation: string;
            }>`SELECT pg_backend_pid() AS pid,
          pg_current_xact_id()::text AS xid, current_setting('transaction_isolation') AS isolation`.execute(
              context.tx,
            );
            const { pid, xid, isolation } = rows[0]!;
            expect(isolation).toBe('read committed');
            attempts.push({
              id: context.operationId,
              xid,
              locks: context.locks,
              input: context.input,
            });
            if (attempts.length === 1) attemptReady.resolve(pid);
            if (attempts.length === 2) {
              retryReady.resolve();
              await allowRetry.promise;
            }
            try {
              return await command.execute(context);
            } catch (error) {
              failures.push(error);
              throw error;
            }
          },
        },
        input,
        key,
      );
      const acceptPid = await Promise.race([
        attemptReady.promise,
        accepting.then(() => {
          throw new Error('accept finished before the barrier');
        }),
      ]);
      await expect
        .poll(
          async () => {
            const { rows } = await db().query<{ blocked: boolean }>(
              `SELECT $1::int = ANY(pg_blocking_pids($2)) AS blocked`,
              [senderPid, acceptPid],
            );
            return rows[0]?.blocked;
          },
          { interval: 25, timeout: 8_000 },
        )
        .toBe(true);
      commitSender.resolve();
      const sent = await sending;
      if (sent.status !== 'committed') throw new Error(`send did not commit: ${sent.code}`);
      const rivalId = sent.result.request_id;
      await Promise.race([
        retryReady.promise,
        accepting.then(() => {
          throw new Error('accept did not reach the retry barrier');
        }),
      ]);

      expect(failures).toEqual([expect.objectContaining({ code: '40001' })]);
      const op = attempts[0]!.id;
      expect(attempts[1]!.id).toBe(op);
      expect(attempts[1]!.input).toBe(attempts[0]!.input);
      expect(attempts[1]!.xid).not.toBe(attempts[0]!.xid);
      expect(attempts[1]!.locks).not.toBe(attempts[0]!.locks);
      expect((await db().query('SELECT id FROM app.operation WHERE id=$1', [op])).rows).toEqual([]);
      for (const id of [winner.request.requestId, rivalId])
        expect(await requestRow(db(), id)).toMatchObject({ state: 'pending' });
      expect(await lotRow(db(), winner.lotId)).toMatchObject({ held: '500', consumed: '0' });
      expect(await lotRow(db(), rivalLot)).toMatchObject({ held: '500', available: '0' });
      allowRetry.resolve();
      const result = await accepting;
      if (result.status !== 'committed') throw new Error(`accept did not commit: ${result.code}`);
      expect(result.operationId).toBe(op);
      expect(Object.keys(result.result.receipt).sort()).toEqual([
        'booking_id',
        'holder_lot',
        'nights',
        'request_id',
        'state',
      ]);
      expect(JSON.stringify(result.result.receipt)).not.toContain(rivalId);
      expect(await run(command, input, key)).toEqual({ ...result, replayed: true });
      expect(await accept(rivalId)).toMatchObject({ code: 'ERR_CONCURRENT_CONFIRMATION' });
      expect(await requestRow(db(), winner.request.requestId)).toMatchObject({ state: 'accepted' });
      expect(await requestRow(db(), rivalId)).toMatchObject({
        state: 'cancelled_pre_accept',
        closure_reason: 'capacity_unavailable',
      });
      expect(await lotRow(db(), winner.lotId)).toMatchObject({ held: '0', consumed: '500' });
      expect(await lotRow(db(), rivalLot)).toMatchObject({ held: '0', available: '500' });
      expect(
        (
          await db().query(
            `SELECT
        (SELECT count(*)::int FROM app.booking WHERE opened_by_operation=$1) AS booking,
        (SELECT count(*)::int FROM app.credit_lot WHERE origin_operation_id=$1) AS lots,
        (SELECT count(*)::int FROM app.credit_entry WHERE operation_id=$1 AND movement='consume') AS consumed,
        (SELECT count(*)::int FROM app.settlement WHERE operation_id=$1) AS settled,
        (SELECT count(*)::int FROM app.luxchange_request_pending_conflicts($2)) AS pending,
        (SELECT count(*)::int FROM app.outbox WHERE operation_id=$1) AS events,
        (SELECT count(*)::int FROM app.audit_log WHERE operation_id=$1) AS audit,
        (SELECT count(*)::int FROM app.idempotency_record WHERE operation_id=$1 AND idempotency_key=$3) AS keys`,
            [op, winner.request.requestId, key],
          )
        ).rows,
      ).toEqual([
        { booking: 1, lots: 1, consumed: 1, settled: 1, pending: 0, events: 2, audit: 2, keys: 1 },
      ]);
      expect(
        (
          await db().query(
            `SELECT x.id,x.state,x.amount_minor=f.amount_minor AS full
        FROM app.refund x JOIN app.fee_charge f ON f.payment_id=x.payment_id
        JOIN app.fee_charge_reversal v ON v.fee_charge_id=f.id AND v.operation_id=x.operation_id
        WHERE x.operation_id=$1`,
            [op],
          )
        ).rows,
      ).toEqual([{ id: result.result.refund_ids[0], state: 'pending', full: true }]);
      const events = await db().query<{ type: string }>(
        `SELECT id,event_type AS type,dedup_key,operation_id,
        to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,payload
        FROM app.outbox WHERE operation_id=$1 ORDER BY event_type`,
        [op],
      );
      expect(events.rows).toEqual([
        expect.objectContaining({
          type: 'luxchange.request_accepted',
          dedup_key: `luxchange.request_accepted:${winner.request.requestId}`,
        }),
        expect.objectContaining({
          type: 'luxchange.request_closed',
          dedup_key: `luxchange.request_closed:${rivalId}`,
          payload: expect.objectContaining({
            request_id: rivalId,
            state: 'cancelled_pre_accept',
            reason: 'capacity_unavailable',
            guarantee_released: '500',
          }),
        }),
      ]);
      for (const event of events.rows) expect(eventValidator(event.type)(event)).toBe(true);
      expect(result.result.refund_ids).toHaveLength(1);
      expect(f.gateway.calls.refunds).toBe(refundCalls);
      const flow = app.flow(f.holder);
      await processRequestRefunds(flow, result.result.refund_ids, randomUUID());
      await processRequestRefunds(flow, result.result.refund_ids, randomUUID());
      expect(f.gateway.calls.refunds).toBe(refundCalls + 1);
    } finally {
      commitSender.resolve();
      allowRetry.resolve();
      await Promise.allSettled([sending, accepting]);
    }
  }, 120_000);

  it('[PD-006][INV-2] falta de apuração falha no COMMIT com 23514 e desfaz inclusive outbox e auditoria', async () => {
    const { request, lotId } = await guaranteed(await pricedNights(f, [5_000n]));
    const database = c.h.db;
    const command = createAcceptRequestHandler({
      store: createPostgresRequestAcceptanceStore(),
      bookings: createOwnUseCessionPort(),
      inventory: createLuxchangeCessionInventory(),
      credits: createPostgresCreditStore(),
      billing: {
        ...createPostgresBillingStore(database),
        insertSettlement: async () => randomUUID(),
      },
    });
    const attempts: string[] = [];
    const run = requestApp(f).executorFor(f.holder, 2);
    await expect(
      run(
        {
          ...command,
          async execute(context) {
            attempts.push(context.operationId);
            return command.execute(context);
          },
        },
        inputFor(request.requestId),
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'luxchange_request_accept_complete' });
    expect(attempts).toHaveLength(1);
    expect(await requestRow(db(), request.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(db(), lotId)).toMatchObject({ held: '500', consumed: '0' });
    const { rows } = await db().query(
      `SELECT
      (SELECT count(*)::int FROM app.operation WHERE id=$1) AS operations,
      (SELECT count(*)::int FROM app.economic_snapshot WHERE operation_id=$1) AS snapshots,
      (SELECT count(*)::int FROM app.booking WHERE opened_by_operation=$1) AS bookings,
      (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$1 OR closed_by_operation=$1) AS custodies,
      (SELECT count(*)::int FROM app.credit_lot WHERE origin_operation_id=$1) AS lots,
      (SELECT count(*)::int FROM app.credit_entry WHERE operation_id=$1) AS entries,
      (SELECT count(*)::int FROM app.outbox WHERE operation_id=$1) AS events,
      (SELECT count(*)::int FROM app.audit_log WHERE operation_id=$1) AS audit`,
      attempts,
    );
    expect(rows).toEqual([
      {
        operations: 0,
        snapshots: 0,
        bookings: 0,
        custodies: 0,
        lots: 0,
        entries: 0,
        events: 0,
        audit: 0,
      },
    ]);
  });
});
