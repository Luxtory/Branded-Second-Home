import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { EconomicParameterKey, EconomicTerms } from '../application/economic-terms';

/**
 * Persistência do snapshot (TECH-031; ADR-0033 §4): um por operação, na transação do efeito econômico, com o instante de
 * resolução dos termos e a FK de cada versão de parâmetro usada. O banco confere que o instante pertence à transação e
 * que cada versão é a global vigente nele. As noites de PRL entram com o primeiro consumidor de PRL (W20).
 */
export async function recordEconomicSnapshot(
  tx: DatabaseTransaction,
  operationId: string,
  terms: EconomicTerms,
): Promise<void> {
  if (terms.nights.length > 0)
    throw new Error('PRL nights are not persisted before their first consumer (W20, ADR-0033 §4)');
  await sql`INSERT INTO app.economic_snapshot (operation_id, resolved_at)
            VALUES (${operationId}::uuid, ${terms.resolvedAt}::timestamptz)`.execute(tx);
  const entries = Object.entries(terms.parameters) as [
    EconomicParameterKey,
    { parameterId: string },
  ][];
  for (const [key, parameter] of entries)
    await sql`INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
              VALUES (${operationId}::uuid, ${key}, ${parameter.parameterId}::uuid)`.execute(tx);
}

/** Gravador do snapshot como porta dos módulos consumidores. */
export const postgresEconomicSnapshotRecorder = {
  record: recordEconomicSnapshot,
} as const;
