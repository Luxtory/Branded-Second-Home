import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type {
  AcceptanceTerms,
  RequestAcceptanceStore,
} from '../application/request-acceptance-ports';
import type { RequestClosureReason } from '../domain/request';
import { createPostgresRequestStore } from './postgres-request-store';

export function createPostgresRequestAcceptanceStore(): RequestAcceptanceStore<DatabaseTransaction> {
  return {
    ...createPostgresRequestStore(),
    async pendingConflicts(tx, requestId, holderPartyId) {
      const { rows } = await sql<{ conflicts: string[] }>`SELECT ARRAY(
        SELECT DISTINCT c.request_id FROM app.luxchange_request_pending_conflicts(r.id) c WHERE r.state = 'pending'
      ) AS conflicts FROM app.luxchange_request r
      WHERE r.id = ${requestId}::uuid AND r.holder_party_id = ${holderPartyId}::uuid`.execute(tx);
      return rows[0]?.conflicts ?? null;
    },
    async closedByCompetingAcceptance(tx, requestId) {
      const { rows } = await sql<{ competed: boolean }>`SELECT EXISTS (
        SELECT 1 FROM app.luxchange_request r
        JOIN app.luxchange_request_transition t ON t.id = r.last_transition_id
        JOIN app.date_custody c ON c.id = t.evidence_id AND c.closed_by_operation = t.operation_id
        JOIN app.luxchange_request_transition w ON w.operation_id = t.operation_id AND w.to_state = 'accepted'
        WHERE r.id = ${requestId}::uuid AND t.reason = 'capacity_unavailable' AND t.evidence_kind = 'custody'
      ) AS competed`.execute(tx);
      return rows[0]!.competed;
    },
    async acceptanceTerms(tx, requestId, expectedCredits) {
      const { rows } = await sql<AcceptanceTerms>`
        SELECT trim_scale(r.credits_required)::text AS required,
               trim_scale(r.complement_credits)::text AS complement,
               trim_scale(r.complement_consumption)::text AS consumption,
               trim_scale(r.complement_excess)::text AS excess,
               app.luxchange_deposit_quantity_matches(r.operation_id, ${expectedCredits}::numeric) AS "holderCreditsMatch"
          FROM app.luxchange_request r WHERE r.id = ${requestId}::uuid`.execute(tx);
      const terms = rows[0]!;
      if (terms.consumption === null || terms.excess === null)
        throw new Error('Missing frozen terms of a sent Request');
      return terms;
    },
    async cessionNights(tx, requestId) {
      const { rows } = await sql<{
        second_home_id: string;
        stay_date: string;
        custody_id: string;
        booking_id: string | null;
        stake_id: string | null;
        complement: boolean;
      }>`SELECT n.second_home_id, n.stay_date::text, n.custody_id, n.booking_id, h.stake_id,
                n.complement_unit_id IS NOT NULL AS complement
           FROM app.luxchange_request_cession_nights(${requestId}::uuid) n JOIN app.holding h ON h.id = n.holding_id
          ORDER BY n.second_home_id, n.stay_date`.execute(tx);
      return rows.map((row) => ({
        secondHomeId: row.second_home_id,
        stayDate: row.stay_date,
        custodyId: row.custody_id,
        bookingId: row.booking_id,
        stakeId: row.stake_id,
        complement: row.complement,
      }));
    },
    async rescan(tx, requestId, lockedRequestIds) {
      // Separate READ COMMITTED statement after the exclusive night locks (ADR-0037 §14.4).
      await sql`SELECT app.luxchange_request_accept_rescan(${requestId}::uuid, ${[...lockedRequestIds]}::uuid[])`.execute(
        tx,
      );
    },
    async lockCustodies(tx, custodyIds) {
      const { rows } = await sql`SELECT c.id FROM app.date_custody c
        WHERE c.id = ANY (${[...custodyIds]}::uuid[]) AND c.closed_at IS NULL
        ORDER BY c.second_home_id, c.stay_date FOR UPDATE`.execute(tx);
      return rows.length === custodyIds.length;
    },
    async recordSnapshotAndRevalidate(tx, requestId, operationId) {
      // The acceptance snapshot contains only the instant. All other versions belong to send_request.
      await sql`INSERT INTO app.economic_snapshot(operation_id, resolved_at)
        VALUES (${operationId}::uuid, clock_timestamp())`.execute(tx);
      const { rows } = await sql<{
        reason: RequestClosureReason | null;
        notice_met: boolean;
        capacity_eligible: boolean;
      }>`
        SELECT (app.luxchange_request_closure_reason(r.id)).reason,
               NOT EXISTS (SELECT 1 FROM app.luxchange_request_complement_night n
                 JOIN app.second_home_date d USING (second_home_id, stay_date)
                 WHERE n.request_id = r.id AND NOT app.luxchange_deposit_notice_met(d.checkin_at, s.resolved_at)) AS notice_met,
               EXISTS (SELECT 1 FROM app.holding h WHERE h.party_id = r.requester_party_id
                 AND h.valid_from <= s.resolved_at AND (h.valid_until IS NULL OR s.resolved_at < h.valid_until))
               AND NOT EXISTS (SELECT 1 FROM app.luxchange_request_night n WHERE n.request_id = r.id
                 AND app.luxchange_complement_effective(n.second_home_id, n.stay_date) IS NOT NULL) AS capacity_eligible
          FROM app.luxchange_request r JOIN app.economic_snapshot s ON s.operation_id = ${operationId}::uuid
         WHERE r.id = ${requestId}::uuid`.execute(tx);
      const row = rows[0]!;
      return {
        reason: row.reason,
        noticeMet: row.notice_met,
        capacityEligible: row.capacity_eligible,
      };
    },
    async insertAcceptance(tx, requestId, operationId) {
      const id = randomUUID();
      await sql`INSERT INTO app.luxchange_request_transition(id, request_id, operation_id, reason)
        VALUES (${id}::uuid, ${requestId}::uuid, ${operationId}::uuid, 'accepted')`.execute(tx);
      return id;
    },
    async openDestination(tx, requestId, operationId) {
      const bookingId = randomUUID();
      await sql`INSERT INTO app.booking(id, second_home_id, channel, party_id, checkin_date, checkout_date, state, opened_by_operation)
        SELECT ${bookingId}::uuid, second_home_id, 'luxchange_request', requester_party_id, checkin, checkout, 'confirmed', ${operationId}::uuid
          FROM app.luxchange_request WHERE id = ${requestId}::uuid`.execute(tx);
      await sql`INSERT INTO app.date_occupancy(id, second_home_id, stay_date, booking_id, channel, custody_id, opened_by_operation)
        SELECT gen_random_uuid(), n.second_home_id, n.stay_date, ${bookingId}::uuid, 'luxchange_request', c.id, ${operationId}::uuid
          FROM app.luxchange_request_night n JOIN app.date_custody c ON c.parent_custody_id = n.custody_id
         WHERE n.request_id = ${requestId}::uuid AND c.opened_by_operation = ${operationId}::uuid
         ORDER BY n.stay_date`.execute(tx);
      return bookingId;
    },
  };
}
