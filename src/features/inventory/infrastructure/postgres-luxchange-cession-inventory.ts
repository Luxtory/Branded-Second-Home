import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import {
  depositAuthorizationRef,
  type LuxchangeCessionInventory,
} from '../application/luxchange-cession';

/**
 * Escritas do depósito por SQL direto do servidor (W20, ADR-0036 §3). O banco carimba os instantes e confere operação,
 * origem, sucessora, representação, Membership, antecedência e snapshot; os valores de instante enviados não prevalecem.
 */
export function createPostgresLuxchangeCessionInventory(): LuxchangeCessionInventory<DatabaseTransaction> {
  return {
    async cedeNight(tx, cession) {
      const source = cession.source;
      let query = tx
        .updateTable('app.date_custody')
        .set({ closed_at: sql<Date>`now()`, closed_by_operation: cession.operationId })
        .where('second_home_id', '=', cession.secondHomeId)
        .where(sql<boolean>`stay_date = ${cession.stayDate}::date`)
        .where('closed_at', 'is', null);
      query =
        source.kind === 'owner'
          ? query.where('holder_kind', '=', 'owner')
          : query
              .where('holder_kind', '=', 'use_right')
              .where('basis', '=', 'reserved_right')
              .where('stake_id', '=', source.stakeId);
      const closed = await query.returning('id').executeTakeFirst();
      if (closed === undefined) return false;
      await tx
        .insertInto('app.date_custody')
        .values({
          id: randomUUID(),
          second_home_id: cession.secondHomeId,
          stay_date: cession.stayDate,
          holder_kind: 'luxtory',
          purpose: 'inventory',
          inventory_origin: 'luxchange_cession',
          authorization_ref: depositAuthorizationRef(cession.operationId),
          parent_custody_id: closed.id,
          opened_by_operation: cession.operationId,
        })
        .execute();
      return true;
    },
    async releaseCededOccupancy(tx, release) {
      const row = await tx
        .updateTable('app.date_occupancy')
        .set({
          released_at: sql<Date>`now()`,
          release_reason: 'ceded',
          released_by_operation: release.operationId,
        })
        .where('booking_id', '=', release.bookingId)
        .where(sql<boolean>`stay_date = ${release.stayDate}::date`)
        .where('channel', '=', 'own_use')
        .where('released_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}
