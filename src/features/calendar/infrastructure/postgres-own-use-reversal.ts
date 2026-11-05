import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { UseRightReversal } from '../application/correct-use-right';
import { bucketOf } from './postgres-use-right-store';

/**
 * `restore` (cancelamento tempestivo, BR-280) e `correction` (invalidação, TECH-026) do `consume` da criação da reserva
 * na noite (W13). Mesma quantidade do consumo; `restore` leva a data da noite, `correction` mantém a forma da W11 (sem
 * data). O banco confere a transição da mesma operação, a noite não iniciada e a reversão única (ADR-0027).
 */
export function createPostgresOwnUseReversal(): UseRightReversal<DatabaseTransaction> {
  return {
    async reverseCreationConsumption(tx, reversal) {
      const consume = await tx
        .selectFrom('app.use_right_ledger')
        .select([
          'id',
          'second_home_id',
          'acquisition_id',
          'stake_id',
          'exercise_year',
          'bucket',
          'quantity',
        ])
        .where('operation_id', '=', reversal.bookingOperationId)
        .where('movement', '=', 'consume')
        .where(sql<boolean>`stay_date = ${reversal.stayDate}::date`)
        .executeTakeFirst();
      if (consume === undefined) return null;
      await tx
        .insertInto('app.use_right_ledger')
        .values({
          id: randomUUID(),
          second_home_id: consume.second_home_id,
          acquisition_id: consume.acquisition_id,
          stake_id: consume.stake_id,
          exercise_year: consume.exercise_year,
          bucket: consume.bucket,
          movement: reversal.movement,
          quantity: consume.quantity,
          stay_date: reversal.movement === 'restore' ? reversal.stayDate : null,
          refers_to_id: consume.id,
          operation_id: reversal.operationId,
          // Substituído pelo instante carimbado no gatilho do ledger (W11).
          created_at: sql<Date>`now()`,
        })
        .execute();
      return bucketOf(consume.bucket);
    },
  };
}
