import { processRefund } from '@/features/billing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activate, asOperation } from '../booking/lifecycle-support';
import {
  ageLot,
  creditsHarness,
  lotRow,
  monthsAgo,
  TEST_VALIDITY_MONTHS,
} from '../credits/credits-support';
import {
  ageRequest,
  closeRequest,
  newRequester,
  pricedNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
  type SentRequest,
} from './request-support';
import {
  assertAcceptanceComplete,
  fundRequestCredits,
  moveGuarantee,
  writeAcceptance,
  writeFeeSettlement,
} from './w22-support';

type Client = Parameters<typeof writeAcceptance>[0];
const violation = (constraint: string) => ({ code: '23514', constraint });

async function rejected(
  client: Client,
  write: () => Promise<unknown>,
  constraint: string,
  message?: string,
) {
  await client.query('SAVEPOINT reject_competitor');
  await expect(write()).rejects.toMatchObject({
    ...violation(constraint),
    ...(message && { message }),
  });
  await client.query('ROLLBACK TO SAVEPOINT reject_competitor');
  await client.query('RELEASE SAVEPOINT reject_competitor');
}

function reverseCharge(client: Client, op: string, sent: SentRequest) {
  return client.query(
    'INSERT INTO app.fee_charge_reversal(fee_charge_id,operation_id) VALUES ($1,$2)',
    [sent.feeChargeId, op],
  );
}

describe('W22 E1 — encerramentos econômicos concorrentes [PD-006][INV-6][TECH-053][TECH-073][TECH-083]', () => {
  let f: RequestFixture;
  const pool = () => f.c.h.database.pool;

  beforeAll(async () => {
    f = await requestFixture(await creditsHarness());
    await activate(f.c.h, 'luxchange_deposit');
  });
  afterAll(async () => f?.c.h.close());

  async function send(nights: readonly string[], withComplement = false, funding?: string) {
    const requester = await newRequester(f);
    const offered = withComplement ? await pricedNights(f, [2_000n], requester.homeId) : [];
    const quantity = withComplement ? '300' : '500';
    const lotId = await fundRequestCredits(f, requester, funding ?? quantity);
    const sent = await sendRequest(f, {
      requester,
      nights,
      holds: [{ lotId, quantity }],
      complement: withComplement
        ? [
            {
              kind: 'owner_night',
              homeId: requester.homeId,
              holdingId: requester.holdingId,
              nights: offered,
            },
          ]
        : [],
    });
    return { requester, sent, lotId, quantity };
  }

  async function feeOutcomes(client: Client, sent: SentRequest) {
    const { rows } = await client.query(
      `SELECT s.operation_id AS settlement,v.operation_id AS reversal,x.state AS refund,
              x.payment_id,x.amount_minor=f.amount_minor AND x.currency=f.currency AS full,
              x.provider_refund_id,x.resolved_at
         FROM app.fee_charge f LEFT JOIN app.settlement s ON s.fee_charge_id=f.id
         LEFT JOIN app.fee_charge_reversal v ON v.fee_charge_id=f.id
         LEFT JOIN app.refund x ON x.payment_id=f.payment_id WHERE f.id=$1`,
      [sent.feeChargeId],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  async function complement(client: Client, sent: SentRequest) {
    const { rows } = await client.query(
      `SELECT u.state,n.state AS night_state,u.closed_by_operation,c.closed_at
         FROM app.luxchange_request_complement_unit u JOIN app.luxchange_request_complement_night n ON n.unit_id=u.id
         JOIN app.date_custody c ON c.id=n.custody_id WHERE u.request_id=$1`,
      [sent.requestId],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it.each([1, 2])('confirma %i concorrente(s) com economia separada no COMMIT', async (count) => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await send(nights, false, '1000');
    const rival = await send(nights, true);
    const expired = count === 2 ? await send(nights) : undefined;
    const losers = expired ? [rival, expired] : [rival];
    // An unrelated Request holds another 500 on the winner's lot. Use the same locked lot to isolate the provenance check.
    const unrelated = await sendRequest(f, {
      requester: winner.requester,
      nights: await pricedNights(f, [5_000n]),
      holds: [{ lotId: winner.lotId, quantity: '500' }],
    });
    if (expired) {
      await ageRequest(f, expired.sent.requestId);
      await ageLot(f.c.h, expired.lotId, monthsAgo(TEST_VALIDITY_MONTHS + 1));
    }
    let operationId = '';
    await asOperation(
      f.c.h.database.appUrl,
      'accept_request',
      { kind: 'titular', titular: f.holder },
      async (client, op) => {
        operationId = op;
        expect((await client.query('SELECT current_user AS role')).rows).toEqual([
          { role: 'luxtory_app' },
        ]);
        // Prelock the unrelated Request as class 1 for the attempted invalid transition.
        await client.query(
          'SELECT id FROM app.luxchange_request WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [
            [winner.sent, rival.sent, ...(expired ? [expired.sent] : []), unrelated].map(
              (sent) => sent.requestId,
            ),
          ],
        );
        await writeAcceptance(
          client,
          op,
          winner.sent,
          losers.map(({ sent }) => sent),
          {
            consumeGuarantee: async () => {
              await rejected(
                client,
                () =>
                  client.query(
                    'INSERT INTO app.luxchange_request_transition(id,request_id,operation_id,reason) VALUES ($1,$2,$3,$4)',
                    [randomUUID(), unrelated.requestId, op, 'capacity_unavailable'],
                  ),
                'luxchange_request_competing_cession',
              );
              await rejected(
                client,
                () =>
                  client.query(
                    'SELECT app.assert_luxchange_request_closing_complete(id) FROM app.luxchange_request_transition WHERE request_id=$1',
                    [rival.sent.requestId],
                  ),
                'luxchange_request_closing_guarantee',
              );
              await rejected(
                client,
                () => moveGuarantee(client, op, unrelated, 'release'),
                'credit_entry_mechanism',
              );
              await rejected(
                client,
                () => moveGuarantee(client, op, winner.sent, 'release'),
                'credit_entry_mechanism',
              );
              await moveGuarantee(client, op, winner.sent, 'consume');
            },
            settle: async () => {
              await rejected(
                client,
                () => reverseCharge(client, op, unrelated),
                'billing_fee_reversal_origin',
              );
              await rejected(
                client,
                () => reverseCharge(client, op, winner.sent),
                'billing_fee_reversal_origin',
              );
              await writeFeeSettlement(client, op, winner.sent.feeChargeId);
              await rejected(
                client,
                async () => {
                  for (const { sent } of losers) await reverseCharge(client, op, sent);
                  await assertAcceptanceComplete(client, op);
                },
                'luxchange_request_closing_fee',
              );
            },
          },
        );
        expect(await lotRow(client, winner.lotId)).toMatchObject({
          held: '500',
          consumed: '500',
        });
        expect(await feeOutcomes(client, winner.sent)).toMatchObject({
          settlement: op,
          reversal: null,
          refund: null,
        });
        for (const loser of losers) {
          const isExpired = loser === expired;
          const {
            rows: [transition],
          } = await client.query(
            `SELECT t.id,t.to_state,t.reason,t.evidence_kind,d.authorization_ref
             FROM app.luxchange_request_transition t
             LEFT JOIN app.date_custody p ON t.evidence_kind='custody' AND p.id=t.evidence_id AND p.closed_by_operation=$2
             LEFT JOIN app.date_custody d ON d.parent_custody_id=p.id AND d.opened_by_operation=$2
            WHERE t.request_id=$1 AND t.operation_id=$2`,
            [loser.sent.requestId, op],
          );
          expect(transition).toMatchObject(
            isExpired
              ? {
                  to_state: 'expired',
                  reason: 'expired',
                  evidence_kind: 'clock',
                  authorization_ref: null,
                }
              : {
                  to_state: 'cancelled_pre_accept',
                  reason: 'capacity_unavailable',
                  evidence_kind: 'custody',
                  authorization_ref: `request_destination:${winner.sent.requestId}`,
                },
          );
          await client.query('SELECT app.assert_luxchange_request_closing_complete($1)', [
            transition.id,
          ]);
          expect(await lotRow(client, loser.lotId)).toMatchObject({
            held: '0',
            consumed: '0',
            available: isExpired ? '0' : loser.quantity,
            expired: isExpired ? loser.quantity : '0',
          });
          expect(await feeOutcomes(client, loser.sent)).toEqual({
            settlement: null,
            reversal: op,
            refund: 'pending',
            payment_id: loser.sent.paymentId,
            full: true,
            provider_refund_id: null,
            resolved_at: null,
          });
        }
        await rejected(
          client,
          () =>
            client.query(
              "UPDATE app.refund SET state='succeeded', provider_refund_id=$1 WHERE operation_id=$2 AND payment_id=$3",
              [randomUUID(), op, rival.sent.paymentId],
            ),
          'billing_refund_accept_pending',
        );
        expect(await complement(client, rival.sent)).toEqual({
          state: 'released',
          night_state: 'released',
          closed_by_operation: op,
          closed_at: null,
        });
        expect(
          (
            await client.query(
              'SELECT count(*)::int AS moves FROM app.use_right_ledger WHERE operation_id=$1',
              [op],
            )
          ).rows,
        ).toEqual([{ moves: 0 }]);
        expect(await requestRow(client, unrelated.requestId)).toMatchObject({
          state: 'pending',
        });
        await assertAcceptanceComplete(client, op);
      },
    );
    expect(await requestRow(pool(), winner.sent.requestId)).toMatchObject({ state: 'accepted' });
    expect(await lotRow(pool(), winner.lotId)).toMatchObject({ held: '500', consumed: '500' });
    expect(await feeOutcomes(pool(), winner.sent)).toMatchObject({
      settlement: operationId,
      reversal: null,
    });
    expect(await requestRow(pool(), unrelated.requestId)).toMatchObject({ state: 'pending' });
    for (const loser of losers) {
      expect(await requestRow(pool(), loser.sent.requestId)).toMatchObject({
        state: loser === expired ? 'expired' : 'cancelled_pre_accept',
      });
      expect(await lotRow(pool(), loser.lotId)).toMatchObject({
        held: '0',
        consumed: '0',
        available: loser === expired ? '0' : loser.quantity,
        expired: loser === expired ? loser.quantity : '0',
      });
      expect(await feeOutcomes(pool(), loser.sent)).toMatchObject({
        settlement: null,
        reversal: operationId,
        refund: 'pending',
        full: true,
      });
    }
    expect(await complement(pool(), rival.sent)).toEqual({
      state: 'released',
      night_state: 'released',
      closed_by_operation: operationId,
      closed_at: null,
    });
    const invariants = `SELECT invariant, detail FROM app.credit_invariant_breaches()
        UNION ALL SELECT invariant, detail FROM app.luxchange_invariant_breaches()
        UNION ALL SELECT invariant, detail FROM app.booking_invariant_breaches()`;
    expect((await pool().query(invariants)).rows).toEqual([]);
    if (count === 1) {
      const {
        rows: [refund],
      } = await pool().query<{ id: string }>(
        'SELECT id FROM app.refund WHERE payment_id=$1 AND operation_id=$2',
        [rival.sent.paymentId, operationId],
      );
      expect(
        await processRefund({ store: f.store, gateway: f.gateway, log: f.log.logger }, refund!.id),
      ).toBe('succeeded');
      expect(await feeOutcomes(pool(), rival.sent)).toMatchObject({
        reversal: operationId,
        refund: 'succeeded',
        full: true,
        resolved_at: expect.any(Date),
      });
      expect((await pool().query(invariants)).rows).toEqual([]);
    }
  });

  it('recusa no COMMIT os efeitos completos da vencedora que deixam uma concorrente pendente', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await send(nights);
    const rival = await send(nights, true);
    let allWinnerWritesPassed = false;
    await expect(
      asOperation(
        f.c.h.database.appUrl,
        'accept_request',
        { kind: 'titular', titular: f.holder },
        async (client, op) => {
          await writeAcceptance(client, op, winner.sent);
          allWinnerWritesPassed = true;
        },
      ),
    ).rejects.toMatchObject({
      ...violation('luxchange_request_accept_complete'),
      message: 'acceptance leaves no pending Request on its ceded nights',
    });
    expect(allWinnerWritesPassed).toBe(true);
    expect(await requestRow(pool(), winner.sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await requestRow(pool(), rival.sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), winner.lotId)).toMatchObject({ held: '500', consumed: '0' });
    expect(await feeOutcomes(pool(), winner.sent)).toMatchObject({
      settlement: null,
      reversal: null,
    });
  });

  it.each(['withdraw_request', 'expire_requests'] as const)(
    'preserva o encerramento W21 por %s',
    async (command) => {
      const item = await send(await pricedNights(f, [5_000n]), true);
      if (command === 'expire_requests') await ageRequest(f, item.sent.requestId);
      const op = await closeRequest(f, item.sent, command, item.requester);
      expect(await requestRow(pool(), item.sent.requestId)).toMatchObject(
        command === 'expire_requests'
          ? { state: 'expired', closure_reason: 'expired' }
          : { state: 'cancelled_pre_accept', closure_reason: 'withdrawn' },
      );
      expect(await lotRow(pool(), item.lotId)).toMatchObject({
        held: '0',
        available: '300',
        consumed: '0',
      });
      expect(await complement(pool(), item.sent)).toEqual({
        state: 'released',
        night_state: 'released',
        closed_by_operation: op,
        closed_at: null,
      });
      expect(await feeOutcomes(pool(), item.sent)).toMatchObject({
        settlement: null,
        reversal: op,
        refund: 'pending',
        full: true,
      });
    },
  );
});
