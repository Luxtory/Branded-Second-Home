import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { EconomicParameterKey, EconomicTerms } from '../application/economic-terms';

/**
 * Persistência do snapshot (TECH-031; ADR-0033 §4, ADR-0036 §4): um por operação, na transação do efeito econômico, com
 * o instante de resolução dos termos, a FK de cada versão de parâmetro usada e a FK da versão do PRL de cada noite. O
 * banco confere que o instante pertence à transação e que cada versão é a vigente nele (parâmetro global; PRL da noite).
 */
export async function recordEconomicSnapshot(
  tx: DatabaseTransaction,
  operationId: string,
  terms: EconomicTerms,
): Promise<void> {
  await sql`INSERT INTO app.economic_snapshot (operation_id, resolved_at)
            VALUES (${operationId}::uuid, ${terms.resolvedAt}::timestamptz)`.execute(tx);
  const entries = Object.entries(terms.parameters) as [
    EconomicParameterKey,
    { parameterId: string },
  ][];
  for (const [key, parameter] of entries)
    await sql`INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
              VALUES (${operationId}::uuid, ${key}, ${parameter.parameterId}::uuid)`.execute(tx);
  for (const night of terms.nights)
    await sql`INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
              VALUES (${operationId}::uuid, ${terms.secondHomeId}::uuid, ${night.stayDate}::date,
                      ${night.prlId}::uuid)`.execute(tx);
}

/** Gravador do snapshot como porta dos módulos consumidores. */
export const postgresEconomicSnapshotRecorder = {
  record: recordEconomicSnapshot,
} as const;
