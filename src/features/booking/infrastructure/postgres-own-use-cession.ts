import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import type { OwnUseCessionPort } from '../application/own-use-cession';

/** Cessão da reserva por SQL direto do servidor (W20, ADR-0036 §1); instante e primeira noite carimbados pelo banco. */
export function createPostgresOwnUseCession(): OwnUseCessionPort<DatabaseTransaction> {
  return {
    async lock(tx, bookingId) {
      await lockAdvisoryKeys(tx, [`app.booking:${bookingId.toLowerCase()}`]);
    },
    async find(tx, bookingIds) {
      if (bookingIds.length === 0) return [];
      const rows = await tx
        .selectFrom('app.booking')
        .select([
          'id',
          'second_home_id',
          'holding_id',
          'stake_id',
          'channel',
          'state',
          sql<string>`checkin_date::text`.as('checkin_date'),
          sql<string>`checkout_date::text`.as('checkout_date'),
          'last_transition_id',
        ])
        .where('id', 'in', [...bookingIds])
        .orderBy('id')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        secondHomeId: row.second_home_id,
        holdingId: row.holding_id,
        stakeId: row.stake_id,
        channel: row.channel,
        state: row.state,
        checkinDate: row.checkin_date,
        checkoutDate: row.checkout_date,
        lastTransitionId: row.last_transition_id,
      }));
    },
    async cede(tx, { booking, id, operationId }) {
      const row = await tx
        .insertInto('app.booking_state_transition')
        .values({
          id,
          booking_id: booking.id,
          previous_transition_id: booking.lastTransitionId,
          from_state: booking.state,
          to_state: 'cancelled',
          kind: 'cession',
          operation_id: operationId,
          recorded_at: sql<Date>`now()`,
          cancellation_class: null,
          first_affected_date: null,
          basis: null,
        })
        .returning(['id', sql<string | null>`first_affected_date::text`.as('first_affected')])
        .executeTakeFirstOrThrow();
      return { transitionId: row.id, firstAffectedDate: row.first_affected };
    },
  };
}
