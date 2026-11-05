import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';
import type { BookingJobStore, BookingSweepCandidate } from '../application/own-use-lifecycle-jobs';
import { microsFromText } from './lifecycle-instants';

/**
 * Jobs do ciclo da reserva por SQL direto do servidor (W13 E3; spec booking §10.14). As varreduras usam o relógio do
 * banco e as mesmas funções da E1 (`app.booking_period_instants`, `app.booking_no_show_window_open`); só selecionam —
 * o handler revalida sob as travas e o gatilho confere cada escrita no instante dela.
 */
interface CandidateRow {
  id: string;
  second_home_id: string;
  last_transition_id: string | null;
}

const toCandidate = (row: CandidateRow): BookingSweepCandidate => ({
  bookingId: row.id,
  secondHomeId: row.second_home_id,
  lastTransitionId: row.last_transition_id,
});

/** Reservas `confirmed` com o 1º check-in alcançado ou `in_use` com o check-out alcançado (TECH-055). */
export async function advanceCandidates(db: Database): Promise<readonly BookingSweepCandidate[]> {
  const { rows } = await sql<CandidateRow>`
    SELECT b.id, b.second_home_id, b.last_transition_id
      FROM app.booking b CROSS JOIN LATERAL app.booking_period_instants(b.id) AS i
     WHERE b.channel = 'own_use' AND b.state IN ('confirmed', 'in_use')
       AND clock_timestamp() >= CASE WHEN b.state = 'confirmed' THEN i.first_checkin_at ELSE i.checkout_at END
     ORDER BY i.first_checkin_at, b.id`.execute(db);
  return rows.map(toCandidate);
}

/**
 * Reservas `confirmed`/`in_use` com a janela do no-show aberta e ainda sem registro (TECH-046), a mais próxima do
 * check-out primeiro: o registro não se recupera depois que a janela fecha.
 */
export async function noShowCandidates(db: Database): Promise<readonly BookingSweepCandidate[]> {
  const { rows } = await sql<CandidateRow>`
    SELECT b.id, b.second_home_id, b.last_transition_id
      FROM app.booking b CROSS JOIN LATERAL app.booking_period_instants(b.id) AS i
     WHERE b.channel = 'own_use' AND b.state IN ('confirmed', 'in_use')
       AND app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, clock_timestamp())
       AND NOT EXISTS (SELECT 1 FROM app.booking_no_show_candidate c WHERE c.booking_id = b.id)
     ORDER BY i.checkout_at, b.id`.execute(db);
  return rows.map(toCandidate);
}

export function createPostgresBookingJobStore(): BookingJobStore<DatabaseTransaction> {
  return {
    async databaseNow(tx) {
      const { rows } = await sql<{ now_us: string }>`
        SELECT (extract(epoch FROM clock_timestamp()) * 1000000)::bigint::text AS now_us`.execute(
        tx,
      );
      return microsFromText(rows[0]!.now_us);
    },
    async isFlagged(tx, bookingId) {
      const row = await tx
        .selectFrom('app.booking_no_show_candidate')
        .select('booking_id')
        .where('booking_id', '=', bookingId)
        .executeTakeFirst();
      return row !== undefined;
    },
    async flag(tx, bookingId, operationId) {
      const row = await tx
        .insertInto('app.booking_no_show_candidate')
        .values({
          booking_id: bookingId,
          operation_id: operationId,
          // Carimbado pelo gatilho (instante do banco).
          flagged_at: sql<Date>`now()`,
        })
        .returning(
          sql<string>`(extract(epoch FROM flagged_at) * 1000000)::bigint::text`.as('flagged_us'),
        )
        .executeTakeFirstOrThrow();
      return microsFromText(row.flagged_us);
    },
  };
}
