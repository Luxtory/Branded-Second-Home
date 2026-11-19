import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { LuxtorySelectionInventory } from '../application/luxtory-selection';
import { createPostgresOwnUseInventory } from './postgres-own-use-inventory';

export function createPostgresLuxtorySelectionInventory(): LuxtorySelectionInventory<DatabaseTransaction> {
  const states = createPostgresOwnUseInventory();
  return {
    nightStates: (tx, secondHomeId, stayDates) => states.nightStates(tx, secondHomeId, stayDates),
    async select(tx, transition) {
      const closed = await tx
        .updateTable('app.date_custody')
        .set({ closed_at: sql<Date>`now()`, closed_by_operation: transition.operationId })
        .where('id', '=', transition.parentCustodyId)
        .where('closed_at', 'is', null)
        .where('holder_kind', '=', 'spe_pool')
        .returning('id')
        .executeTakeFirst();
      if (closed === undefined) return null;
      const id = randomUUID();
      await tx
        .insertInto('app.date_custody')
        .values({
          id,
          second_home_id: transition.secondHomeId,
          stay_date: transition.stayDate,
          holder_kind: 'luxtory',
          purpose: transition.purpose,
          inventory_origin: transition.purpose === 'inventory' ? 'annual_allocation' : null,
          authorization_ref: transition.authorizationRef,
          parent_custody_id: transition.parentCustodyId,
          opened_by_operation: transition.operationId,
        })
        .execute();
      return id;
    },
  };
}
