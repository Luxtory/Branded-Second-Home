import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../booking/booking-support';
import {
  activate,
  asOperation,
  bookNow,
  connect,
  openOperation,
} from '../booking/lifecycle-support';
import {
  creditsHarness,
  insertEntry,
  lotRow,
  suspend,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { cedeOwnerNight } from './luxchange-support';
import {
  newRequester,
  pricedNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
} from './request-support';
import {
  assertAcceptanceComplete,
  cedeRequestNights,
  fundRequestCredits,
  writeAcceptance,
} from './w22-support';

type Client = Parameters<typeof cedeRequestNights>[0];

const violation = (constraint: string) => ({ code: '23514', constraint });

async function transition(client: Client, op: string, requestId: string, reason: string) {
  await client.query(
    'INSERT INTO app.luxchange_request_transition(id,request_id,operation_id,reason) VALUES ($1,$2,$3,$4)',
    [randomUUID(), requestId, op, reason],
  );
}

async function accept(client: Client, op: string, winner: string, rivals: readonly string[] = []) {
  await client.query(
    'SELECT id FROM app.luxchange_request WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[winner, ...rivals]],
  );
  await client.query(
    'INSERT INTO app.economic_snapshot(operation_id,resolved_at) VALUES ($1,clock_timestamp())',
    [op],
  );
  await transition(client, op, winner, 'accepted');
}

describe('W22 E1 — cessões vinculadas à aceitação [REQ-060][REQ-064][TECH-023][TECH-073]', () => {
  let f: RequestFixture;
  const pool = () => f.c.h.database.pool;

  beforeAll(async () => {
    const credits = await creditsHarness();
    f = await requestFixture(credits);
    await activate(credits.h, 'luxchange_deposit', 'own_use_booking');
  });
  afterAll(async () => f?.c.h.close());

  async function coOwner(): Promise<CreditTitular> {
    const { homeId, titulares } = await f.c.h.coOwnerScenario();
    const titular = titulares[0]!;
    await activateMembership(f.c.h.database.appUrl, f.c.admin, titular.partyId);
    return { ...titular, homeId };
  }

  const operation = <T>(holder: CreditTitular, work: (client: Client, op: string) => Promise<T>) =>
    asOperation(
      f.c.h.database.appUrl,
      'accept_request',
      { kind: 'titular', titular: holder },
      work,
    );

  async function sendWithGuarantee(nights: readonly string[], member?: CreditTitular) {
    const requester = member ?? (await newRequester(f));
    const lotId = await fundRequestCredits(f, requester, '500');
    return sendRequest(f, { requester, nights, holds: [{ lotId, quantity: '500' }] });
  }

  async function rolledBack(op: string) {
    const { rows } = await pool().query(
      `SELECT (SELECT count(*)::int FROM app.operation WHERE id=$1) AS operation,
              (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$1 OR closed_by_operation=$1) AS custody,
              (SELECT count(*)::int FROM app.booking_state_transition WHERE operation_id=$1) AS booking,
              (SELECT count(*)::int FROM app.date_occupancy WHERE released_by_operation=$1) AS released,
              (SELECT count(*)::int FROM app.luxchange_request_transition WHERE operation_id=$1) AS transition`,
      [op],
    );
    expect(rows).toEqual([{ operation: 0, custody: 0, booking: 0, released: 0, transition: 0 }]);
  }

  it('[INV-6][TECH-073] rejeita Garantia sem aceite ou sem vínculo com a vencedora', async () => {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '1000');
    const send = async () =>
      sendRequest(f, {
        requester,
        nights: await pricedNights(f, [5_000n]),
        holds: [{ lotId, quantity: '500' }],
      });
    const winner = await send();
    const another = await send();
    const anotherLot = await fundRequestCredits(f, requester, '500');

    for (const attempt of [
      {
        acceptWinner: false,
        lot: lotId,
        parent: winner.holdIds[0]!,
        quantity: '500',
        constraint: 'luxchange_request_cession_binding',
      },
      {
        acceptWinner: true,
        lot: lotId,
        parent: another.holdIds[0]!,
        quantity: '500',
        constraint: 'credit_consume_request',
      },
      {
        acceptWinner: true,
        lot: anotherLot,
        parent: winner.holdIds[0]!,
        quantity: '500',
        constraint: 'credit_entry_parent',
      },
      {
        acceptWinner: true,
        lot: lotId,
        parent: winner.holdIds[0]!,
        quantity: '250',
        constraint: 'credit_consume_request',
      },
    ]) {
      const client = await connect(f.c.h.database.appUrl);
      try {
        await client.query('BEGIN');
        const op = await openOperation(client, 'accept_request', {
          kind: 'titular',
          titular: f.holder,
        });
        const { rows } = await client.query('SELECT current_user AS role');
        expect(rows).toEqual([{ role: 'luxtory_app' }]);
        if (attempt.acceptWinner) await accept(client, op, winner.requestId);
        await expect(
          insertEntry(client, op, {
            lotId: attempt.lot,
            parent: attempt.parent,
            quantity: attempt.quantity,
            movement: 'consume',
            from: 'held',
            to: 'consumed',
          }),
        ).rejects.toMatchObject(violation(attempt.constraint));
        expect((await client.query('COMMIT')).command).toBe('ROLLBACK');
        await rolledBack(op);
      } finally {
        await client.end();
      }
    }
    for (const sent of [winner, another])
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), lotId)).toMatchObject({ held: '1000', consumed: '0' });
    expect(await lotRow(pool(), anotherLot)).toMatchObject({ available: '500', consumed: '0' });
  });

  it('[INV-6][TECH-073] consome a Garantia da vencedora e reverte no COMMIT incompleto', async () => {
    const sent = await sendWithGuarantee(await pricedNights(f, [5_000n]));
    const parent = sent.holdIds[0]!;
    const {
      rows: [hold],
    } = await pool().query<{ lot_id: string }>('SELECT lot_id FROM app.credit_entry WHERE id=$1', [
      parent,
    ]);
    const lotId = hold!.lot_id;
    let operationId = '';
    await expect(
      operation(f.holder, async (client, op) => {
        operationId = op;
        await accept(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        await insertEntry(client, op, {
          lotId,
          parent,
          quantity: '500',
          movement: 'consume',
          from: 'held',
          to: 'consumed',
        });
        expect(await lotRow(client, lotId)).toMatchObject({ held: '0', consumed: '500' });
      }),
    ).rejects.toMatchObject(violation('luxchange_request_accept_complete'));
    await rolledBack(operationId);
    expect(await lotRow(pool(), lotId)).toMatchObject({ held: '500', consumed: '0' });
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
  });

  it('cede a capacidade Owner e registra a concorrente pela custódia antes de reverter a transação', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await sendWithGuarantee(nights);
    const rival = await sendWithGuarantee(nights);
    const suspendedRequester = await newRequester(f);
    const ineligible = await sendWithGuarantee(nights, suspendedRequester);
    await suspend(f.c, suspendedRequester.partyId);
    let operationId = '';
    await expect(
      operation(f.holder, async (client, op) => {
        operationId = op;
        await accept(client, op, winner.requestId, [rival.requestId, ineligible.requestId]);
        await cedeRequestNights(client, op, winner.requestId);
        await transition(client, op, rival.requestId, 'capacity_unavailable');
        await transition(client, op, ineligible.requestId, 'capacity_unavailable');
        const { rows } = await client.query(
          `SELECT rival.to_state, rival.reason, rival.evidence_kind, successor.authorization_ref
           FROM app.luxchange_request_transition rival
           JOIN app.date_custody parent ON parent.id=rival.evidence_id AND parent.closed_by_operation=$1
           JOIN app.date_custody successor ON successor.parent_custody_id=parent.id AND successor.opened_by_operation=$1
           WHERE rival.request_id=$2`,
          [op, rival.requestId],
        );
        expect(rows).toEqual([
          {
            to_state: 'cancelled_pre_accept',
            reason: 'capacity_unavailable',
            evidence_kind: 'custody',
            authorization_ref: `request_destination:${winner.requestId}`,
          },
        ]);
        expect(
          (
            await client.query(
              'SELECT reason,evidence_kind FROM app.luxchange_request_transition WHERE request_id=$1',
              [ineligible.requestId],
            )
          ).rows,
        ).toEqual([{ reason: 'requester_membership', evidence_kind: 'membership_transition' }]);
      }),
    ).rejects.toMatchObject(violation('luxchange_request_accept_complete'));
    await rolledBack(operationId);
    for (const sent of [winner, rival, ineligible])
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
  });

  it.each(['owner_night', 'co_owner_booking'] as const)(
    'consome o complemento %s e preserva o Direito de Uso',
    async (kind) => {
      const isCoOwner = kind === 'co_owner_booking';
      const holder = isCoOwner ? await coOwner() : f.holder;
      const requester = isCoOwner ? await coOwner() : await newRequester(f);
      const nights = await pricedNights(f, [5_000n], holder.homeId);
      const offered = await pricedNights(
        f,
        isCoOwner ? [3_000n, 3_000n] : [6_000n],
        requester.homeId,
      );
      const book = (titular: CreditTitular, period: readonly string[]) =>
        bookNow(f.c.h, titular, titular.homeId, period[0]!, addDays(period.at(-1)!, 1));
      const holderBookingId = isCoOwner ? await book(holder, nights) : undefined;
      const bookingId = isCoOwner ? await book(requester, offered) : undefined;
      const sent = await sendRequest(f, {
        requester,
        holder,
        nights,
        holderBookingId,
        holds: [],
        complement: [
          {
            kind,
            homeId: requester.homeId,
            holdingId: requester.holdingId,
            nights: offered,
            bookingId,
          },
        ],
      });
      const bookingIds = [holderBookingId, bookingId].filter(
        (id): id is string => id !== undefined,
      );

      let operationId = '';
      await operation(holder, async (client, op) => {
        operationId = op;
        await writeAcceptance(client, op, sent);
        await assertAcceptanceComplete(client, op);
        const { rows } = await client.query(
          `SELECT u.state, u.closed_by_operation, n.state AS night_state, s.authorization_ref
           FROM app.luxchange_request_complement_unit u
           JOIN app.luxchange_request_complement_night n ON n.unit_id=u.id
           JOIN app.date_custody p ON p.id=n.custody_id AND p.closed_by_operation=$2
           JOIN app.date_custody s ON s.parent_custody_id=p.id AND s.opened_by_operation=$2
           WHERE u.request_id=$1`,
          [sent.requestId, op],
        );
        expect(rows).toEqual(
          offered.map(() => ({
            state: 'consumed',
            night_state: 'consumed',
            closed_by_operation: op,
            authorization_ref: `request_complement:${sent.requestId}`,
          })),
        );
        expect(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM app.use_right_ledger WHERE operation_id=$1',
              [op],
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        if (isCoOwner) {
          const { rows: releases } = await client.query(
            `SELECT b.state, o.release_reason FROM app.booking b JOIN app.date_occupancy o ON o.booking_id=b.id
             WHERE b.id=ANY($1::uuid[]) AND o.released_by_operation=$2`,
            [bookingIds, op],
          );
          expect(releases).toEqual(
            [...nights, ...offered].map(() => ({ state: 'cancelled', release_reason: 'ceded' })),
          );
        }
      });
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'accepted' });
      expect(
        (
          await pool().query(
            'SELECT state,closed_by_operation FROM app.luxchange_request_complement_unit WHERE request_id=$1',
            [sent.requestId],
          )
        ).rows,
      ).toEqual([{ state: 'consumed', closed_by_operation: operationId }]);
    },
  );

  it('recusa a cessão sem a transição accepted da operação', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const sent = await sendWithGuarantee(nights);
    await expect(
      operation(f.holder, (client, op) =>
        cedeOwnerNight(
          client,
          op,
          f.holder.homeId,
          nights[0]!,
          `request_destination:${sent.requestId}`,
        ),
      ),
    ).rejects.toMatchObject(violation('luxchange_request_cession_binding'));
  });

  it('recusa reaproveitar o compromisso de outra Request', async () => {
    const requester = await newRequester(f);
    const offered = await pricedNights(f, [5_000n], requester.homeId);
    const other = await sendRequest(f, {
      requester,
      nights: await pricedNights(f, [5_000n]),
      holds: [],
      complement: [
        {
          kind: 'owner_night',
          holdingId: requester.holdingId,
          homeId: requester.homeId,
          nights: offered,
        },
      ],
    });
    const winner = await sendWithGuarantee(await pricedNights(f, [5_000n]));
    await expect(
      operation(f.holder, async (client, op) => {
        await accept(client, op, winner.requestId);
        await cedeOwnerNight(
          client,
          op,
          requester.homeId,
          offered[0]!,
          `request_complement:${other.requestId}`,
        );
      }),
    ).rejects.toMatchObject(violation('luxchange_request_cession_source'));
    await expect(
      operation(f.holder, async (client, op) => {
        await accept(client, op, winner.requestId, [other.requestId]);
        await cedeRequestNights(client, op, winner.requestId);
        await transition(client, op, other.requestId, 'capacity_unavailable');
      }),
    ).rejects.toMatchObject(violation('luxchange_request_competing_cession'));
    expect(
      (
        await pool().query(
          'SELECT state FROM app.luxchange_request_complement_unit WHERE request_id=$1',
          [other.requestId],
        )
      ).rows,
    ).toEqual([{ state: 'active' }]);
  });
});
