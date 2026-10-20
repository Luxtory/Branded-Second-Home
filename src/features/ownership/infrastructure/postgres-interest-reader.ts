import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { InterestCount, InterestReader } from '../application/ports';
import type { InterestModality } from '../domain/interest';

// O CHECK do banco garante o valor do enum.
const modality = (value: string) => value as InterestModality;

/** Contagens agregadas para o Admin (BR-062), como `luxtory_app` na transação do `admin_read` (ADR-0010 §7). */
export const postgresInterestReader: InterestReader<DatabaseTransaction> = {
  async counts(tx) {
    const rows = await tx
      .selectFrom('app.interest')
      .select(['home_edition_id', 'desired_location', 'modality', 'approx_days'])
      .select(sql<number>`count(*)::int`.as('count'))
      .groupBy(['home_edition_id', 'desired_location', 'modality', 'approx_days'])
      .execute();
    return rows.map((row): InterestCount => ({
      homeEditionId: row.home_edition_id,
      desiredLocation: row.desired_location,
      modality: modality(row.modality),
      approxDays: row.approx_days,
      count: row.count,
    }));
  },
};
