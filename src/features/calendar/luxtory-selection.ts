// Superfície pública de servidor do calendar para a seleção Luxtory (W14, ADR-0030; spec calendar §9): o command
// `select_luxtory_capacity` com as dependências de produção e a leitura do Admin. Fora de `index.ts`, como `booking.ts`.
import { sql } from 'kysely';
import { assertTransactionalAdminAuthority } from '@/features/identity';
import { createLuxtorySelectionInventory, type LuxtoryPurpose } from '@/features/inventory';
import type { Database, DatabaseTransaction } from '@/features/platform';
import {
  createSelectLuxtoryCapacityHandler,
  LUXTORY_SELECTION_CAPABILITY,
} from './application/select-luxtory-capacity';
import { createPostgresLuxtorySelectionStore } from './infrastructure/postgres-luxtory-selection-store';

export {
  MAX_SELECTION_NIGHTS,
  selectLuxtoryCapacityInput,
  type SelectLuxtoryCapacityInput,
  type SelectLuxtoryCapacityResult,
} from './application/select-luxtory-capacity';
export { civilDatesBetween } from './domain/luxtory-selection';

export function createLuxtorySelectionHandlers() {
  return {
    selectLuxtoryCapacity: createSelectLuxtoryCapacityHandler<DatabaseTransaction>({
      store: createPostgresLuxtorySelectionStore(),
      inventory: createLuxtorySelectionInventory(),
      assertAdmin: assertTransactionalAdminAuthority,
    }),
  };
}

export interface LuxtoryExerciseOverview {
  readonly year: number;
  /** Abertura da janela N+1; `null` = sem janela (sorteio não revelado). */
  readonly opensAt: Date | null;
  readonly capacity: { readonly alta: number; readonly media: number };
  readonly used: { readonly alta: number; readonly media: number };
}

export interface LuxtorySelectionOverview {
  readonly secondHomeId: string;
  readonly label: string;
  readonly timezone: string;
  readonly modality: 'owner' | 'co_owner' | null;
  readonly activated: boolean;
  readonly exercises: readonly LuxtoryExerciseOverview[];
  readonly selections: readonly {
    readonly stayDate: string;
    readonly purpose: LuxtoryPurpose;
    readonly season: 'alta' | 'media';
    readonly exerciseYear: number;
    readonly basis: string;
  }[];
}

/**
 * Leitura do Admin (papel do servidor; a página já passou pelo portão Admin): capacidade e uso por exercício e
 * categoria, janela N+1 e as seleções ativas — pelas mesmas funções SQL do gatilho. Não decide nada: o command revalida.
 */
export async function readLuxtorySelectionOverview(
  db: Database,
  secondHomeId: string,
  now: Date,
): Promise<LuxtorySelectionOverview | null> {
  const home = await db
    .selectFrom('app.second_home as s')
    .leftJoin('app.acquisition as a', 'a.second_home_id', 's.id')
    .select(['s.id', 's.label', 's.timezone', 'a.modality'])
    .where('s.id', '=', secondHomeId)
    .executeTakeFirst();
  if (home === undefined) return null;
  const activated =
    (await db
      .selectFrom('app.capability_activation')
      .select('capability')
      .where('capability', '=', LUXTORY_SELECTION_CAPABILITY)
      .executeTakeFirst()) !== undefined;
  const { rows: exercises } = await sql<{
    year: number;
    opens_at: Date | null;
    capacity_alta: number;
    capacity_media: number;
    used_alta: number;
    used_media: number;
  }>`
    SELECT y.year, app.luxtory_window_opens_at(${secondHomeId}::uuid, y.year) AS opens_at,
           app.luxtory_capacity(${secondHomeId}::uuid, y.year, 'alta') AS capacity_alta,
           app.luxtory_capacity(${secondHomeId}::uuid, y.year, 'media') AS capacity_media,
           (SELECT count(*)::int FROM app.date_custody c JOIN app.second_home_date d USING (second_home_id, stay_date)
             WHERE c.second_home_id = ${secondHomeId}::uuid AND c.closed_at IS NULL AND c.holder_kind = 'luxtory'
               AND (c.purpose <> 'inventory' OR c.inventory_origin = 'annual_allocation')
               AND d.exercise_year = y.year AND d.season = 'alta' AND NOT d.is_leap_day) AS used_alta,
           (SELECT count(*)::int FROM app.date_custody c JOIN app.second_home_date d USING (second_home_id, stay_date)
             WHERE c.second_home_id = ${secondHomeId}::uuid AND c.closed_at IS NULL AND c.holder_kind = 'luxtory'
               AND (c.purpose <> 'inventory' OR c.inventory_origin = 'annual_allocation')
               AND d.exercise_year = y.year AND d.season = 'media' AND NOT d.is_leap_day) AS used_media
      FROM (SELECT DISTINCT exercise_year AS year FROM app.second_home_date
             WHERE second_home_id = ${secondHomeId}::uuid AND checkin_at > ${now.toISOString()}::timestamptz) y
     ORDER BY y.year
  `.execute(db);
  const selections = await db
    .selectFrom('app.date_custody as c')
    .innerJoin('app.second_home_date as d', (join) =>
      join
        .onRef('d.second_home_id', '=', 'c.second_home_id')
        .onRef('d.stay_date', '=', 'c.stay_date'),
    )
    .select([
      sql<string>`c.stay_date::text`.as('stay_date'),
      'c.purpose',
      'd.season',
      sql<number>`d.exercise_year`.as('exercise_year'),
      'c.authorization_ref',
    ])
    .where('c.second_home_id', '=', secondHomeId)
    .where('c.closed_at', 'is', null)
    .where('c.holder_kind', '=', 'luxtory')
    .where((eb) =>
      eb.or([
        eb('c.purpose', '<>', 'inventory'),
        eb('c.inventory_origin', '=', 'annual_allocation'),
      ]),
    )
    .orderBy('c.stay_date')
    .execute();
  return {
    secondHomeId: home.id,
    label: home.label,
    timezone: home.timezone,
    modality: (home.modality as 'owner' | 'co_owner' | null) ?? null,
    activated,
    exercises: exercises.map((row) => ({
      year: Number(row.year),
      opensAt: row.opens_at === null ? null : new Date(row.opens_at),
      capacity: { alta: Number(row.capacity_alta), media: Number(row.capacity_media) },
      used: { alta: Number(row.used_alta), media: Number(row.used_media) },
    })),
    selections: selections.map((row) => ({
      stayDate: row.stay_date,
      purpose: row.purpose as LuxtoryPurpose,
      season: row.season as 'alta' | 'media',
      exerciseYear: Number(row.exercise_year),
      basis: row.authorization_ref ?? '',
    })),
  };
}
