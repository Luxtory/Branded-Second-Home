import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from './connection';

/**
 * Leitura pública (Discovery, ADR-0012): transação só de leitura em que o papel de aplicação vira `anon`. O banco só
 * entrega as colunas concedidas a `anon` e as linhas que a RLS torna públicas — uma consulta errada falha em vez de
 * vazar. Sem claims: nenhuma política pública depende de usuário. `SET LOCAL` vale só dentro da transação (Supavisor
 * em modo transação).
 */
export async function withPublicRead<T>(
  db: Database,
  read: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SET LOCAL ROLE anon`.execute(tx);
    return read(tx);
  });
}
