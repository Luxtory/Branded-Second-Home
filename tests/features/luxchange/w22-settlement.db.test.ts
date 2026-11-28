import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishParameter } from '../billing/billing-support';
import { activate, asOperation } from '../booking/lifecycle-support';
import { creditsHarness, lotRow } from '../credits/credits-support';
import {
  closeRequest,
  newRequester,
  requestFixture,
  requestRow,
  sendGuaranteedRequest,
  type RequestFixture,
} from './request-support';
import {
  assertAcceptanceComplete,
  fundRequestCredits,
  writeAcceptance,
  writeAcceptedTransition,
  writeFeeSettlement,
} from './w22-support';

type Client = Parameters<typeof writeFeeSettlement>[0];

const violation = (constraint: string) => ({ code: '23514', constraint });

async function rejectedSettlement(client: Client, write: () => Promise<void>, expected: object) {
  await client.query('SAVEPOINT reject_settlement');
  await expect(write()).rejects.toMatchObject(expected);
  await client.query('ROLLBACK TO SAVEPOINT reject_settlement');
  await client.query('RELEASE SAVEPOINT reject_settlement');
}

describe('W22 E1 — apuração do Fee da Request vencedora [PD-006][TECH-082][TECH-083]', () => {
  let f: RequestFixture;
  const pool = () => f.c.h.database.pool;

  beforeAll(async () => {
    f = await requestFixture(await creditsHarness());
    await activate(f.c.h, 'luxchange_deposit');
  });
  afterAll(async () => f?.c.h.close());

  const acceptOperation = <T>(work: (client: Client, op: string) => Promise<T>) =>
    asOperation(
      f.c.h.database.appUrl,
      'accept_request',
      { kind: 'titular', titular: f.holder },
      work,
    );

  async function send() {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '500');
    const sent = await sendGuaranteedRequest(f, lotId, '500', requester);
    return { requester, lotId, sent };
  }

  it('apura uma vez pelo Fee pago da vencedora e preserva o valor original no COMMIT', async () => {
    const { requester, lotId, sent: winner } = await send();
    const { sent: another } = await send();
    await publishParameter(f.c, 'luxchange_fee_minimum', '18000');

    await expect(
      acceptOperation((client, op) => writeFeeSettlement(client, op, winner.feeChargeId)),
    ).rejects.toMatchObject(violation('luxchange_request_cession_binding'));

    let operationId = '';
    await acceptOperation(async (client, op) => {
      operationId = op;
      expect((await client.query('SELECT current_user AS role')).rows).toEqual([
        { role: 'luxtory_app' },
      ]);
      await writeAcceptance(client, op, winner, [], {
        settle: async () => {
          await rejectedSettlement(
            client,
            () => writeFeeSettlement(client, op, another.feeChargeId),
            violation('billing_settlement_origin'),
          );
          for (const [delta, currency] of [
            [1, 'BRL'],
            [0, 'USD'],
          ] as const) {
            await rejectedSettlement(
              client,
              async () => {
                await client.query(
                  `INSERT INTO app.settlement(id,operation_id,kind,amount_minor,currency,fee_charge_id)
               SELECT $1,$2,'luxchange_fee',amount_minor+$4::bigint,$5,id FROM app.fee_charge WHERE id=$3`,
                  [randomUUID(), op, winner.feeChargeId, delta, currency],
                );
              },
              violation('billing_settlement_fee_amount'),
            );
          }
          await writeFeeSettlement(client, op, winner.feeChargeId);
          await rejectedSettlement(
            client,
            () => writeFeeSettlement(client, op, winner.feeChargeId),
            {
              code: '23505',
              constraint: expect.stringMatching(
                /^(conflict_fee_charge_settlement|settlement_operation_kind_beneficiary_unique)$/,
              ),
            },
          );
          const { rows } = await client.query(
            `SELECT s.fee_charge_id,s.amount_minor::text,s.currency,s.beneficiary_party_id,
                  p.id AS payment_id,p.state AS payment_state,p.payer_party_id,
                  (SELECT value FROM app.parameter_at('luxchange_fee_minimum',NULL,clock_timestamp())) AS current_minimum
             FROM app.settlement s JOIN app.fee_charge f ON f.id=s.fee_charge_id
             JOIN app.payment p ON p.id=f.payment_id
            WHERE s.operation_id=$1 AND s.kind='luxchange_fee' AND f.operation_id=$2`,
            [op, winner.operationId],
          );
          expect(rows).toEqual([
            {
              fee_charge_id: winner.feeChargeId,
              amount_minor: '9876',
              currency: 'BRL',
              beneficiary_party_id: null,
              payment_id: winner.paymentId,
              payment_state: 'approved',
              payer_party_id: requester.partyId,
              current_minimum: '18000',
            },
          ]);
        },
      });
      await assertAcceptanceComplete(client, op);
    });

    expect(await requestRow(pool(), winner.requestId)).toMatchObject({ state: 'accepted' });
    expect(await lotRow(pool(), lotId)).toMatchObject({ held: '0', consumed: '500' });
    expect(
      (
        await pool().query(
          `SELECT (SELECT count(*)::int FROM app.settlement WHERE operation_id=$1 OR fee_charge_id=$2) AS settlements,
              (SELECT count(*)::int FROM app.credit_entry WHERE operation_id=$1) AS entries,
              (SELECT count(*)::int FROM app.credit_lot WHERE origin_operation_id=$1) AS lots,
              (SELECT count(*)::int FROM app.booking WHERE opened_by_operation=$1) AS bookings,
              (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation=$1) AS occupancies,
              (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$1 OR closed_by_operation=$1) AS custodies,
              (SELECT count(*)::int FROM app.operation WHERE id=$1) AS operations`,
          [operationId, winner.feeChargeId],
        )
      ).rows,
    ).toEqual([
      {
        settlements: 1,
        entries: 2,
        lots: 1,
        bookings: 1,
        occupancies: 1,
        custodies: 2,
        operations: 1,
      },
    ]);
  });

  it('mantém o Fee revertido fora da apuração', async () => {
    const { requester, sent: withdrawn } = await send();
    const closing = await closeRequest(f, withdrawn, 'withdraw_request', requester);

    await expect(
      acceptOperation((client, op) => writeAcceptedTransition(client, op, withdrawn.requestId)),
    ).rejects.toMatchObject(violation('conflict_luxchange_request_closed'));

    const { sent: another } = await send();
    await expect(
      acceptOperation(async (client, op) => {
        await writeAcceptedTransition(client, op, another.requestId);
        await writeFeeSettlement(client, op, withdrawn.feeChargeId);
      }),
    ).rejects.toMatchObject(violation('billing_settlement_origin'));

    expect(
      (
        await pool().query(
          `SELECT r.operation_id,x.state,
              EXISTS(SELECT 1 FROM app.settlement s WHERE s.fee_charge_id=r.fee_charge_id) AS settled
         FROM app.fee_charge_reversal r JOIN app.fee_charge f ON f.id=r.fee_charge_id
         JOIN app.refund x ON x.payment_id=f.payment_id AND x.operation_id=r.operation_id
        WHERE r.fee_charge_id=$1`,
          [withdrawn.feeChargeId],
        )
      ).rows,
    ).toEqual([{ operation_id: closing, state: 'pending', settled: false }]);
  });
});
