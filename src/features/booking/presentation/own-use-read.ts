import { sql } from 'kysely';
import { getDatabase, withUserRead, type Database } from '@/features/platform';

/**
 * Recuperação de resultado incerto (ADR-0026 D6): reserva confirmada da Second Home com exatamente estas datas, visível
 * ao usuário pela RLS da W12 (holding vigente que ele representa). Nunca reserva de terceiros: a política só devolve as
 * reservas da Ação (ou do Owner) que ele representa agora.
 */
export async function findConfirmedOwnUseBooking(
  userId: string,
  query: {
    readonly secondHomeId: string;
    readonly checkinDate: string;
    readonly checkoutDate: string;
  },
  db: Database = getDatabase(),
): Promise<string | null> {
  return withUserRead(db, { sub: userId, role: 'authenticated' }, async (tx) => {
    const row = await tx
      .selectFrom('app.booking')
      .select('id')
      .where('second_home_id', '=', query.secondHomeId)
      .where('checkin_date', '=', sql<Date>`${query.checkinDate}::date`)
      .where('checkout_date', '=', sql<Date>`${query.checkoutDate}::date`)
      .where('state', '=', 'confirmed')
      .executeTakeFirst();
    return row?.id ?? null;
  });
}
