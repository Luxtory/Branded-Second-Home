import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  CapabilityNotActivatedError,
  refusedPrivilege,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  advancePayment,
  advanceRefund,
  type PaymentPurpose,
  type PaymentState,
  type RefundState,
} from '../domain/payment';
import type { SettlementKind } from '../domain/settlement';
import type {
  BillingStore,
  GatewayEvent,
  LockedPayment,
  PaymentRecord,
  RefundRecord,
} from '../application/ports';

interface PaymentRow {
  readonly id: string;
  readonly payer_party_id: string;
  readonly created_by_user_id: string;
  readonly purpose: PaymentPurpose;
  readonly amount_minor: string;
  readonly currency: string;
  readonly provider: string;
  readonly provider_payment_id: string | null;
  readonly request_hash: string;
  readonly state: PaymentState;
}

interface RefundRow {
  readonly id: string;
  readonly payment_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly state: RefundState;
  readonly provider: string;
  readonly provider_payment_id: string;
}

const PAYMENT_COLUMNS =
  sql.raw(`p.id, p.payer_party_id, p.created_by_user_id, p.purpose, p.amount_minor::text AS amount_minor,
  p.currency, p.provider, p.provider_payment_id, p.request_hash, p.state`);
const REFUND_COLUMNS =
  sql.raw(`r.id, r.payment_id, r.amount_minor::text AS amount_minor, r.currency, r.state, p.provider,
  p.provider_payment_id`);

const toPayment = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  payerPartyId: row.payer_party_id,
  createdByUserId: row.created_by_user_id,
  purpose: row.purpose,
  amountMinor: BigInt(row.amount_minor),
  currency: row.currency,
  provider: row.provider,
  providerPaymentId: row.provider_payment_id,
  requestHash: row.request_hash,
  state: row.state,
});

const toRefund = (row: RefundRow): RefundRecord => ({
  id: row.id,
  paymentId: row.payment_id,
  amountMinor: BigInt(row.amount_minor),
  currency: row.currency,
  state: row.state,
  provider: row.provider,
  providerPaymentId: row.provider_payment_id,
});

/** K5 fechada no banco (`payments_not_activated`): funcionalidade fechada, não falha (ADR-0035 §8). */
function closedCapability(error: unknown): never {
  if (refusedPrivilege(error) === 'payments_not_activated')
    throw new CapabilityNotActivatedError('payments');
  throw error;
}

// Evento já registrado por outra transação: desfaz a corrente e responde `duplicate`.
class DuplicateEvent extends Error {}

/**
 * Billing no PostgreSQL (ADR-0035). Toda transição de pagamento ou estorno trava a linha (`FOR UPDATE`) antes de decidir;
 * o banco repete as regras nos gatilhos. Instantes sempre do relógio do banco.
 */
export function createPostgresBillingStore(db: Database): BillingStore<DatabaseTransaction> {
  async function own<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    try {
      return await db.transaction().execute(work);
    } catch (error) {
      return closedCapability(error);
    }
  }

  async function paymentById(tx: Database | DatabaseTransaction, id: string, lock: boolean) {
    const { rows } =
      await sql<PaymentRow>`SELECT ${PAYMENT_COLUMNS} FROM app.payment p WHERE p.id = ${id}::uuid
      ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx);
    return rows[0] === undefined ? null : toPayment(rows[0]);
  }

  async function refundById(tx: Database | DatabaseTransaction, id: string, lock: boolean) {
    const { rows } = await sql<RefundRow>`SELECT ${REFUND_COLUMNS}
      FROM app.refund r JOIN app.payment p ON p.id = r.payment_id WHERE r.id = ${id}::uuid
      ${lock ? sql`FOR UPDATE OF r` : sql``}`.execute(tx);
    return rows[0] === undefined ? null : toRefund(rows[0]);
  }

  async function setPayment(
    tx: DatabaseTransaction,
    id: string,
    state: PaymentState,
    reference: string | null,
  ) {
    await sql`UPDATE app.payment SET state = ${state}, provider_payment_id = coalesce(provider_payment_id, ${reference})
              WHERE id = ${id}::uuid`.execute(tx);
  }

  async function setRefund(
    tx: DatabaseTransaction,
    id: string,
    state: RefundState,
    reference: string | null,
  ) {
    await sql`UPDATE app.refund SET state = ${state}, provider_refund_id = coalesce(provider_refund_id, ${reference})
              WHERE id = ${id}::uuid`.execute(tx);
  }

  /** Aplica um evento autenticado sob a trava do objeto; devolve o resultado e o objeto resolvido. */
  async function applyEvent(tx: DatabaseTransaction, provider: string, event: GatewayEvent) {
    if ('providerPaymentId' in event) {
      const { rows } = await sql<{ id: string }>`SELECT id FROM app.payment
        WHERE provider = ${provider} AND provider_payment_id = ${event.providerPaymentId} FOR UPDATE`.execute(
        tx,
      );
      const payment = rows[0] === undefined ? null : await paymentById(tx, rows[0].id, false);
      if (payment === null)
        return { outcome: 'unknown_object' as const, paymentId: null, refundId: null };
      const transition = advancePayment(
        payment.state,
        event.type === 'payment.approved' ? 'approved' : 'failed',
      );
      if (transition.kind === 'advance') await setPayment(tx, payment.id, transition.to, null);
      const outcome = transition.kind === 'advance' ? ('applied' as const) : ('no_change' as const);
      return { outcome, paymentId: payment.id, refundId: null };
    }
    const refund = /^[0-9a-f-]{36}$/.test(event.refundId)
      ? await refundById(tx, event.refundId, true)
      : null;
    if (refund === null || refund.provider !== provider)
      return { outcome: 'unknown_object' as const, paymentId: null, refundId: null };
    const transition = advanceRefund(
      refund.state,
      event.type === 'refund.succeeded' ? 'succeeded' : 'failed',
    );
    if (transition.kind === 'advance')
      await setRefund(tx, refund.id, transition.to, event.providerRefundId);
    const outcome = transition.kind === 'advance' ? ('applied' as const) : ('no_change' as const);
    return { outcome, paymentId: refund.paymentId, refundId: refund.id };
  }

  return {
    async openPayment(draft) {
      return own(async (tx) => {
        await sql`INSERT INTO app.payment (id, payer_party_id, created_by_user_id, purpose, amount_minor, currency,
                    provider, idempotency_key, request_hash, state)
                  VALUES (${draft.id}::uuid, ${draft.payerPartyId}::uuid, ${draft.createdByUserId}::uuid,
                    ${draft.purpose}, ${draft.amountMinor.toString()}::bigint, ${draft.currency}, ${draft.provider},
                    ${draft.idempotencyKey}, ${draft.requestHash}, 'pending')
                  ON CONFLICT ON CONSTRAINT billing_payment_idempotency DO NOTHING`.execute(tx);
        const { rows } = await sql<PaymentRow>`SELECT ${PAYMENT_COLUMNS} FROM app.payment p
          WHERE p.created_by_user_id = ${draft.createdByUserId}::uuid
            AND p.idempotency_key = ${draft.idempotencyKey}`.execute(tx);
        return toPayment(rows[0]!);
      });
    },

    findPayment: (id) => paymentById(db, id, false),

    async updatePayment(id, decide) {
      return own(async (tx) => {
        const before = await paymentById(tx, id, true);
        if (before === null) return null;
        const update = decide(before);
        if (update === null) return { before, changed: false };
        await setPayment(tx, id, update.state ?? before.state, update.providerPaymentId ?? null);
        return { before, changed: true };
      });
    },

    findRefund: (id) => refundById(db, id, false),

    async updateRefund(id, decide) {
      return own(async (tx) => {
        const before = await refundById(tx, id, true);
        if (before === null) return null;
        const update = decide(before);
        if (update === null) return { before, changed: false };
        await setRefund(tx, id, update.state ?? before.state, update.providerRefundId ?? null);
        return { before, changed: true };
      });
    },

    async recordWebhook({ provider, event, payloadSha256 }) {
      const { rows: seen } = await sql`SELECT 1 FROM app.webhook_inbox
        WHERE provider = ${provider} AND event_id = ${event.eventId}`.execute(db);
      if (seen.length > 0) return 'duplicate';
      try {
        return await own(async (tx) => {
          const applied = await applyEvent(tx, provider, event);
          const { rows } =
            await sql`INSERT INTO app.webhook_inbox (id, provider, event_id, event_type, payload_sha256,
              payment_id, refund_id, outcome)
            VALUES (${randomUUID()}::uuid, ${provider}, ${event.eventId}, ${event.type}, ${payloadSha256},
              ${applied.paymentId}::uuid, ${applied.refundId}::uuid, ${applied.outcome})
            ON CONFLICT ON CONSTRAINT webhook_inbox_event_unique DO NOTHING RETURNING id`.execute(
              tx,
            );
          if (rows.length === 0) throw new DuplicateEvent();
          return applied.outcome;
        });
      } catch (error) {
        if (error instanceof DuplicateEvent) return 'duplicate';
        throw error;
      }
    },

    async lockPayment(tx, id) {
      const payment = await paymentById(tx, id, true);
      if (payment === null) return null;
      const { rows: fees } = await sql<{ id: string; reversed: boolean; settled: boolean }>`
        SELECT f.id,
               EXISTS (SELECT 1 FROM app.fee_charge_reversal r WHERE r.fee_charge_id = f.id) AS reversed,
               EXISTS (SELECT 1 FROM app.settlement s WHERE s.fee_charge_id = f.id) AS settled
          FROM app.fee_charge f WHERE f.payment_id = ${id}::uuid`.execute(tx);
      const { rows: refunds } = await sql<{ state: RefundState; amount_minor: string }>`
        SELECT state, amount_minor::text AS amount_minor FROM app.refund
         WHERE payment_id = ${id}::uuid ORDER BY created_at, id`.execute(tx);
      const locked: LockedPayment = {
        ...payment,
        feeCharge: fees[0] ?? null,
        refunds: refunds.map((row) => ({
          state: row.state,
          amountMinor: BigInt(row.amount_minor),
        })),
      };
      return locked;
    },

    async insertFeeCharge(tx, row) {
      const id = randomUUID();
      await sql`INSERT INTO app.fee_charge (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor,
                  currency)
                VALUES (${id}::uuid, ${row.operationId}::uuid, ${row.paymentId}::uuid, ${row.payerPartyId}::uuid,
                  ${row.prlTotalMinor.toString()}::bigint, ${row.amountMinor.toString()}::bigint, ${row.currency})`.execute(
        tx,
      );
      return id;
    },

    async findFeeCharge(tx, id) {
      const { rows } = await sql<{
        id: string;
        payment_id: string;
        operation_id: string;
        amount_minor: string;
        currency: string;
      }>`SELECT id, payment_id, operation_id, amount_minor::text AS amount_minor, currency
           FROM app.fee_charge WHERE id = ${id}::uuid`.execute(tx);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            paymentId: row.payment_id,
            operationId: row.operation_id,
            amountMinor: BigInt(row.amount_minor),
            currency: row.currency,
          };
    },

    async insertFeeReversal(tx, feeChargeId, operationId) {
      await sql`INSERT INTO app.fee_charge_reversal (fee_charge_id, operation_id)
                VALUES (${feeChargeId}::uuid, ${operationId}::uuid)`.execute(tx);
    },

    async insertRefund(tx, row) {
      const id = randomUUID();
      await sql`INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
                VALUES (${id}::uuid, ${row.paymentId}::uuid, ${row.operationId}::uuid,
                  ${row.amountMinor.toString()}::bigint, ${row.currency}, 'pending')`.execute(tx);
      return id;
    },

    async insertSettlement(tx, row) {
      const id = randomUUID();
      await sql`INSERT INTO app.settlement (id, operation_id, kind, beneficiary_party_id, amount_minor, currency,
                  fee_charge_id)
                VALUES (${id}::uuid, ${row.operationId}::uuid, ${row.kind}, ${row.beneficiaryPartyId}::uuid,
                  ${row.amountMinor.toString()}::bigint, ${row.currency}, ${row.feeChargeId}::uuid)`.execute(
        tx,
      );
      return id;
    },

    async stalePendingPayments(graceSeconds) {
      const { rows } = await sql<{ id: string }>`SELECT id FROM app.payment
        WHERE state = 'pending' AND created_at < clock_timestamp() - make_interval(secs => ${graceSeconds})
        ORDER BY created_at, id`.execute(db);
      return rows.map((row) => row.id);
    },

    async paymentsNeedingRefund(graceSeconds) {
      const { rows } = await sql<{ id: string }>`SELECT p.id FROM app.payment p
        LEFT JOIN app.fee_charge f ON f.payment_id = p.id
        WHERE p.state = 'approved'
          AND (f.id IS NULL OR EXISTS (SELECT 1 FROM app.fee_charge_reversal r WHERE r.fee_charge_id = f.id))
          AND p.amount_minor > coalesce((SELECT sum(x.amount_minor) FROM app.refund x
                                          WHERE x.payment_id = p.id AND x.state <> 'failed'), 0)
          AND p.resolved_at < clock_timestamp() - make_interval(secs => ${graceSeconds})
        ORDER BY p.created_at, p.id`.execute(db);
      return rows.map((row) => row.id);
    },

    async pendingRefunds() {
      const { rows } = await sql<{ id: string }>`SELECT id FROM app.refund WHERE state = 'pending'
        ORDER BY created_at, id`.execute(db);
      return rows.map((row) => row.id);
    },

    async settlementTotals() {
      const { rows } = await sql<{
        kind: SettlementKind;
        currency: string;
        entries: string;
        amount: string;
      }>`
        SELECT kind, currency, count(*)::text AS entries, sum(amount_minor)::text AS amount
          FROM app.settlement GROUP BY kind, currency ORDER BY kind, currency`.execute(db);
      return rows.map((row) => ({
        kind: row.kind,
        currency: row.currency,
        entries: Number(row.entries),
        amountMinor: BigInt(row.amount),
      }));
    },

    async reconciliationSummary(graceSeconds) {
      const grace = graceSeconds ?? 0;
      const { rows } = await sql<{
        pending_payments: string;
        approved_without_outcome: string;
        pending_refunds: string;
        failed_refunds_without_retry: string;
      }>`SELECT
          (SELECT count(*) FROM app.payment WHERE state = 'pending')::text AS pending_payments,
          (SELECT count(*) FROM app.payment p
             WHERE p.state = 'approved'
               AND NOT EXISTS (SELECT 1 FROM app.fee_charge f WHERE f.payment_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM app.refund r WHERE r.payment_id = p.id AND r.state <> 'failed')
               AND p.resolved_at < clock_timestamp() - make_interval(secs => ${grace}))::text AS approved_without_outcome,
          (SELECT count(*) FROM app.refund WHERE state = 'pending')::text AS pending_refunds,
          (SELECT count(*) FROM app.payment p
             WHERE EXISTS (SELECT 1 FROM app.refund r WHERE r.payment_id = p.id AND r.state = 'failed')
               AND NOT EXISTS (SELECT 1 FROM app.refund r WHERE r.payment_id = p.id AND r.state <> 'failed'))::text
            AS failed_refunds_without_retry`.execute(db);
      const row = rows[0]!;
      return {
        pendingPayments: Number(row.pending_payments),
        approvedWithoutOutcome: Number(row.approved_without_outcome),
        pendingRefunds: Number(row.pending_refunds),
        failedRefundsWithoutRetry: Number(row.failed_refunds_without_retry),
      };
    },
  };
}
