import { sql } from 'kysely';
import type { Database } from '@/features/platform';

/** Lotes com saldo disponível e `expires_at` já passado no relógio do banco, de qualquer data (job atrasado recupera). */
export async function dueCreditLots(db: Database): Promise<readonly string[]> {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM app.credit_lot
     WHERE available > 0 AND expires_at <= clock_timestamp()
     ORDER BY expires_at, originated_at, id`.execute(db);
  return rows.map((row) => row.id);
}
