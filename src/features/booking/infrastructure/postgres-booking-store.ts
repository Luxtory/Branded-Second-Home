import { sql } from 'kysely';
import { currentHolding } from '@/features/ownership';
import type { DatabaseTransaction } from '@/features/platform';
import type { BookingStore, SealedOwnUseNight } from '../application/create-own-use-booking';

/** Capacidade de reserva de uso próprio na tabela de ativação privilegiada (ADR-0026). */
export const OWN_USE_BOOKING_CAPABILITY = 'own_use_booking';

class UnexpectedSeasonError extends Error {
  constructor(value: string) {
    super(`Unexpected season: ${value}`);
    this.name = 'UnexpectedSeasonError';
  }
}

function seasonOf(value: string): SealedOwnUseNight['season'] {
  if (value === 'alta' || value === 'media') return value;
  throw new UnexpectedSeasonError(value);
}

/** Data civil `YYYY-MM-DD` como `date` do PostgreSQL (o driver lê `date` como `Date`; aqui só se compara). */
const civil = (date: string) => sql<Date>`${date}::date`;

/** Travas consultivas em uma instrução, na ordem dada (a junção lateral itera a subconsulta já ordenada). */
async function advisoryLocks(tx: DatabaseTransaction, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await sql`SELECT count(*) FROM (
      SELECT k FROM unnest(${[...keys]}::text[]) WITH ORDINALITY AS t(k, n) ORDER BY n
    ) AS ordered, LATERAL (SELECT pg_advisory_xact_lock(hashtextextended(ordered.k, 0))) AS taken`.execute(
    tx,
  );
}

/**
 * Reserva de uso próprio por SQL direto do servidor (ADR-002 do `03`). As chaves das travas consultivas são as mesmas que
 * o gatilho do banco usa (`app.stake:<uuid>`), então a trava do gatilho é reentrante para o command.
 */
export function createPostgresBookingStore(): BookingStore<DatabaseTransaction> {
  return {
    async isActivated(tx) {
      const row = await tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', '=', OWN_USE_BOOKING_CAPABILITY)
        .executeTakeFirst();
      return row !== undefined;
    },
    async lockRepresentation(tx, { userId, partyId, secondHomeId, at }) {
      // TECH-050 / ADR-0021: a delegação travada em modo compartilhado — a revogação concorrente espera, ou é vista.
      const delegation = await sql<{ id: string }>`SELECT id FROM app.party_delegation
         WHERE user_id = ${userId} AND party_id = ${partyId} AND state = 'active'
           AND valid_from <= ${at} AND (valid_until IS NULL OR ${at} < valid_until)
         FOR SHARE`.execute(tx);
      if (delegation.rows.length === 0) return null;
      const holding = await currentHolding(tx, partyId, secondHomeId, at);
      return holding === null
        ? null
        : { holdingId: holding.id, role: holding.role, stakeId: holding.stakeId };
    },
    async lockStake(tx, stakeId) {
      await advisoryLocks(tx, [`app.stake:${stakeId.toLowerCase()}`]);
    },
    async lockNights(tx, secondHomeId, stayDates) {
      await advisoryLocks(
        tx,
        stayDates.map((date) => `app.second_home_date:${secondHomeId.toLowerCase()}:${date}`),
      );
    },
    async sealedNights(tx, secondHomeId, checkinDate, checkoutDate) {
      const rows = await tx
        .selectFrom('app.second_home_date')
        .select([
          sql<string>`stay_date::text`.as('stay_date'),
          'exercise_year',
          'season',
          'is_leap_day',
          'checkin_at',
        ])
        .where('second_home_id', '=', secondHomeId)
        .where('stay_date', '>=', civil(checkinDate))
        .where('stay_date', '<', civil(checkoutDate))
        .orderBy('stay_date')
        .execute();
      return rows.map((row) => ({
        stayDate: row.stay_date,
        exerciseYear: Number(row.exercise_year),
        season: seasonOf(row.season),
        isLeapDay: Boolean(row.is_leap_day),
        checkInAt: new Date(row.checkin_at),
      }));
    },
    async ownUseNights(tx, stakeId, from, to) {
      const rows = await tx
        .selectFrom('app.date_occupancy')
        .select(sql<string>`stay_date::text`.as('stay_date'))
        .where('stake_id', '=', stakeId)
        .where('channel', '=', 'own_use')
        .where('released_at', 'is', null)
        .where('stay_date', '>=', civil(from))
        .where('stay_date', '<', civil(to))
        .execute();
      return rows.map((row) => row.stay_date);
    },
    async insertBooking(tx, booking) {
      const row = await tx
        .insertInto('app.booking')
        .values({
          id: booking.id,
          second_home_id: booking.secondHomeId,
          channel: 'own_use',
          holding_id: booking.holdingId,
          stake_id: booking.stakeId,
          checkin_date: booking.checkinDate,
          checkout_date: booking.checkoutDate,
          state: 'confirmed',
          opened_by_operation: booking.operationId,
          // Substituído pelo instante de aceite carimbado no gatilho (`clock_timestamp()`, ADR-0026).
          confirmed_at: sql<Date>`now()`,
        })
        .returning('confirmed_at')
        .executeTakeFirstOrThrow();
      return new Date(row.confirmed_at);
    },
  };
}
