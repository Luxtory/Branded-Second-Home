import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { GuestNominationStore } from '../application/nominate-guest';

/** Declaração de convidados por SQL direto do servidor; o gatilho do banco decide (ADR-0030 §4). */
export function createPostgresGuestNominationStore(): GuestNominationStore<DatabaseTransaction> {
  return {
    async lockRulesShared(tx, secondHomeId) {
      const key = `app.parameter:guest_rules:${secondHomeId.toLowerCase()}`;
      await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`.execute(tx);
    },
    async rulesInForce(tx, secondHomeId, at) {
      const { rows } = await sql<{ id: string }>`
        SELECT id FROM app.parameter_at('guest_rules', ${secondHomeId}::uuid, ${at.toISOString()}::timestamptz)
      `.execute(tx);
      return rows[0]?.id ?? null;
    },
    async declared(tx, bookingId, rulesId) {
      const row = await tx
        .selectFrom('app.guest_nomination')
        .select('id')
        .where('booking_id', '=', bookingId)
        .where('parameter_id', '=', rulesId)
        .executeTakeFirst();
      return row !== undefined;
    },
    async insert(tx, draft) {
      await tx
        .insertInto('app.guest_nomination')
        .values({
          id: draft.id,
          booking_id: draft.bookingId,
          second_home_id: draft.secondHomeId,
          parameter_id: draft.rulesId,
          party_id: draft.partyId,
          // Carimbado pelo gatilho no instante da declaração; o valor enviado nunca prevalece.
          nominated_at: sql<Date>`now()`,
          operation_id: draft.operationId,
        })
        .execute();
    },
  };
}
