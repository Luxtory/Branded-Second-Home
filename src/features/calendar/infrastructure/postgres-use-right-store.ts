import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';
import type { ExpirableBalance, UseRightGrant, UseRightStore } from '../application/use-rights';
import type { UseRightBucket } from '../domain/use-right';

/** Formato estável do bucket lido do banco (CHECK do ledger e da projeção). */
function bucketOf(value: string): UseRightBucket {
  if (value === 'alta' || value === 'media' || value === 'leap') return value;
  throw new RangeError(`Unexpected use right bucket: ${value}`);
}

/**
 * Ledger do TECH-026 por SQL direto do servidor (ADR-002 do 03). Instantes e fim efetivo são carimbados pelo banco; o
 * `created_at` enviado só cumpre o NOT NULL e é substituído pelo gatilho.
 */
export function createPostgresUseRightStore(): UseRightStore<DatabaseTransaction> {
  return {
    async insertGrant(tx, grant: UseRightGrant) {
      await tx
        .insertInto('app.use_right_ledger')
        .values({
          id: randomUUID(),
          second_home_id: grant.secondHomeId,
          acquisition_id: grant.acquisitionId,
          stake_id: grant.stakeId,
          exercise_year: grant.exerciseYear,
          bucket: grant.bucket,
          movement: 'grant',
          source: 'configuration',
          quantity: grant.quantity,
          operation_id: grant.operationId,
          created_at: sql<Date>`now()`,
        })
        .execute();
    },
    async insertExpiration(tx, expiration: UseRightGrant) {
      await tx
        .insertInto('app.use_right_ledger')
        .values({
          id: randomUUID(),
          second_home_id: expiration.secondHomeId,
          acquisition_id: expiration.acquisitionId,
          stake_id: expiration.stakeId,
          exercise_year: expiration.exerciseYear,
          bucket: expiration.bucket,
          movement: 'expire',
          quantity: expiration.quantity,
          operation_id: expiration.operationId,
          // Substituído pelo instante canônico calculado no banco (conferido também na consulta de invariantes).
          effective_at: sql<Date>`now()`,
          created_at: sql<Date>`now()`,
        })
        .execute();
    },
    async hasLeapDayGrant(tx, secondHomeId, exerciseYear) {
      const row = await tx
        .selectFrom('app.use_right_ledger')
        .select('id')
        .where('second_home_id', '=', secondHomeId)
        .where('exercise_year', '=', exerciseYear)
        .where('movement', '=', 'grant')
        .where('bucket', '=', 'leap')
        .executeTakeFirst();
      return row !== undefined;
    },
    async isLeapNightSealed(tx, secondHomeId, exerciseYear) {
      const row = await tx
        .selectFrom('app.second_home_date')
        .select('stay_date')
        .where('second_home_id', '=', secondHomeId)
        .where('exercise_year', '=', exerciseYear)
        .where('is_leap_day', '=', true)
        .executeTakeFirst();
      return row !== undefined;
    },
    async sealedExerciseYears(tx, secondHomeId) {
      const rows = await tx
        .selectFrom('app.second_home_date')
        .select('exercise_year')
        .distinct()
        .where('second_home_id', '=', secondHomeId)
        .orderBy('exercise_year')
        .execute();
      return rows.flatMap((row) => (row.exercise_year === null ? [] : [row.exercise_year]));
    },
    async remainingBalances(tx, secondHomeId, exerciseYear): Promise<readonly ExpirableBalance[]> {
      // Sem FOR UPDATE: exigiria UPDATE no saldo para o papel da aplicação. A linha (classe 6 do TECH-053) é travada
      // pela manutenção da projeção, em ordem crescente da chave (Ação, bucket), e a expiração exata fecha a corrida.
      const rows = await tx
        .selectFrom('app.use_right_balance')
        .select(['stake_id', 'bucket', 'remaining'])
        .where('second_home_id', '=', secondHomeId)
        .where('exercise_year', '=', exerciseYear)
        .orderBy('stake_id')
        .orderBy('bucket')
        .execute();
      return rows
        .filter((row) => (row.remaining ?? 0) > 0)
        .map((row) => ({
          stakeId: row.stake_id,
          bucket: bucketOf(row.bucket),
          remaining: row.remaining ?? 0,
        }));
    },
  };
}

/** Exercício com saldo restante, para o job `close_exercise` (o handler decide o que já venceu). */
export interface ExerciseWithRemaining {
  readonly secondHomeId: string;
  readonly exerciseYear: number;
  readonly timezone: string;
  readonly buckets: readonly UseRightBucket[];
}

export async function exercisesWithRemaining(
  db: Database,
): Promise<readonly ExerciseWithRemaining[]> {
  const rows = await db
    .selectFrom('app.use_right_balance as b')
    .innerJoin('app.second_home as h', 'h.id', 'b.second_home_id')
    .select(['b.second_home_id', 'b.exercise_year', 'b.bucket', 'h.timezone'])
    .distinct()
    .where('b.remaining', '>', 0)
    .orderBy('b.exercise_year')
    .orderBy('b.second_home_id')
    .orderBy('b.bucket')
    .execute();
  const grouped = new Map<string, ExerciseWithRemaining & { buckets: UseRightBucket[] }>();
  for (const row of rows) {
    const key = `${row.second_home_id}:${String(row.exercise_year)}`;
    const entry = grouped.get(key) ?? {
      secondHomeId: row.second_home_id,
      exerciseYear: row.exercise_year,
      timezone: row.timezone,
      buckets: [],
    };
    entry.buckets.push(bucketOf(row.bucket));
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}

/** Estado do 29/02 por Second Home: anos com a noite selada e anos já concedidos (job `open_exercise`). */
export async function leapDayStates(
  db: Database,
  secondHomeIds: readonly string[],
): Promise<
  ReadonlyMap<
    string,
    { readonly sealed: ReadonlySet<number>; readonly granted: ReadonlySet<number> }
  >
> {
  const states = new Map<string, { sealed: Set<number>; granted: Set<number> }>();
  if (secondHomeIds.length === 0) return states;
  for (const id of secondHomeIds) states.set(id, { sealed: new Set(), granted: new Set() });
  const nights = await db
    .selectFrom('app.second_home_date')
    .select(['second_home_id', 'exercise_year'])
    .where('second_home_id', 'in', secondHomeIds)
    .where('is_leap_day', '=', true)
    .execute();
  for (const night of nights) {
    if (night.exercise_year !== null)
      states.get(night.second_home_id)?.sealed.add(night.exercise_year);
  }
  const grants = await db
    .selectFrom('app.use_right_ledger')
    .select(['second_home_id', 'exercise_year'])
    .where('second_home_id', 'in', secondHomeIds)
    .where('movement', '=', 'grant')
    .where('bucket', '=', 'leap')
    .execute();
  for (const grant of grants) states.get(grant.second_home_id)?.granted.add(grant.exercise_year);
  return states;
}
