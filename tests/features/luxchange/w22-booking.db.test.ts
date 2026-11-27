import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activate, asOperation, openOperation } from '../booking/lifecycle-support';
import { creditsHarness } from '../credits/credits-support';
import {
  newRequester,
  requestFixture,
  requestRow,
  sendGuaranteedRequest,
  type RequestFixture,
} from './request-support';
import { cedeRequestNights, fundRequestCredits, writeDestinationBooking } from './w22-support';

type Client = Parameters<typeof writeDestinationBooking>[0];

const violation = (constraint: string) => ({ code: '23514', constraint });

async function accept(client: Client, op: string, requestId: string) {
  await client.query('SELECT id FROM app.luxchange_request WHERE id=$1 FOR UPDATE', [requestId]);
  await client.query(
    'INSERT INTO app.economic_snapshot(operation_id,resolved_at) VALUES ($1,clock_timestamp())',
    [op],
  );
  await client.query(
    "INSERT INTO app.luxchange_request_transition(id,request_id,operation_id,reason) VALUES ($1,$2,$3,'accepted')",
    [randomUUID(), requestId, op],
  );
}

interface BookingOverrides {
  readonly partyId?: string;
  readonly holdingId?: string;
  readonly homeId?: string;
  readonly channel?: 'own_use' | 'luxchange_request';
  readonly checkoutOffset?: number;
  readonly state?: 'confirmed' | 'in_use';
}

async function insertBooking(
  client: Client,
  op: string,
  requestId: string,
  overrides: BookingOverrides = {},
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.booking(id,second_home_id,channel,party_id,holding_id,checkin_date,checkout_date,state,opened_by_operation)
       SELECT $1,coalesce($4::uuid,second_home_id),$5,coalesce($6::uuid,requester_party_id),$7,checkin,checkout+$8::int,$9,$3
       FROM app.luxchange_request WHERE id=$2`,
    [
      id,
      requestId,
      op,
      overrides.homeId ?? null,
      overrides.channel ?? 'luxchange_request',
      overrides.partyId ?? null,
      overrides.holdingId ?? null,
      overrides.checkoutOffset ?? 0,
      overrides.state ?? 'confirmed',
    ],
  );
  return id;
}

describe('W22 E1 — reserva de destino [REQ-064][REQ-096][TECH-023][TECH-052]', () => {
  let f: RequestFixture;
  const pool = () => f.c.h.database.pool;

  beforeAll(async () => {
    f = await requestFixture(await creditsHarness());
    await activate(f.c.h, 'luxchange_deposit');
  });
  afterAll(async () => f?.c.h.close());

  const operation = <T>(work: (client: Client, op: string) => Promise<T>) =>
    asOperation(
      f.c.h.database.appUrl,
      'accept_request',
      { kind: 'titular', titular: f.holder },
      work,
    );

  async function send() {
    const requester = await newRequester(f);
    const lot = await fundRequestCredits(f, requester, '500');
    return { requester, sent: await sendGuaranteedRequest(f, lot, '500', requester) };
  }

  it('registra reserva e ocupação, isola a leitura e reverte o aceite sem economia completa', async () => {
    const { requester, sent } = await send();
    let operationId = '';
    let bookingId = '';
    await expect(
      operation(async (client, op) => {
        operationId = op;
        await accept(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        bookingId = await writeDestinationBooking(client, op, sent.requestId);
        await client.query('SELECT app.assert_booking_complete($1)', [bookingId]);
        expect(
          (
            await client.query(
              `SELECT b.channel,b.state,b.party_id,b.holding_id,b.stake_id,c.authorization_ref
          FROM app.booking b JOIN app.date_occupancy o ON o.booking_id=b.id
          JOIN app.date_custody c ON c.id=o.custody_id WHERE b.id=$1 AND c.opened_by_operation=$2`,
              [bookingId, op],
            )
          ).rows,
        ).toEqual([
          {
            channel: 'luxchange_request',
            state: 'confirmed',
            party_id: requester.partyId,
            holding_id: null,
            stake_id: null,
            authorization_ref: `request_destination:${sent.requestId}`,
          },
        ]);
        expect(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM app.use_right_ledger WHERE operation_id=$1',
              [op],
            )
          ).rows,
        ).toEqual([{ count: 0 }]);

        // The accepted booking is visible only inside this transaction until economic completeness exists.
        await client.query('SET LOCAL ROLE authenticated');
        const visible = async (userId: string) => {
          await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: userId }),
          ]);
          return (await client.query('SELECT id,channel FROM app.booking WHERE id=$1', [bookingId]))
            .rows;
        };
        expect(await visible(requester.userId)).toEqual([
          { id: bookingId, channel: 'luxchange_request' },
        ]);
        expect(await visible(f.holder.userId)).toEqual([]);
        expect(await visible(f.c.titular.userId)).toEqual([]);
        await visible(requester.userId);
        await client.query('SAVEPOINT check_booking_privacy');
        await expect(
          client.query('SELECT party_id FROM app.booking WHERE id=$1', [bookingId]),
        ).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK TO SAVEPOINT check_booking_privacy');
        await client.query('RESET ROLE');
      }),
    ).rejects.toMatchObject(violation('luxchange_request_accept_complete'));
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    expect(
      (
        await pool().query(
          `SELECT (SELECT count(*)::int FROM app.booking WHERE id=$1) AS bookings,
              (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation=$2) AS occupancies,
              (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$2 OR closed_by_operation=$2) AS custodys,
              (SELECT count(*)::int FROM app.operation WHERE id=$2) AS operations`,
          [bookingId, operationId],
        )
      ).rows,
    ).toEqual([{ bookings: 0, occupancies: 0, custodys: 0, operations: 0 }]);
  });

  it('rejeita abertura sem aceitação e com party, período, imóvel, vínculo ou estado incorreto', async () => {
    const { sent } = await send();
    await expect(
      operation((client, op) => insertBooking(client, op, sent.requestId)),
    ).rejects.toMatchObject(violation('luxchange_request_cession_binding'));
    for (const overrides of [
      { partyId: f.holder.partyId },
      { checkoutOffset: 1 },
      { homeId: f.c.titular.homeId },
    ]) {
      await expect(
        operation(async (client, op) => {
          await accept(client, op, sent.requestId);
          await insertBooking(client, op, sent.requestId, overrides);
        }),
      ).rejects.toMatchObject(violation('luxchange_request_booking_binding'));
    }
    for (const [overrides, constraint] of [
      [{ holdingId: f.holder.holdingId }, 'booking_requester_channel'],
      [{ state: 'in_use' as const }, 'booking_opens_confirmed'],
    ] as const) {
      await expect(
        operation(async (client, op) => {
          await accept(client, op, sent.requestId);
          await insertBooking(client, op, sent.requestId, overrides);
        }),
      ).rejects.toMatchObject(violation(constraint));
    }
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
  });

  it('rejeita custódia alheia e canal indevido na ocupação, e exige a ocupação no COMMIT', async () => {
    const { sent } = await send();
    for (const channel of ['luxchange_request', 'luxchange_direct']) {
      await expect(
        operation(async (client, op) => {
          await accept(client, op, sent.requestId);
          const bookingId = await insertBooking(client, op, sent.requestId);
          await client.query(
            `INSERT INTO app.date_occupancy(id,second_home_id,stay_date,booking_id,channel,custody_id,opened_by_operation)
           SELECT gen_random_uuid(),second_home_id,stay_date,$1,$2,custody_id,$3
           FROM app.luxchange_request_night WHERE request_id=$4`,
            [bookingId, channel, op, sent.requestId],
          );
        }),
      ).rejects.toMatchObject(
        channel === 'luxchange_request'
          ? violation('luxchange_request_occupancy_custody')
          : { code: '42501' },
      );
    }

    await expect(
      operation(async (client, op) => {
        await accept(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        await insertBooking(client, op, sent.requestId);
      }),
    ).rejects.toMatchObject(violation('luxchange_request_occupancy_complete'));
    expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
  });

  it('rejeita transição de cancelamento no canal luxchange_request', async () => {
    const { requester, sent } = await send();
    await expect(
      operation(async (client, op) => {
        await accept(client, op, sent.requestId);
        await cedeRequestNights(client, op, sent.requestId);
        const bookingId = await writeDestinationBooking(client, op, sent.requestId);
        const cancellation = await openOperation(client, 'cancel_own_use_booking', {
          kind: 'titular',
          titular: requester,
        });
        await client.query(
          `INSERT INTO app.booking_state_transition(id,booking_id,operation_id,kind,from_state,to_state,recorded_at)
         VALUES ($1,$2,$3,'cancellation','confirmed','cancelled',now())`,
          [randomUUID(), bookingId, cancellation],
        );
      }),
    ).rejects.toMatchObject(violation('luxchange_request_booking_transition'));
  });
});
