import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activate, openOperation } from '../booking/lifecycle-support';
import {
  creditsHarness,
  insertEntry,
  lotRow,
  move,
  publishValidity,
  TEST_VALIDITY_MONTHS,
} from '../credits/credits-support';
import { insertDepositLot, publishMultiplier } from './luxchange-support';
import {
  newRequester,
  pricedNights,
  prlForCredits,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
} from './request-support';
import {
  assertAcceptanceComplete,
  cedeRequestNights,
  fundRequestCredits,
  moveGuarantee,
  writeAcceptedTransition,
  writeDestinationBooking,
  writeFeeSettlement,
} from './w22-support';

type Client = Parameters<typeof insertDepositLot>[0];

const violation = (constraint: string) => ({ code: '23514', constraint });

async function rejectedWrite(
  client: Client,
  write: () => Promise<unknown>,
  constraint: string,
  message?: string,
) {
  await client.query('SAVEPOINT reject_credit_write');
  await expect(write()).rejects.toMatchObject({
    ...violation(constraint),
    ...(message && { message }),
  });
  await client.query('ROLLBACK TO SAVEPOINT reject_credit_write');
  await client.query('RELEASE SAVEPOINT reject_credit_write');
}

describe('W22 E1 — originação do aceite [PD-012][REQ-064][INV-6][TECH-044]', () => {
  let f: RequestFixture;
  const pool = () => f.c.h.database.pool;
  beforeAll(async () => {
    f = await requestFixture(await creditsHarness());
    await activate(f.c.h, 'luxchange_deposit');
  });
  afterAll(async () => f?.c.h.close());

  async function request(complementMinor: bigint, guarantee: string) {
    const requester = await newRequester(f);
    const nights = await pricedNights(f, [2_000n, 3_000n]);
    const lotId = guarantee === '0' ? null : await fundRequestCredits(f, requester, guarantee);
    const sent = await sendRequest(f, {
      requester,
      nights,
      holds: lotId ? [{ lotId, quantity: guarantee }] : [],
      complement:
        complementMinor > 0n
          ? [
              {
                kind: 'owner_night',
                homeId: requester.homeId,
                holdingId: requester.holdingId,
                nights: await pricedNights(f, [complementMinor], requester.homeId),
              },
            ]
          : [],
    });
    return { requester, sent, lotId };
  }

  // The owner connection can inspect invariants of uncommitted facts after resetting the local role.
  // All writes, including operation opening and COMMIT, run as luxtory_app.
  async function operation(work: (client: Client, op: string) => Promise<void>) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE luxtory_app');
      const op = await openOperation(client, 'accept_request', {
        kind: 'titular',
        titular: f.holder,
      });
      await work(client, op);
      await client.query("UPDATE app.operation SET state='committed' WHERE id=$1", [op]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const consume = (client: Client, op: string, lotId: string, quantity: string) =>
    insertEntry(client, op, {
      lotId,
      quantity,
      movement: 'consume',
      from: 'available',
      to: 'consumed',
    });

  it.each([
    { p: '200', g: '300', c: '200', e: '0', complementMinor: 2_000n },
    { p: '1100', g: '0', c: '500', e: '600', complementMinor: 11_000n },
    { p: '0', g: '500', c: '0', e: '0', complementMinor: 0n },
  ])(
    'consumo do complemento P=$p, Garantia G=$g, C=$c, E=$e',
    async ({ p, g, c, e, complementMinor }) => {
      const { requester, sent, lotId: guaranteeLot } = await request(complementMinor, g);
      const currentMonths = TEST_VALIDITY_MONTHS + 1;
      let operationId = '';
      await publishValidity(f.c.h, f.c.admin, currentMonths);
      await publishMultiplier(f.c, '20');
      try {
        await operation(async (client, op) => {
          operationId = op;
          expect((await client.query('SELECT current_user AS role')).rows).toEqual([
            { role: 'luxtory_app' },
          ]);
          await writeAcceptedTransition(client, op, sent.requestId);
          await cedeRequestNights(client, op, sent.requestId);
          await writeDestinationBooking(client, op, sent.requestId);
          await insertDepositLot(client, op, f.holder.partyId, '500');
          const complementLot =
            p === '0' ? null : await insertDepositLot(client, op, requester.partyId, p);
          await moveGuarantee(client, op, sent, 'consume');
          if (complementLot && c !== '0') await consume(client, op, complementLot, c);
          if (!complementLot)
            await rejectedWrite(
              client,
              () => insertDepositLot(client, op, requester.partyId, '1'),
              'credit_lot_origin',
            );
          await writeFeeSettlement(client, op, sent.feeChargeId);
          await assertAcceptanceComplete(client, op);
          const { rows } = await client.query(
            `SELECT l.party_id, l.quantity::text AS quantity, l.available::text AS available,
                l.consumed::text AS consumed, l.origin_command,
                l.originated_at=s.resolved_at AS at_accept,
                l.expires_at=app.credit_expires_at(s.resolved_at,$2::int) AS validity_from_send,
                l.expires_at<>app.credit_expires_at(s.resolved_at,$3::int) AS ignores_current_validity,
                (SELECT v.value::int FROM app.parameter_at('credit_validity_months',NULL,s.resolved_at) v) AS current_months,
                (SELECT v.value FROM app.parameter_at('credit_multiplier',NULL,s.resolved_at) v) AS current_multiplier
           FROM app.credit_lot l JOIN app.economic_snapshot s ON s.operation_id=l.origin_operation_id
          WHERE l.origin_operation_id=$1`,
            [op, TEST_VALIDITY_MONTHS, currentMonths],
          );
          expect(rows).toHaveLength(p === '0' ? 1 : 2);
          const expectedLot = (
            partyId: string,
            quantity: string,
            consumed: string,
            available: string,
          ) => ({
            party_id: partyId,
            quantity,
            consumed,
            available,
            origin_command: 'accept_request',
            at_accept: true,
            validity_from_send: true,
            ignores_current_validity: true,
            current_months: currentMonths,
            current_multiplier: '20',
          });
          expect(rows).toContainEqual(expectedLot(f.holder.partyId, '500', '0', '500'));
          if (p !== '0') expect(rows).toContainEqual(expectedLot(requester.partyId, p, c, e));
          if (guaranteeLot)
            expect(await lotRow(client, guaranteeLot)).toMatchObject({ held: '0', consumed: g });
          const { rows: debits } = await client.query(
            `SELECT from_bucket, sum(quantity)::text AS quantity, count(*)::int AS entries
             FROM app.credit_entry WHERE operation_id=$1 AND movement='consume'
             GROUP BY from_bucket ORDER BY from_bucket`,
            [op],
          );
          expect(debits).toEqual([
            ...(c === '0' ? [] : [{ from_bucket: 'available', quantity: c, entries: 1 }]),
            ...(g === '0' ? [] : [{ from_bucket: 'held', quantity: g, entries: 1 }]),
          ]);
          await client.query('RESET ROLE');
          expect(
            (
              await client.query(
                `SELECT invariant, detail FROM app.credit_invariant_breaches()
               UNION ALL SELECT invariant, detail FROM app.luxchange_invariant_breaches()`,
              )
            ).rows,
          ).toEqual([]);
          await client.query('SET LOCAL ROLE luxtory_app');
        });
      } finally {
        await publishMultiplier(f.c, f.multiplier);
        await publishValidity(f.c.h, f.c.admin, TEST_VALIDITY_MONTHS);
      }
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'accepted' });
      if (guaranteeLot)
        expect(await lotRow(pool(), guaranteeLot)).toMatchObject({ held: '0', consumed: g });
      const { rows: lots } = await pool().query<{ id: string; party_id: string }>(
        'SELECT id,party_id FROM app.credit_lot WHERE origin_operation_id=$1',
        [operationId],
      );
      expect(lots).toHaveLength(p === '0' ? 1 : 2);
      if (e !== '0') {
        const lotId = lots.find((lot) => lot.party_id === requester.partyId)!.id;
        expect(await lotRow(pool(), lotId)).toMatchObject({ available: e, consumed: c });
        await sendRequest(f, {
          requester,
          nights: await pricedNights(f, [prlForCredits(f, e)]),
          holds: [{ lotId, quantity: e }],
        });
        expect(await lotRow(pool(), lotId)).toMatchObject({ available: '0', held: e, consumed: c });
        const result = await pool().query(
          `SELECT invariant, detail FROM app.credit_invariant_breaches()
           UNION ALL SELECT invariant, detail FROM app.luxchange_invariant_breaches()
           UNION ALL SELECT invariant, detail FROM app.booking_invariant_breaches()`,
        );
        expect(result.rows).toEqual([]);
      }
    },
  );

  it('identifica cada efeito obrigatório ausente antes de permitir a conferência integral', async () => {
    const { requester, sent, lotId } = await request(2_000n, '300');
    let acceptance = '';
    await expect(
      operation(async (client, op) => {
        acceptance = op;
        const check = (message: string) =>
          rejectedWrite(
            client,
            () => assertAcceptanceComplete(client, op),
            'luxchange_request_accept_complete',
            message,
          );
        await check('acceptance requires its projected winning transition');
        await writeAcceptedTransition(client, op, sent.requestId);
        await rejectedWrite(
          client,
          () => assertAcceptanceComplete(client, op),
          'luxchange_request_cession_complete',
        );
        await cedeRequestNights(client, op, sent.requestId);
        await check('acceptance requires the destination booking');
        await writeDestinationBooking(client, op, sent.requestId);
        await insertDepositLot(client, op, f.holder.partyId, '500');
        await check('acceptance originates exactly the lots and validity bound to the Request');
        const complementLot = await insertDepositLot(client, op, requester.partyId, '200');
        await check('acceptance consumes every original Guarantee hold in full');
        await moveGuarantee(client, op, sent, 'consume');
        await check(
          'acceptance consumes exactly the bound complement amount and preserves its excess',
        );
        await consume(client, op, complementLot, '200');
        await check('acceptance settles the winning Fee in full without reversal');
      }),
    ).rejects.toMatchObject({
      ...violation('luxchange_request_accept_complete'),
      message: 'acceptance settles the winning Fee in full without reversal',
    });
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), lotId!)).toMatchObject({ held: '300', consumed: '0' });
    expect(
      (await pool().query('SELECT id FROM app.operation WHERE id=$1', [acceptance])).rows,
    ).toEqual([]);
  });

  it('rejeita originação sem vínculo, sem cessão e com valores alheios à Request', async () => {
    const { requester, sent } = await request(7_000n, '0');
    const another = await request(7_000n, '0');
    await expect(
      operation(async (client, op) => {
        await rejectedWrite(
          client,
          () => insertDepositLot(client, op, f.holder.partyId, '500'),
          'luxchange_request_cession_binding',
        );
        await writeAcceptedTransition(client, op, sent.requestId);
        await rejectedWrite(
          client,
          () => insertDepositLot(client, sent.operationId, f.holder.partyId, '500'),
          'inventory_operation_provenance',
        );
        await rejectedWrite(
          client,
          () => insertDepositLot(client, op, requester.partyId, '700'),
          'luxchange_request_cession_complete',
        );
        await cedeRequestNights(client, op, sent.requestId);
        await rejectedWrite(
          client,
          () => insertDepositLot(client, op, another.requester.partyId, '700'),
          'credit_lot_origin',
        );
        await rejectedWrite(
          client,
          () => insertDepositLot(client, op, f.holder.partyId, '501'),
          'luxchange_request_lot_quantity',
        );
        await rejectedWrite(
          client,
          () => insertDepositLot(client, op, requester.partyId, '701'),
          'luxchange_request_lot_quantity',
        );
      }),
    ).rejects.toMatchObject(violation('luxchange_request_accept_complete'));
    for (const fixture of [sent, another.sent])
      expect(await requestRow(pool(), fixture.requestId)).toMatchObject({ state: 'pending' });
  });

  it('consumo do complemento recusa lote incompatível, parcial, duplicado ou sem aceite', async () => {
    const { requester, sent } = await request(11_000n, '0');
    const another = await request(0n, '500');
    const requesterDeposit = await fundRequestCredits(f, requester, '500');
    await expect(
      operation(async (client, op) => {
        await rejectedWrite(
          client,
          () => consume(client, op, requesterDeposit, '500'),
          'luxchange_request_cession_binding',
        );
        await writeAcceptedTransition(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        await writeDestinationBooking(client, op, sent.requestId);
        const holderLot = await insertDepositLot(client, op, f.holder.partyId, '500');
        const complementLot = await insertDepositLot(client, op, requester.partyId, '1100');
        for (const id of [holderLot, requesterDeposit, another.lotId!])
          await rejectedWrite(
            client,
            () => consume(client, op, id, '500'),
            'credit_consume_complement',
          );
        for (const quantity of ['0', '499', '501'])
          await rejectedWrite(
            client,
            () => consume(client, op, complementLot, quantity),
            'credit_consume_complement',
          );
        await consume(client, op, complementLot, '500');
        expect(await lotRow(client, complementLot)).toMatchObject({
          available: '600',
          consumed: '500',
        });
        await rejectedWrite(
          client,
          () => consume(client, op, complementLot, '500'),
          'credit_complement_already_spent',
        );
      }),
    ).rejects.toMatchObject({
      ...violation('luxchange_request_accept_complete'),
      message: 'acceptance settles the winning Fee in full without reversal',
    });

    await expect(
      operation(async (client, op) => {
        await writeAcceptedTransition(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        await writeDestinationBooking(client, op, sent.requestId);
        await insertDepositLot(client, op, f.holder.partyId, '500');
        await insertDepositLot(client, op, requester.partyId, '1100');
      }),
    ).rejects.toMatchObject({
      ...violation('luxchange_request_accept_complete'),
      message: 'acceptance consumes exactly the bound complement amount and preserves its excess',
    });
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), requesterDeposit)).toMatchObject({
      available: '500',
      consumed: '0',
    });
    expect(await lotRow(pool(), another.lotId!)).toMatchObject({ held: '500', consumed: '0' });
  });

  it('preserva no ledger o consumo próprio de create_direct e a recusa para terceiros', async () => {
    const titular = await newRequester(f);
    const lotId = await fundRequestCredits(f, titular, '500');
    const debit = {
      lotId,
      movement: 'consume',
      from: 'available',
      to: 'consumed',
      quantity: '100',
    };
    await expect(
      move(f.c, 'create_direct', { kind: 'titular', titular: f.holder }, [debit]),
    ).rejects.toMatchObject(violation('credit_entry_mechanism'));
    await move(f.c, 'create_direct', { kind: 'titular', titular }, [debit]);
    expect(await lotRow(pool(), lotId)).toMatchObject({ available: '400', consumed: '100' });
  });
});
