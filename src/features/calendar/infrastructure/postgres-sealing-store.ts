import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';
import type { SealingStore } from '../application/open-exercise';

/** Noites seladas por SQL direto do servidor (ADR-002 do 03). */
export function createPostgresSealingStore(): SealingStore<DatabaseTransaction> {
  return {
    async lockSecondHome(tx, secondHomeId) {
      // Mesma chave da trava da W8 (`app.serialize_second_home_fact`): formalização e selagem se serializam.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`app.second_home:${secondHomeId}`}, 0))`.execute(
        tx,
      );
    },
    async isSealed(tx, secondHomeId, exerciseYear) {
      const row = await tx
        .selectFrom('app.second_home_date')
        .select('stay_date')
        .where('second_home_id', '=', secondHomeId)
        .where('exercise_year', '=', exerciseYear)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },
    async seal(tx, secondHomeId, nights, sealedAt) {
      await tx
        .insertInto('app.second_home_date')
        .values(
          nights.map((night) => ({
            second_home_id: secondHomeId,
            stay_date: night.stayDate,
            season: night.season,
            checkin_at: night.checkInAt,
            sealed_at: sealedAt,
          })),
        )
        .execute();
    },
  };
}

/** Exercícios já selados (`<id>:<ano>`): a selagem é atômica por exercício, uma noite basta. */
export async function sealedExercises(
  db: Database,
  secondHomeIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (secondHomeIds.length === 0) return new Set();
  const rows = await db
    .selectFrom('app.second_home_date')
    .select(['second_home_id', 'exercise_year'])
    .distinct()
    .where('second_home_id', 'in', secondHomeIds)
    .execute();
  return new Set(rows.map((row) => `${row.second_home_id}:${String(row.exercise_year)}`));
}
