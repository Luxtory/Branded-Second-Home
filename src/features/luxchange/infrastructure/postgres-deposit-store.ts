import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import {
  CREDITS_CAPABILITY,
  LUXCHANGE_DEPOSIT_CAPABILITY,
  type DepositStore,
} from '../application/ports';

/**
 * Leituras e travas do depósito por SQL direto do servidor (W20; ADR-0036). As chaves das travas consultivas são as dos
 * gatilhos do banco (`app.stake:<uuid>`, `app.second_home_date:<casa>:<data>`), então são reentrantes para o command.
 */
export function createPostgresDepositStore(): DepositStore<DatabaseTransaction> {
  return {
    async capabilities(tx) {
      const rows = await tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', 'in', [CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY])
        .execute();
      const active = new Set(rows.map((row) => row.capability));
      return {
        credits: active.has(CREDITS_CAPABILITY),
        deposit: active.has(LUXCHANGE_DEPOSIT_CAPABILITY),
      };
    },
    async lockRepresentation(tx, { userId, partyId, secondHomeId, at }) {
      // TECH-050 / ADR-0021: a delegação travada em modo compartilhado — a revogação concorrente espera, ou é vista.
      const delegation = await sql<{ id: string }>`SELECT id FROM app.party_delegation
         WHERE user_id = ${userId} AND party_id = ${partyId} AND state = 'active'
           AND valid_from <= ${at} AND (valid_until IS NULL OR ${at} < valid_until)
         FOR SHARE`.execute(tx);
      if (delegation.rows.length === 0) return null;
      const holding = await tx
        .selectFrom('app.holding')
        .select(['id', 'role', 'stake_id'])
        .where('party_id', '=', partyId)
        .where('second_home_id', '=', secondHomeId)
        .where('valid_from', '<=', at)
        .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>', at)]))
        .executeTakeFirst();
      if (holding === undefined) return null;
      return {
        id: holding.id,
        modality: holding.role === 'owner' ? 'owner' : 'co_owner',
        stakeId: holding.stake_id,
      };
    },
    async lockStake(tx, stakeId) {
      await lockAdvisoryKeys(tx, [`app.stake:${stakeId.toLowerCase()}`]);
    },
    async lockNights(tx, secondHomeId, dates) {
      await lockAdvisoryKeys(
        tx,
        dates.map((date) => `app.second_home_date:${secondHomeId.toLowerCase()}:${date}`),
      );
    },
    async nightFacts(tx, secondHomeId, dates) {
      if (dates.length === 0) return [];
      const { rows } = await sql<{
        stay_date: string;
        checkin_at: string;
        holder_kind: string | null;
        stake_id: string | null;
        basis: string | null;
        inventory_origin: string | null;
        booking_id: string | null;
        channel: string | null;
      }>`SELECT d.stay_date::text AS stay_date,
                to_char(d.checkin_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS checkin_at,
                c.holder_kind, c.stake_id, c.basis, c.inventory_origin, o.booking_id, o.channel
           FROM app.second_home_date d
           LEFT JOIN app.date_custody c
             ON c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date AND c.closed_at IS NULL
           LEFT JOIN app.date_occupancy o
             ON o.second_home_id = d.second_home_id AND o.stay_date = d.stay_date AND o.released_at IS NULL
          WHERE d.second_home_id = ${secondHomeId}::uuid AND d.stay_date = ANY (${[...dates]}::date[])
          ORDER BY d.stay_date`.execute(tx);
      return rows.map((row) => ({
        stayDate: row.stay_date,
        checkinAt: row.checkin_at,
        custody:
          row.holder_kind === null
            ? null
            : {
                holderKind: row.holder_kind,
                stakeId: row.stake_id,
                basis: row.basis,
                inventoryOrigin: row.inventory_origin,
              },
        occupancy:
          row.booking_id === null ? null : { bookingId: row.booking_id, channel: row.channel! },
      }));
    },
    async databaseInstant(tx) {
      const { rows } = await sql<{ at: string }>`
        SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`.execute(
        tx,
      );
      return rows[0]!.at;
    },
  };
}
