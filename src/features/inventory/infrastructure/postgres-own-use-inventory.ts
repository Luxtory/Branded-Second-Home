import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { OwnUseInventory } from '../application/own-use';

/**
 * Custódia e ocupação do uso próprio (W12). O banco confere a reserva da mesma operação, a ativação, a representação e
 * a noite futura em cada escrita, e carimba o fechamento (ADR-0026); o valor de `closed_at` enviado não prevalece.
 */
export function createPostgresOwnUseInventory(): OwnUseInventory<DatabaseTransaction> {
  return {
    async nightStates(tx, secondHomeId, stayDates) {
      if (stayDates.length === 0) return [];
      const rows = await tx
        .selectFrom('app.date_custody as c')
        .select([
          sql<string>`c.stay_date::text`.as('stay_date'),
          'c.id',
          'c.holder_kind',
          'c.basis',
          'c.stake_id',
          sql<boolean>`EXISTS (SELECT 1 FROM app.date_occupancy o
                                WHERE o.custody_id = c.id AND o.released_at IS NULL)`.as(
            'occupied',
          ),
        ])
        .where('c.second_home_id', '=', secondHomeId)
        .where(sql<boolean>`c.stay_date = ANY(${[...stayDates]}::date[])`)
        .where('c.closed_at', 'is', null)
        .orderBy('c.stay_date')
        .execute();
      return rows.map((row) => ({
        stayDate: row.stay_date,
        custodyId: row.id,
        holderKind: row.holder_kind,
        basis: row.basis,
        stakeId: row.stake_id,
        occupied: row.occupied,
      }));
    },
    async reserveRight(tx, transition) {
      const closed = await tx
        .updateTable('app.date_custody')
        .set({ closed_at: sql<Date>`now()`, closed_by_operation: transition.operationId })
        .where('id', '=', transition.parentCustodyId)
        .where('closed_at', 'is', null)
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
          holder_kind: 'use_right',
          stake_id: transition.stakeId,
          basis: 'reserved_right',
          parent_custody_id: transition.parentCustodyId,
          opened_by_operation: transition.operationId,
        })
        .execute();
      return id;
    },
    async occupy(tx, occupancies) {
      if (occupancies.length === 0) return;
      // Em ordem crescente de noite: a trava compartilhada de cada custódia segue a ordem do TECH-053.
      await tx
        .insertInto('app.date_occupancy')
        .values(
          [...occupancies]
            .sort((a, b) => (a.stayDate < b.stayDate ? -1 : 1))
            .map((occupancy) => ({
              id: randomUUID(),
              second_home_id: occupancy.secondHomeId,
              stay_date: occupancy.stayDate,
              booking_id: occupancy.bookingId,
              channel: 'own_use',
              custody_id: occupancy.custodyId,
              stake_id: occupancy.stakeId,
              opened_by_operation: occupancy.operationId,
            })),
        )
        .execute();
    },
  };
}
