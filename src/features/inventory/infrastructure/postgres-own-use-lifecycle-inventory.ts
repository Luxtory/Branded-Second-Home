import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { OwnUseLifecycleInventory } from '../application/own-use-lifecycle';
import type { ForfeitedCapacityRecovery } from '../application/recover-future-capacity';

/**
 * Escritas do ciclo da reserva por SQL direto do servidor (W13). O banco carimba os instantes e confere a operação, a
 * transição, a noite não iniciada e a autorização (ADR-0027); os valores de instante enviados não prevalecem.
 */
export function createPostgresOwnUseLifecycleInventory(): OwnUseLifecycleInventory<DatabaseTransaction> {
  return {
    async releaseOccupancy(tx, release) {
      const row = await tx
        .updateTable('app.date_occupancy')
        .set({
          released_at: sql<Date>`now()`,
          release_reason: release.reason,
          released_by_operation: release.operationId,
        })
        .where('booking_id', '=', release.bookingId)
        .where(sql<boolean>`stay_date = ${release.stayDate}::date`)
        .where('released_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },
    async succeedReservedRight(tx, succession) {
      const closed = await tx
        .updateTable('app.date_custody')
        .set({ closed_at: sql<Date>`now()`, closed_by_operation: succession.operationId })
        .where('second_home_id', '=', succession.secondHomeId)
        .where(sql<boolean>`stay_date = ${succession.stayDate}::date`)
        .where('holder_kind', '=', 'use_right')
        .where('basis', '=', 'reserved_right')
        .where('stake_id', '=', succession.stakeId)
        .where('closed_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (closed === undefined) return false;
      const forfeited = succession.successor === 'forfeited_right';
      await tx
        .insertInto('app.date_custody')
        .values({
          id: randomUUID(),
          second_home_id: succession.secondHomeId,
          stay_date: succession.stayDate,
          holder_kind: forfeited ? 'use_right' : 'spe_pool',
          stake_id: forfeited ? succession.stakeId : null,
          basis: forfeited ? 'forfeited_right' : null,
          parent_custody_id: closed.id,
          opened_by_operation: succession.operationId,
        })
        .execute();
      return true;
    },
  };
}

/** BR-283: `forfeited_right` → `luxtory/inventory/recovered_future_capacity`, com a referência da autorização. */
export function createPostgresForfeitedCapacityRecovery(): ForfeitedCapacityRecovery<DatabaseTransaction> {
  return {
    async recover(tx, move) {
      const closed = await tx
        .updateTable('app.date_custody')
        .set({ closed_at: sql<Date>`now()`, closed_by_operation: move.operationId })
        .where('id', '=', move.custodyId)
        .where('basis', '=', 'forfeited_right')
        .where('closed_at', 'is', null)
        .returning(['id', 'second_home_id', sql<string>`stay_date::text`.as('stay_date')])
        .executeTakeFirst();
      if (closed === undefined) return false;
      await tx
        .insertInto('app.date_custody')
        .values({
          id: randomUUID(),
          second_home_id: closed.second_home_id,
          stay_date: closed.stay_date,
          holder_kind: 'luxtory',
          purpose: 'inventory',
          inventory_origin: 'recovered_future_capacity',
          authorization_ref: `booking_authorization:${move.authorizationId}`,
          parent_custody_id: closed.id,
          opened_by_operation: move.operationId,
        })
        .execute();
      return true;
    },
  };
}
