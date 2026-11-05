import { sql } from 'kysely';
import type { DatabaseTransaction } from './connection';

/**
 * Travas consultivas de transação na ordem dada, **uma instrução por chave** (spec booking §10.11.1, 2ª auditoria do
 * PR #82): a ordem é calculada antes (`LockSequence`) e nunca depende da ordem de avaliação de uma consulta SQL. As
 * chaves são as mesmas dos gatilhos do banco (`app.stake:<uuid>`, `app.second_home_date:<casa>:<data>`,
 * `app.booking:<uuid>`, UUID minúsculo) e o hash é o mesmo (`hashtextextended(chave, 0)`): a trava do gatilho é
 * reentrante para o command.
 */
export async function lockAdvisoryKeys(
  tx: DatabaseTransaction,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(tx);
  }
}
