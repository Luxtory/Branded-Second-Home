import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { insertEntry, TEST_VALIDITY_MONTHS, type CreditTitular } from '../credits/credits-support';
import { cedeOwnerNight, depositRunner, insertDepositLot } from './luxchange-support';
import {
  pricedNights,
  prlForCredits,
  type RequestFixture,
  type SentRequest,
} from './request-support';

type Client = Pick<pg.Client, 'query'>;

/** Funds the guarantee with a W20 deposit on a fresh Owner night. */
export async function fundRequestCredits(
  fixture: RequestFixture,
  requester: CreditTitular,
  quantity: string,
): Promise<string> {
  const nights = await pricedNights(fixture, [prlForCredits(fixture, quantity)], requester.homeId);
  const outcome = await depositRunner(
    fixture,
    requester,
  )({
    second_home_id: requester.homeId,
    nights,
    expected_night_credits: [quantity],
    expected_credits: quantity,
    expected_validity_months: TEST_VALIDITY_MONTHS,
  });
  if (outcome.status !== 'committed')
    throw new Error(`W20 deposit fixture failed: ${JSON.stringify(outcome)}`);
  return outcome.result.lot_id;
}

async function recordTransition(
  client: Client,
  op: string,
  requestId: string,
  reason: 'accepted' | 'declined' | 'capacity_unavailable',
) {
  await client.query(
    'INSERT INTO app.luxchange_request_transition(id,request_id,operation_id,reason) VALUES ($1,$2,$3,$4)',
    [randomUUID(), requestId, op, reason],
  );
}

export async function moveGuarantee(
  client: Client,
  op: string,
  sent: SentRequest,
  movement: 'consume' | 'release',
) {
  const { rows } = await client.query<{
    id: string;
    lot_id: string;
    quantity: string;
    valid: boolean;
  }>(
    `SELECT h.id,h.lot_id,h.quantity,clock_timestamp() < l.expires_at AS valid
     FROM app.credit_entry h JOIN app.credit_lot l ON l.id=h.lot_id
     WHERE h.operation_id=$1 AND h.movement='hold' ORDER BY l.expires_at,l.originated_at,l.id`,
    [sent.operationId],
  );
  for (const hold of rows) {
    await insertEntry(client, op, {
      lotId: hold.lot_id,
      quantity: hold.quantity,
      parent: hold.id,
      movement,
      from: 'held',
      to: movement === 'consume' ? 'consumed' : hold.valid ? 'available' : 'expired',
    });
  }
}

async function reverseFee(client: Client, op: string, sent: SentRequest) {
  await client.query(
    'INSERT INTO app.fee_charge_reversal(fee_charge_id,operation_id) VALUES ($1,$2)',
    [sent.feeChargeId, op],
  );
  await client.query(
    `INSERT INTO app.refund(id,payment_id,operation_id,amount_minor,currency,state)
     SELECT gen_random_uuid(),payment_id,$2,amount_minor,currency,'pending' FROM app.fee_charge WHERE id=$1`,
    [sent.feeChargeId, op],
  );
}

export async function writeRejection(
  client: Client,
  op: string,
  sent: SentRequest,
  options: { release?: () => Promise<void>; reverse?: () => Promise<void> } = {},
) {
  await recordTransition(client, op, sent.requestId, 'declined');
  if (options.release) await options.release();
  else await moveGuarantee(client, op, sent, 'release');
  if (options.reverse) await options.reverse();
  else await reverseFee(client, op, sent);
}

interface CessionNight {
  home: string;
  night: string;
  purpose: 'request_destination' | 'request_complement';
  booking_id: string | null;
}

export async function cedeRequestNights(client: Client, op: string, requestId: string) {
  const { rows: nights } = await client.query<CessionNight>(
    `SELECT n.second_home_id AS home, n.stay_date::text AS night,'request_destination' AS purpose,n.booking_id
     FROM app.luxchange_request_night n WHERE n.request_id=$1
     UNION ALL
     SELECT n.second_home_id,n.stay_date::text,'request_complement',u.booking_id
     FROM app.luxchange_request_complement_night n JOIN app.luxchange_request_complement_unit u ON u.id=n.unit_id
     WHERE n.request_id=$1 ORDER BY home,night`,
    [requestId],
  );
  const bookings = new Set(nights.flatMap((n) => (n.booking_id ? [n.booking_id] : [])));
  for (const booking of [...bookings].sort()) {
    await client.query(
      `INSERT INTO app.booking_state_transition(id,booking_id,previous_transition_id,from_state,to_state,kind,operation_id,recorded_at)
       SELECT gen_random_uuid(),id,last_transition_id,state,'cancelled','cession',$2,now() FROM app.booking WHERE id=$1`,
      [booking, op],
    );
    await client.query(
      `UPDATE app.date_occupancy SET released_at=now(),release_reason='ceded',released_by_operation=$2
       WHERE booking_id=$1 AND released_at IS NULL`,
      [booking, op],
    );
  }
  for (const n of nights) {
    await cedeOwnerNight(client, op, n.home, n.night, `${n.purpose}:${requestId}`);
  }
}

export async function writeDestinationBooking(
  client: Client,
  op: string,
  requestId: string,
): Promise<string> {
  const bookingId = randomUUID();
  await client.query(
    `INSERT INTO app.booking(id,second_home_id,channel,party_id,checkin_date,checkout_date,state,opened_by_operation)
     SELECT $1,second_home_id,'luxchange_request',requester_party_id,checkin,checkout,'confirmed',$3 FROM app.luxchange_request WHERE id=$2`,
    [bookingId, requestId, op],
  );
  await client.query(
    `INSERT INTO app.date_occupancy(id,second_home_id,stay_date,booking_id,channel,custody_id,opened_by_operation)
     SELECT gen_random_uuid(),n.second_home_id,n.stay_date,$1,'luxchange_request',d.id,$3
     FROM app.luxchange_request_night n JOIN app.date_custody d ON d.parent_custody_id=n.custody_id
     WHERE n.request_id=$2 AND d.opened_by_operation=$3 ORDER BY n.stay_date`,
    [bookingId, requestId, op],
  );
  return bookingId;
}

export async function writeAcceptedTransition(client: Client, op: string, requestId: string) {
  await client.query(
    'INSERT INTO app.economic_snapshot(operation_id,resolved_at) VALUES ($1,clock_timestamp())',
    [op],
  );
  await recordTransition(client, op, requestId, 'accepted');
}

export async function writeFeeSettlement(client: Client, op: string, feeChargeId: string | null) {
  await client.query(
    `INSERT INTO app.settlement(id,operation_id,kind,beneficiary_party_id,amount_minor,currency,fee_charge_id)
     SELECT gen_random_uuid(),$1,'luxchange_fee',NULL,amount_minor,currency,id FROM app.fee_charge WHERE id=$2`,
    [op, feeChargeId],
  );
}

export async function assertAcceptanceComplete(client: Client, op: string) {
  await client.query('SELECT app.assert_luxchange_request_accept_complete($1)', [op]);
}

/** Writes only the acceptance facts under the application role. The caller controls the transaction and lock barriers. */
export async function writeAcceptance(
  client: Client,
  op: string,
  winner: SentRequest,
  competitors: readonly SentRequest[] = [],
  options: { consumeGuarantee?: () => Promise<void>; settle?: () => Promise<void> } = {},
): Promise<{ bookingId: string; holderLotId: string }> {
  const requests = [winner, ...competitors];
  // TECH-053: acquire the whole known class 1 set before the accepted transition locks classes 3–6.
  await client.query(
    'SELECT id FROM app.luxchange_request WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [requests.map((sent) => sent.requestId)],
  );
  await writeAcceptedTransition(client, op, winner.requestId);
  await cedeRequestNights(client, op, winner.requestId);
  for (const loser of competitors)
    await recordTransition(client, op, loser.requestId, 'capacity_unavailable');
  const bookingId = await writeDestinationBooking(client, op, winner.requestId);
  const {
    rows: [terms],
  } = await client.query<{
    requester_party_id: string;
    holder_party_id: string;
    p: string;
    c: string;
    holder_quantity: string;
  }>(
    `SELECT r.requester_party_id,r.holder_party_id,trim_scale(r.complement_credits)::text AS p,
       trim_scale(r.complement_consumption)::text AS c,
       (SELECT trim_scale(sum(prl.amount_minor)::numeric * app.luxchange_snapshot_parameter(r.operation_id,'credit_multiplier')::numeric / 100)
        FROM app.economic_snapshot_night n JOIN app.prl prl ON prl.id=n.prl_id WHERE n.operation_id=r.operation_id)::text AS holder_quantity
     FROM app.luxchange_request r WHERE r.id=$1`,
    [winner.requestId],
  );
  if (!terms) throw new Error('missing Request terms');
  const requesterLot =
    terms.p === '0' ? null : await insertDepositLot(client, op, terms.requester_party_id, terms.p);
  const holderLotId = await insertDepositLot(
    client,
    op,
    terms.holder_party_id,
    terms.holder_quantity,
  );
  // Class 7: prelock the union in the W21 FEFO order before moving any guarantee.
  await client.query(
    `SELECT l.id FROM app.credit_lot l
      WHERE l.origin_operation_id=$1 OR l.id IN (
        SELECT lot_id FROM app.credit_entry WHERE operation_id=ANY($2::uuid[]) AND movement='hold')
      ORDER BY l.expires_at,l.originated_at,l.id FOR UPDATE`,
    [op, requests.map((sent) => sent.operationId)],
  );
  if (options.consumeGuarantee) await options.consumeGuarantee();
  else await moveGuarantee(client, op, winner, 'consume');
  if (requesterLot && terms.c !== '0') {
    await insertEntry(client, op, {
      lotId: requesterLot,
      movement: 'consume',
      from: 'available',
      to: 'consumed',
      quantity: terms.c,
    });
  }
  for (const loser of competitors) await moveGuarantee(client, op, loser, 'release');
  // Class 8: W19 locks payments as a single set ordered by id, before either financial outcome.
  await client.query('SELECT id FROM app.payment WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    requests.map((sent) => sent.paymentId),
  ]);
  if (options.settle) await options.settle();
  else await writeFeeSettlement(client, op, winner.feeChargeId);
  for (const loser of competitors) await reverseFee(client, op, loser);
  return { bookingId, holderLotId };
}
