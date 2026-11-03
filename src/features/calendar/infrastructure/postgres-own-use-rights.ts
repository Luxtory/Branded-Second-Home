import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { UseRightBucket } from '../domain/use-right';
import { bucketOf } from './postgres-use-right-store';

/** Uma noite consumida pela reserva: o bucket e o exercício da própria noite (REQ-030, TECH-027, INV-5). */
export interface OwnUseConsumption {
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly stakeId: string;
  readonly stayDate: string;
  readonly exerciseYear: number;
  readonly bucket: UseRightBucket;
  readonly operationId: string;
}

export interface BalanceKey {
  readonly exerciseYear: number;
  readonly bucket: UseRightBucket;
}

export const balanceKey = (key: BalanceKey) => `${key.exerciseYear}:${key.bucket}`;

/**
 * Ledger e projeção do Direito de Uso para a reserva de uso próprio (W12). O banco confere cada consumo contra a reserva,
 * a `reserved_right` da mesma operação e o saldo (ADR-0026); aqui só a leitura do saldo restante e a escrita.
 */
export function createPostgresOwnUseRights() {
  return {
    /** Saldo restante por exercício e bucket; chave ausente = nada concedido (0). */
    async remaining(
      tx: DatabaseTransaction,
      stakeId: string,
      keys: readonly BalanceKey[],
    ): Promise<ReadonlyMap<string, number>> {
      if (keys.length === 0) return new Map();
      const rows = await tx
        .selectFrom('app.use_right_balance')
        .select(['exercise_year', 'bucket', 'remaining'])
        .where('stake_id', '=', stakeId)
        .where(
          'exercise_year',
          'in',
          keys.map((key) => key.exerciseYear),
        )
        .execute();
      return new Map(
        rows.map((row) => [
          balanceKey({ exerciseYear: row.exercise_year, bucket: bucketOf(row.bucket) }),
          row.remaining ?? 0,
        ]),
      );
    },
    async consume(tx: DatabaseTransaction, entry: OwnUseConsumption): Promise<void> {
      await tx
        .insertInto('app.use_right_ledger')
        .values({
          id: randomUUID(),
          second_home_id: entry.secondHomeId,
          acquisition_id: entry.acquisitionId,
          stake_id: entry.stakeId,
          exercise_year: entry.exerciseYear,
          bucket: entry.bucket,
          movement: 'consume',
          quantity: 1,
          stay_date: entry.stayDate,
          operation_id: entry.operationId,
          // Substituído pelo instante carimbado no gatilho do ledger (W11).
          created_at: sql<Date>`now()`,
        })
        .execute();
    },
  };
}
