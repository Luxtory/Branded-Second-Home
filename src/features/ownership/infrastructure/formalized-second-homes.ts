import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';

export type AcquisitionModality = 'owner' | 'co_owner';

/** Second Home formalizada (W8): o que a selagem da W10 lê — modalidade, data-base civil e fuso. */
export interface FormalizedSecondHome {
  readonly secondHomeId: string;
  readonly modality: AcquisitionModality;
  /** Data-base civil `YYYY-MM-DD`, congelada na formalização (ADR-0021). */
  readonly operationStartDate: string;
  readonly timezone: string;
}

class UnexpectedModalityError extends Error {
  constructor(value: string) {
    super(`Unexpected acquisition modality: ${value}`);
    this.name = 'UnexpectedModalityError';
  }
}

function modalityOf(value: string): AcquisitionModality {
  if (value === 'owner' || value === 'co_owner') return value;
  throw new UnexpectedModalityError(value);
}

function formalized(db: Database | DatabaseTransaction) {
  return db
    .selectFrom('app.acquisition as a')
    .innerJoin('app.second_home as h', 'h.id', 'a.second_home_id')
    .select([
      'a.second_home_id as secondHomeId',
      'a.modality as modality',
      // DATE como texto civil, sem reinterpretar pelo fuso do processo (ADR-0021).
      sql<string>`a.operation_start_date::text`.as('operationStartDate'),
      'h.timezone as timezone',
    ]);
}

/** Todas as Second Homes formalizadas, em ordem estável. */
export async function listFormalizedSecondHomes(
  db: Database | DatabaseTransaction,
): Promise<readonly FormalizedSecondHome[]> {
  const rows = await formalized(db).orderBy('a.second_home_id').execute();
  return rows.map((row) => ({ ...row, modality: modalityOf(row.modality) }));
}

/** A Second Home formalizada, ou `null` sem formalização. */
export async function findFormalizedSecondHome(
  db: Database | DatabaseTransaction,
  secondHomeId: string,
): Promise<FormalizedSecondHome | null> {
  const row = await formalized(db).where('a.second_home_id', '=', secondHomeId).executeTakeFirst();
  return row === undefined ? null : { ...row, modality: modalityOf(row.modality) };
}
