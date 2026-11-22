import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { EconomicParameterKey, EconomicTermsStore } from '../application/economic-terms';

/**
 * Leitura dos termos econômicos pelas funções do banco (ADR-0032 §5, §8): `app.parameter_at` e
 * `app.prl_period_in_force` são o contrato de leitura entre os módulos; as chaves das travas são as dos gatilhos.
 */
export function createPostgresEconomicTermsStore(): EconomicTermsStore<DatabaseTransaction> {
  return {
    async lockParameters(tx, keys) {
      for (const key of keys)
        await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`app.parameter:${key}:global`}, 0))`.execute(
          tx,
        );
    },
    async prlPeriodInForce(tx, secondHomeId, checkin, checkout) {
      const { rows } = await sql<{
        night: string;
        prl_id: string | null;
        amount: string | null;
        currency: string | null;
        resolved_at: string;
      }>`SELECT stay_date::text AS night, prl_id, amount_minor::text AS amount, currency,
                to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS resolved_at
           FROM app.prl_period_in_force(${secondHomeId}::uuid, ${checkin}::date, ${checkout}::date)`.execute(
        tx,
      );
      return {
        resolvedAt: rows[0]!.resolved_at,
        nights: rows.map((row) => ({
          stayDate: row.night,
          prlId: row.prl_id,
          amountMinor: row.amount,
          currency: row.currency,
        })),
      };
    },
    async databaseInstant(tx) {
      const { rows } = await sql<{ at: string }>`
        SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`.execute(
        tx,
      );
      return rows[0]!.at;
    },
    async parametersAt(tx, keys, at) {
      const found = new Map<
        EconomicParameterKey,
        { id: string; value: string; currency: string | null }
      >();
      for (const key of keys) {
        const { rows } = await sql<{ id: string; value: string; currency: string | null }>`
          SELECT id, value, currency FROM app.parameter_at(${key}, NULL, ${at}::timestamptz)`.execute(
          tx,
        );
        if (rows[0] !== undefined) found.set(key, rows[0]);
      }
      return found;
    },
  };
}
