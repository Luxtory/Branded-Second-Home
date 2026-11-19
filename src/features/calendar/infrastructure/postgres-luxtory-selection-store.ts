import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import {
  LUXTORY_SELECTION_CAPABILITY,
  type LuxtorySelectionStore,
} from '../application/select-luxtory-capacity';
import type { SelectionSeason } from '../domain/luxtory-selection';

/**
 * Fatos da seleção Luxtory pelas mesmas funções SQL do gatilho (janela N+1 e capacidade), para que a recusa funcional
 * do handler e a regra do banco não divirjam (ADR-0030 §2).
 */
export function createPostgresLuxtorySelectionStore(): LuxtorySelectionStore<DatabaseTransaction> {
  return {
    async capabilityActive(tx) {
      const row = await tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', '=', LUXTORY_SELECTION_CAPABILITY)
        .executeTakeFirst();
      return row !== undefined;
    },
    async modality(tx, secondHomeId) {
      const row = await tx
        .selectFrom('app.acquisition')
        .select('modality')
        .where('second_home_id', '=', secondHomeId)
        .executeTakeFirst();
      return row === undefined ? null : (row.modality as 'owner' | 'co_owner');
    },
    async lockNights(tx, secondHomeId, stayDates) {
      await lockAdvisoryKeys(
        tx,
        stayDates.map((date) => `app.second_home_date:${secondHomeId.toLowerCase()}:${date}`),
      );
    },
    async nights(tx, secondHomeId, stayDates) {
      if (stayDates.length === 0) return [];
      const rows = await tx
        .selectFrom('app.second_home_date')
        .select([
          sql<string>`stay_date::text`.as('stay_date'),
          sql<number>`exercise_year`.as('exercise_year'),
          'season',
          sql<boolean>`is_leap_day`.as('is_leap_day'),
          'checkin_at',
        ])
        .where('second_home_id', '=', secondHomeId)
        .where(sql<boolean>`stay_date = ANY(${[...stayDates]}::date[])`)
        .orderBy('stay_date')
        .execute();
      return rows.map((row) => ({
        stayDate: row.stay_date,
        exerciseYear: Number(row.exercise_year),
        season: row.season as SelectionSeason,
        isLeapDay: row.is_leap_day,
        checkinAt: new Date(row.checkin_at),
      }));
    },
    async windowOpensAt(tx, secondHomeId, exerciseYear) {
      const { rows } = await sql<{ opens: Date | null }>`
        SELECT app.luxtory_window_opens_at(${secondHomeId}::uuid, ${exerciseYear}::int) AS opens
      `.execute(tx);
      const opens = rows[0]?.opens ?? null;
      return opens === null ? null : new Date(opens);
    },
    async lockCapacity(tx, secondHomeId, exerciseYear) {
      await lockAdvisoryKeys(tx, [
        `app.luxtory_capacity:${secondHomeId.toLowerCase()}:${exerciseYear}`,
      ]);
    },
    async capacity(tx, secondHomeId, exerciseYear, season) {
      const { rows } = await sql<{ capacity: number }>`
        SELECT app.luxtory_capacity(${secondHomeId}::uuid, ${exerciseYear}::int, ${season}) AS capacity
      `.execute(tx);
      return Number(rows[0]?.capacity ?? 0);
    },
    async used(tx, secondHomeId, exerciseYear, season) {
      const row = await tx
        .selectFrom('app.date_custody as c')
        .innerJoin('app.second_home_date as d', (join) =>
          join
            .onRef('d.second_home_id', '=', 'c.second_home_id')
            .onRef('d.stay_date', '=', 'c.stay_date'),
        )
        .select(sql<number>`count(*)::int`.as('used'))
        .where('c.second_home_id', '=', secondHomeId)
        .where('c.closed_at', 'is', null)
        .where('c.holder_kind', '=', 'luxtory')
        .where((eb) =>
          eb.or([
            eb('c.purpose', '<>', 'inventory'),
            eb('c.inventory_origin', '=', 'annual_allocation'),
          ]),
        )
        .where(sql<boolean>`d.exercise_year = ${exerciseYear}`)
        .where('d.season', '=', season)
        .where(sql<boolean>`NOT d.is_leap_day`)
        .executeTakeFirstOrThrow();
      return Number(row.used);
    },
  };
}
