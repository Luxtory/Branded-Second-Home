import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { lockAdvisoryKeys, type Database, type DatabaseTransaction } from '@/features/platform';
import { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY } from '../application/ports';
import {
  LUXCHANGE_EXCHANGE_CAPABILITY,
  PAYMENTS_CAPABILITY,
  type ClosableRequest,
  type LockedRequest,
  type RequestStore,
} from '../application/request-ports';
import type { RequestClosureReason, RequestHolding } from '../domain/request';
import { createPostgresDepositStore } from './postgres-deposit-store';

/** Instante em ISO 8601 UTC com microssegundos (a precisão do PostgreSQL). */
const iso = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

interface HoldingRow {
  readonly id: string;
  readonly party_id: string;
  readonly second_home_id: string;
  readonly role: string;
  readonly stake_id: string | null;
}

const toHolding = (row: HoldingRow): RequestHolding => ({
  id: row.id,
  partyId: row.party_id,
  secondHomeId: row.second_home_id,
  modality: row.role === 'owner' ? 'owner' : 'co_owner',
  stakeId: row.stake_id,
});

const vigent = (at: Date) =>
  sql`h.valid_from <= ${at} AND (h.valid_until IS NULL OR ${at} < h.valid_until)`;

/**
 * Request no PostgreSQL por SQL direto do servidor (W21; ADR-0037). As travas consultivas usam as chaves dos gatilhos do
 * banco (reentrantes para o command); a eficácia de compromisso e o motivo de encerramento vêm das funções do banco
 * (`app.luxchange_complement_effective*`, `app.luxchange_request_closure_reason`) — o servidor nunca as reimplementa.
 */
export function createPostgresRequestStore(): RequestStore<DatabaseTransaction> {
  const deposit = createPostgresDepositStore();
  return {
    async capabilities(tx) {
      const rows = await tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', 'in', [
          CREDITS_CAPABILITY,
          PAYMENTS_CAPABILITY,
          LUXCHANGE_DEPOSIT_CAPABILITY,
          LUXCHANGE_EXCHANGE_CAPABILITY,
        ])
        .execute();
      const active = new Set(rows.map((row) => row.capability));
      return {
        credits: active.has(CREDITS_CAPABILITY),
        payments: active.has(PAYMENTS_CAPABILITY),
        deposit: active.has(LUXCHANGE_DEPOSIT_CAPABILITY),
        exchange: active.has(LUXCHANGE_EXCHANGE_CAPABILITY),
      };
    },

    async lockDelegation(tx, userId, partyId, at) {
      const { rows } = await sql<{ id: string }>`SELECT id FROM app.party_delegation
         WHERE user_id = ${userId} AND party_id = ${partyId} AND state = 'active'
           AND valid_from <= ${at} AND (valid_until IS NULL OR ${at} < valid_until)
         FOR SHARE`.execute(tx);
      return rows.length > 0;
    },

    async membershipsEligible(tx, partyIds) {
      const parties = [...new Set(partyIds)];
      const { rows } = await sql<{ n: number }>`SELECT count(*)::int AS n FROM app.membership
         WHERE party_id = ANY (${parties}::uuid[]) AND state = 'active'`.execute(tx);
      return rows[0]!.n === parties.length;
    },

    async represents(tx, userId, partyId, at) {
      const { rows } = await sql<{ id: string }>`SELECT id FROM app.party_delegation
         WHERE user_id = ${userId} AND party_id = ${partyId} AND state = 'active'
           AND valid_from <= ${at} AND (valid_until IS NULL OR ${at} < valid_until)`.execute(tx);
      return rows.length > 0;
    },

    async currentHoldings(tx, partyId, at) {
      const { rows } =
        await sql<HoldingRow>`SELECT h.id, h.party_id, h.second_home_id, h.role, h.stake_id
          FROM app.holding h WHERE h.party_id = ${partyId}::uuid AND ${vigent(at)}
         ORDER BY h.valid_from, h.id`.execute(tx);
      return rows.map(toHolding);
    },

    async ownerHolding(tx, secondHomeId, at) {
      const { rows } =
        await sql<HoldingRow>`SELECT h.id, h.party_id, h.second_home_id, h.role, h.stake_id
          FROM app.holding h WHERE h.second_home_id = ${secondHomeId}::uuid AND h.role = 'owner' AND ${vigent(at)}
         ORDER BY h.valid_from, h.id LIMIT 1`.execute(tx);
      return rows[0] === undefined ? null : toHolding(rows[0]);
    },

    async holding(tx, holdingId, at) {
      const { rows } =
        await sql<HoldingRow>`SELECT h.id, h.party_id, h.second_home_id, h.role, h.stake_id
          FROM app.holding h WHERE h.id = ${holdingId}::uuid AND ${vigent(at)}`.execute(tx);
      return rows[0] === undefined ? null : toHolding(rows[0]);
    },

    lockStake: (tx, stakeId) => deposit.lockStake(tx, stakeId),

    async lockNight(tx, secondHomeId, stayDate) {
      await lockAdvisoryKeys(tx, [
        `app.second_home_date:${secondHomeId.toLowerCase()}:${stayDate}`,
      ]);
    },

    nightFacts: (tx, secondHomeId, dates) => deposit.nightFacts(tx, secondHomeId, dates),

    async committed(tx, nights, bookingIds) {
      const committedNights = new Set<string>();
      if (nights.length > 0) {
        const { rows } = await sql<{ home: string; night: string }>`
          SELECT k.home::text AS home, k.night::text AS night
            FROM unnest(${nights.map((n) => n.secondHomeId)}::uuid[], ${nights.map((n) => n.stayDate)}::date[])
                 AS k(home, night)
           WHERE app.luxchange_complement_effective(k.home, k.night) IS NOT NULL`.execute(tx);
        for (const row of rows) committedNights.add(`${row.home}:${row.night}`);
      }
      const committedBookings = new Set<string>();
      if (bookingIds.length > 0) {
        const { rows } = await sql<{ id: string }>`
          SELECT b.id::text AS id FROM unnest(${[...bookingIds]}::uuid[]) AS b(id)
           WHERE app.luxchange_complement_effective_booking(b.id) IS NOT NULL`.execute(tx);
        for (const row of rows) committedBookings.add(row.id);
      }
      return { nights: committedNights, bookings: committedBookings };
    },

    async blockingRequests(tx, requesterPartyId, nights, bookingIds) {
      if (nights.length === 0 && bookingIds.length === 0) return [];
      const { rows } = await sql<{ id: string }>`
        SELECT r.id FROM app.luxchange_request r
         WHERE r.requester_party_id = ${requesterPartyId}::uuid AND r.state = 'pending'
           AND (EXISTS (SELECT 1 FROM app.luxchange_request_complement_night c
                         JOIN unnest(${nights.map((n) => n.secondHomeId)}::uuid[],
                                     ${nights.map((n) => n.stayDate)}::date[]) AS k(home, night)
                           ON c.second_home_id = k.home AND c.stay_date = k.night
                        WHERE c.request_id = r.id AND c.state = 'active')
                OR EXISTS (SELECT 1 FROM app.luxchange_request_complement_unit u
                            WHERE u.request_id = r.id AND u.state = 'active'
                              AND u.booking_id = ANY (${[...bookingIds]}::uuid[])))
         ORDER BY r.id`.execute(tx);
      return rows.map((row) => row.id);
    },

    async lockRequests(tx, requestIds) {
      if (requestIds.length === 0) return [];
      const { rows } = await sql<{
        id: string;
        operation_id: string;
        requester_party_id: string;
        holder_party_id: string;
        second_home_id: string;
        checkin: string;
        checkout: string;
        state: LockedRequest['state'];
        guarantee_credits: string;
        expires_at: string;
        fee_charge_id: string;
        payment_id: string;
      }>`SELECT r.id, r.operation_id, r.requester_party_id, r.holder_party_id, r.second_home_id,
                r.checkin::text AS checkin, r.checkout::text AS checkout, r.state,
                trim_scale(r.guarantee_credits)::text AS guarantee_credits, ${iso('r.expires_at')} AS expires_at,
                f.id AS fee_charge_id, f.payment_id
           FROM app.luxchange_request r JOIN app.fee_charge f ON f.operation_id = r.operation_id
          WHERE r.id = ANY (${[...requestIds]}::uuid[])
          ORDER BY r.id
            FOR UPDATE OF r`.execute(tx);
      // Motivo lido depois da trava, numa instrução nova (relógio do banco e histórico confirmado).
      const { rows: reasons } = await sql<{ id: string; reason: RequestClosureReason | null }>`
        SELECT r.id, c.reason FROM unnest(${rows.map((row) => row.id)}::uuid[]) AS r(id)
          CROSS JOIN LATERAL app.luxchange_request_closure_reason(r.id) c`.execute(tx);
      const reasonOf = new Map(reasons.map((row) => [row.id, row.reason]));
      return rows.map((row): LockedRequest => ({
        id: row.id,
        operationId: row.operation_id,
        requesterPartyId: row.requester_party_id,
        holderPartyId: row.holder_party_id,
        secondHomeId: row.second_home_id,
        checkin: row.checkin,
        checkout: row.checkout,
        state: row.state,
        guaranteeCredits: row.guarantee_credits,
        expiresAt: row.expires_at,
        closureReason: reasonOf.get(row.id) ?? null,
        feeChargeId: row.fee_charge_id,
        paymentId: row.payment_id,
      }));
    },

    databaseInstant: (tx) => deposit.databaseInstant(tx),

    async insertRequest(tx, draft) {
      const { rows } = await sql<{ id: string; sent_at: string; expires_at: string }>`
        INSERT INTO app.luxchange_request (id, operation_id, requester_party_id, holder_party_id, holder_holding_id,
          second_home_id, checkin, checkout, credits_required, guarantee_credits, complement_credits)
        VALUES (${randomUUID()}::uuid, ${draft.operationId}::uuid, ${draft.requesterPartyId}::uuid,
                ${draft.holder.partyId}::uuid, ${draft.holder.id}::uuid, ${draft.holder.secondHomeId}::uuid,
                ${draft.checkin}::date, ${draft.checkout}::date, ${draft.creditsRequired}::numeric,
                ${draft.guaranteeCredits}::numeric, ${draft.complementCredits}::numeric)
        RETURNING id, ${iso('sent_at')} AS sent_at, ${iso('expires_at')} AS expires_at`.execute(tx);
      const row = rows[0]!;
      return { requestId: row.id, sentAt: row.sent_at, expiresAt: row.expires_at };
    },

    async insertRequestNights(tx, requestId, secondHomeId, nights) {
      for (const night of nights)
        await sql`INSERT INTO app.luxchange_request_night (request_id, second_home_id, stay_date, custody_id, booking_id)
                  SELECT ${requestId}::uuid, ${secondHomeId}::uuid, ${night.stayDate}::date, c.id,
                         ${night.bookingId}::uuid
                    FROM app.date_custody c
                   WHERE c.second_home_id = ${secondHomeId}::uuid AND c.stay_date = ${night.stayDate}::date
                     AND c.closed_at IS NULL`.execute(tx);
    },

    async insertComplement(tx, requestId, units) {
      for (const unit of units) {
        const unitId = randomUUID();
        await sql`INSERT INTO app.luxchange_request_complement_unit
                    (id, request_id, kind, holding_id, booking_id, potential_credits)
                  VALUES (${unitId}::uuid, ${requestId}::uuid, ${unit.kind}, ${unit.holdingId}::uuid,
                          ${unit.bookingId}::uuid, ${unit.potentialCredits}::numeric)`.execute(tx);
        for (const night of unit.nights)
          await sql`INSERT INTO app.luxchange_request_complement_night
                      (unit_id, request_id, second_home_id, stay_date, custody_id, prl_id, potential_credits)
                    SELECT ${unitId}::uuid, ${requestId}::uuid, ${unit.secondHomeId}::uuid, ${night.stayDate}::date,
                           c.id, ${night.prlId}::uuid, ${night.credits}::numeric
                      FROM app.date_custody c
                     WHERE c.second_home_id = ${unit.secondHomeId}::uuid AND c.stay_date = ${night.stayDate}::date
                       AND c.closed_at IS NULL`.execute(tx);
      }
    },

    async insertConsent(tx, requestId, textVersion, terms) {
      await sql`INSERT INTO app.luxchange_request_consent (request_id, text_version, terms)
                VALUES (${requestId}::uuid, ${textVersion}, ${JSON.stringify(terms)}::jsonb)`.execute(
        tx,
      );
    },

    async insertClosing(tx, requestId, operationId) {
      const { rows } = await sql<{
        id: string;
        to_state: 'expired' | 'cancelled_pre_accept';
        reason: RequestClosureReason;
        created_at: string;
      }>`INSERT INTO app.luxchange_request_transition (id, request_id, operation_id, reason)
         VALUES (${randomUUID()}::uuid, ${requestId}::uuid, ${operationId}::uuid, 'withdrawn')
         RETURNING id, to_state, reason, ${iso('created_at')} AS created_at`.execute(tx);
      const row = rows[0]!;
      return {
        transitionId: row.id,
        state: row.to_state,
        reason: row.reason,
        closedAt: row.created_at,
      };
    },
  };
}

/**
 * Requests pendentes que não podem mais ser aceitas (vencidas ou inelegíveis com prova), de qualquer data, para o job
 * `expire_requests` — as mais antigas primeiro. Leitura fora da transação do item; o command relê sob a trava.
 */
export async function closableRequests(
  db: Database,
  limit: number,
): Promise<readonly ClosableRequest[]> {
  const { rows } = await sql<{ id: string; reason: RequestClosureReason }>`
    SELECT r.id, c.reason FROM app.luxchange_request r
     CROSS JOIN LATERAL app.luxchange_request_closure_reason(r.id) c
     WHERE r.state = 'pending' AND c.reason IS NOT NULL
     ORDER BY r.expires_at, r.id LIMIT ${limit}`.execute(db);
  return rows.map((row) => ({ requestId: row.id, reason: row.reason }));
}
