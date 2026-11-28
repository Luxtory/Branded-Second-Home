import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asUser } from '../calendar/luxtory-selection-support';
import {
  activate,
  asOperation,
  bookNow,
  deactivate,
  insertTransition,
} from '../booking/lifecycle-support';
import { addDays } from '../booking/booking-support';
import {
  creditsHarness,
  insertEntry,
  publishValidity,
  secondTitular,
  suspend,
  TEST_VALIDITY_MONTHS,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { ownerDelegation } from '../../support/party-fixtures';
import {
  ageRequest,
  pricedNights,
  publishNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
  type SentRequest,
} from './request-support';
import { fundRequestCredits, writeAcceptance, writeRejection } from './w22-support';
import { publishMultiplier } from './luxchange-support';

describe('W22 E1 — efeitos do aceite e da recusa no PostgreSQL', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  const pool = () => c.h.database.pool;

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking');
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });
  afterEach(async () => {
    if (!c) return;
    const { rows } = await pool().query(
      `SELECT invariant, detail FROM app.booking_invariant_breaches()
       UNION ALL SELECT invariant, detail FROM app.credit_invariant_breaches()
       UNION ALL SELECT invariant, detail FROM app.luxchange_invariant_breaches()`,
    );
    expect(rows).toEqual([]);
  });

  async function guaranteed(holder = f.holder) {
    const requester = await secondTitular(c);
    const lotId = await fundRequestCredits(f, requester, '500');
    const nights = await pricedNights(f, [5_000n], holder.homeId);
    const sent = await sendRequest(f, {
      requester,
      holder,
      nights,
      holds: [{ lotId, quantity: '500' }],
    });
    return { requester, lotId, sent };
  }
  const accept = (sent: SentRequest, holder: CreditTitular = f.holder) =>
    asOperation(
      c.h.database.appUrl,
      'accept_request',
      { kind: 'titular', titular: holder },
      async (client, op) => ({ ...(await writeAcceptance(client, op, sent)), op }),
    );
  const reject = (sent: SentRequest, holder: CreditTitular) =>
    asOperation(
      c.h.database.appUrl,
      'reject_request',
      { kind: 'titular', titular: holder },
      async (client, op) => {
        await writeRejection(client, op, sent);
        return op;
      },
    );

  it.each([
    { name: 'sem complemento', g: '500', p: '0', use: '0', excess: '0' },
    { name: 'Garantia e complemento Owner', g: '300', p: '200', use: '200', excess: '0' },
    { name: 'complemento Co-Owner com excedente', g: '0', p: '600', use: '500', excess: '100' },
  ])('[REQ-060][REQ-064][PD-012][INV-6] $name', async ({ g, p, use, excess }) => {
    let requester: CreditTitular;
    if (excess === '100') {
      const scenario = await c.h.coOwnerScenario();
      requester = { ...scenario.titulares[0]!, homeId: scenario.homeId };
      await activateMembership(c.h.database.appUrl, c.admin, requester.partyId);
    } else requester = await secondTitular(c);

    const nights = await pricedNights(f, [5_000n]);
    let bookingId: string | undefined;
    const offered = p === '0' ? [] : f.freshNights(excess === '100' ? 2 : 1);
    if (offered.length) {
      await publishNights(
        c,
        requester.homeId,
        Object.fromEntries(offered.map((night) => [night, offered.length === 2 ? 3_000n : 2_000n])),
      );
      if (excess === '100')
        bookingId = await bookNow(
          c.h,
          requester,
          requester.homeId,
          offered[0]!,
          addDays(offered.at(-1)!, 1),
        );
    }
    const holds =
      g === '0' ? [] : [{ lotId: await fundRequestCredits(f, requester, g), quantity: g }];
    const sent = await sendRequest(f, {
      requester,
      nights,
      holds,
      complement: offered.length
        ? [
            {
              kind: bookingId ? 'co_owner_booking' : 'owner_night',
              bookingId,
              homeId: requester.homeId,
              holdingId: requester.holdingId,
              nights: offered,
            },
          ]
        : [],
    });
    // Change the current validity after consent. The origin must still use the sending operation's version.
    const preview = (userId: string) =>
      asUser<{
        holder_credits: string;
        credit_validity_months: number;
        credit_expires_at: Date | null;
      }>(
        c.h.database.appUrl,
        userId,
        'SELECT holder_credits,credit_validity_months,credit_expires_at FROM app.luxchange_request_received WHERE id=$1',
        [sent.requestId],
      );
    if (p === '200') {
      await publishValidity(c.h, c.admin, TEST_VALIDITY_MONTHS + 1);
      await publishMultiplier(c, '20');
    }
    let result: Awaited<ReturnType<typeof accept>>;
    try {
      if (p === '200') {
        expect(await preview(f.holder.userId)).toEqual([
          {
            holder_credits: '500',
            credit_validity_months: TEST_VALIDITY_MONTHS,
            credit_expires_at: null,
          },
        ]);
        expect(await preview(requester.userId)).toEqual([]);
        expect(await preview(c.titular.userId)).toEqual([]);
        const [row] = await asUser<Record<string, unknown>>(
          c.h.database.appUrl,
          f.holder.userId,
          'SELECT * FROM app.luxchange_request_received WHERE id=$1',
          [sent.requestId],
        );
        expect(Object.keys(row!)).toEqual([
          'id',
          'holder_party_id',
          'second_home_id',
          'checkin',
          'checkout',
          'sent_at',
          'expires_at',
          'state',
          'closure_reason',
          'closed_at',
          'holder_credits',
          'credit_validity_months',
          'credit_expires_at',
        ]);
      }
      result = await accept(sent);
      if (p === '200') {
        const {
          rows: [lot],
        } = await pool().query<{ expires_at: Date }>(
          'SELECT expires_at FROM app.credit_lot WHERE id=$1',
          [result.holderLotId],
        );
        expect(await preview(f.holder.userId)).toEqual([
          {
            holder_credits: '500',
            credit_validity_months: TEST_VALIDITY_MONTHS,
            credit_expires_at: lot!.expires_at,
          },
        ]);
      }
    } finally {
      if (p === '200') {
        await publishValidity(c.h, c.admin, TEST_VALIDITY_MONTHS);
        await publishMultiplier(c, f.multiplier);
      }
    }
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({
      state: 'accepted',
      closure_reason: 'accepted',
    });
    const { rows: lots } = await pool().query(
      `SELECT l.party_id,trim_scale(l.quantity)::text AS quantity,trim_scale(l.consumed)::text AS consumed,
       trim_scale(l.available)::text AS available,l.originated_at=s.resolved_at AS at_accept,
       l.expires_at=app.credit_expires_at(s.resolved_at,app.luxchange_snapshot_parameter($2,'credit_validity_months')::int) AS valid
       FROM app.credit_lot l JOIN app.economic_snapshot s ON s.operation_id=l.origin_operation_id
       WHERE l.origin_operation_id=$1`,
      [result.op, sent.operationId],
    );
    expect(lots).toHaveLength(p === '0' ? 1 : 2);
    expect(lots).toContainEqual({
      party_id: f.holder.partyId,
      quantity: '500',
      consumed: '0',
      available: '500',
      at_accept: true,
      valid: true,
    });
    if (p !== '0')
      expect(lots).toContainEqual({
        party_id: requester.partyId,
        quantity: p,
        consumed: use,
        available: excess,
        at_accept: true,
        valid: true,
      });
    if (holds.length)
      expect(
        (
          await pool().query(
            'SELECT trim_scale(held)::text AS held,trim_scale(consumed)::text AS used FROM app.credit_lot WHERE id=$1',
            [holds[0]!.lotId],
          )
        ).rows,
      ).toEqual([{ held: '0', used: g }]);
    const {
      rows: [facts],
    } = await pool().query(
      `SELECT (SELECT count(*)::int FROM app.settlement WHERE operation_id=$1 AND fee_charge_id=$2) AS fee,
        (SELECT count(*)::int FROM app.date_custody d JOIN app.date_custody p ON p.id=d.parent_custody_id AND p.closed_by_operation=$1
          WHERE d.opened_by_operation=$1 AND d.inventory_origin='luxchange_cession' AND d.authorization_ref='request_destination:' || $3::text) AS destination,
        (SELECT count(*)::int FROM app.date_custody d JOIN app.date_custody p ON p.id=d.parent_custody_id AND p.closed_by_operation=$1
          WHERE d.opened_by_operation=$1 AND d.inventory_origin='luxchange_cession' AND d.authorization_ref='request_complement:' || $3::text) AS complement,
        (SELECT count(*)::int FROM app.luxchange_request_complement_night WHERE request_id=$3::uuid AND state='consumed') AS committed,
        (SELECT count(*)::int FROM app.date_occupancy WHERE booking_id=$4 AND channel='luxchange_request' AND released_at IS NULL) AS occupancy,
        (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id=$1) AS rights`,
      [result.op, sent.feeChargeId, sent.requestId, result.bookingId],
    );
    expect(facts).toEqual({
      fee: 1,
      destination: nights.length,
      complement: offered.length,
      committed: offered.length,
      occupancy: nights.length,
      rights: 0,
    });
    if (bookingId)
      expect(
        (
          await pool().query(
            `SELECT b.state,o.release_reason FROM app.booking b JOIN app.date_occupancy o ON o.booking_id=b.id
       WHERE b.id=$1 AND o.released_by_operation=$2`,
            [bookingId, result.op],
          )
        ).rows,
      ).toEqual(offered.map(() => ({ state: 'cancelled', release_reason: 'ceded' })));
    const read = (userId: string) =>
      asUser(c.h.database.appUrl, userId, 'SELECT id,channel FROM app.booking WHERE id=$1', [
        result.bookingId,
      ]);
    expect(await read(requester.userId)).toEqual([
      { id: result.bookingId, channel: 'luxchange_request' },
    ]);
    expect(await read(f.holder.userId)).toEqual([]);
    expect(await read(c.titular.userId)).toEqual([]);
    if (p === '0') {
      await expect(
        asOperation(
          c.h.database.appUrl,
          'advance_booking_states',
          { kind: 'system' },
          (client, op) =>
            insertTransition(client, op, {
              bookingId: result.bookingId,
              kind: 'advance',
              toState: 'in_use',
            }),
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'conflict_booking_advance_early' });
    }
    await expect(
      asUser(
        c.h.database.appUrl,
        requester.userId,
        'SELECT party_id FROM app.booking WHERE id=$1',
        [result.bookingId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(accept(sent)).rejects.toMatchObject({ code: '23514' });
  });

  it('[REQ-061][PD-006][REQ-096] recusa, inclusive após o prazo, libera os recursos com as quatro chaves fechadas', async () => {
    const holder = await secondTitular(c);
    const pending = await guaranteed(holder);
    const expired = await guaranteed(holder);
    await ageRequest(f, expired.sent.requestId);
    await suspend(c, holder.partyId);
    await deactivate(c.h, 'credits', 'payments', 'luxchange_deposit', 'luxchange_exchange');
    try {
      for (const [item, expected] of [
        [pending, 'declined'],
        [expired, 'expired'],
      ] as const) {
        const op = await reject(item.sent, holder);
        expect(await requestRow(pool(), item.sent.requestId)).toMatchObject({
          state: expected,
          closure_reason: expected,
        });
        expect(
          (
            await pool().query(
              `SELECT l.held,l.available,f.id AS fee_charge_id,x.state,x.amount_minor=f.amount_minor AS full FROM app.credit_lot l
           JOIN app.fee_charge f ON f.id=$2 JOIN app.fee_charge_reversal v ON v.fee_charge_id=f.id
           JOIN app.refund x ON x.payment_id=f.payment_id AND x.operation_id=v.operation_id
           WHERE l.id=$1 AND v.operation_id=$3`,
              [item.lotId, item.sent.feeChargeId, op],
            )
          ).rows,
        ).toEqual([
          {
            held: '0',
            available: '500',
            fee_charge_id: item.sent.feeChargeId,
            state: 'pending',
            full: true,
          },
        ]);
      }
    } finally {
      await activate(c.h, 'credits', 'payments', 'luxchange_deposit', 'luxchange_exchange');
    }
  });

  it('[BR-211][REQ-061] solicitante, terceiro e representante de ambas as parties não aceitam', async () => {
    const holder = await secondTitular(c);
    const { requester, sent } = await guaranteed(holder);
    for (const outsider of [requester, c.titular]) {
      await expect(accept(sent, outsider)).rejects.toMatchObject({
        code: expect.stringMatching(/^(42501|23514)$/),
      });
    }
    await ownerDelegation(pool(), { partyId: requester.partyId, userId: holder.userId });
    await expect(accept(sent, holder)).rejects.toMatchObject({
      code: expect.stringMatching(/^(42501|23514)$/),
    });
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
  });

  it('[PD-006][INV-2] sem apuração o COMMIT falha e desfaz cessão, reserva e consumo', async () => {
    const { sent, lotId } = await guaranteed();
    let effectsWritten = false;
    await expect(
      asOperation(
        c.h.database.appUrl,
        'accept_request',
        { kind: 'titular', titular: f.holder },
        async (client, op) => {
          await writeAcceptance(client, op, sent, [], { settle: async () => {} });
          effectsWritten = true;
        },
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(effectsWritten).toBe(true);
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(
      (
        await pool().query(
          `SELECT trim_scale(l.held)::text AS held,c.closed_at FROM app.credit_lot l,app.luxchange_request_night n
       JOIN app.date_custody c ON c.id=n.custody_id WHERE l.id=$1 AND n.request_id=$2`,
          [lotId, sent.requestId],
        )
      ).rows,
    ).toEqual([{ held: '500', closed_at: null }]);
  });

  it('[INV-6][TECH-073] a Garantia e o Fee de outro envio ficam vinculados à sua própria Request', async () => {
    const a = await guaranteed();
    const b = await guaranteed();
    for (const effect of ['credit', 'fee'] as const) {
      let invalidEffectReached = false;
      await expect(
        asOperation(
          c.h.database.appUrl,
          'accept_request',
          { kind: 'titular', titular: f.holder },
          async (client, op) => {
            const options =
              effect === 'credit'
                ? {
                    consumeGuarantee: async () => {
                      invalidEffectReached = true;
                      await insertEntry(client, op, {
                        lotId: b.lotId,
                        quantity: '500',
                        movement: 'consume',
                        from: 'held',
                        to: 'consumed',
                        parent: b.sent.holdIds[0],
                      });
                    },
                  }
                : {
                    settle: async () => {
                      invalidEffectReached = true;
                      await client.query(
                        `INSERT INTO app.settlement(id,operation_id,kind,fee_charge_id,amount_minor,currency)
             SELECT $1,$2,'luxchange_fee',id,amount_minor,currency FROM app.fee_charge WHERE id=$3`,
                        [randomUUID(), op, b.sent.feeChargeId],
                      );
                    },
                  };
            await writeAcceptance(client, op, a.sent, [], options);
          },
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(invalidEffectReached).toBe(true);
      for (const item of [a, b])
        expect(await requestRow(pool(), item.sent.requestId)).toMatchObject({ state: 'pending' });
    }
  });
});
