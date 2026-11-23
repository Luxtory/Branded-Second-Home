import { z } from 'zod';
import {
  CommandRejection,
  type CommandHandler,
  type CommandOutcome,
  type CommandRequest,
  type LogPort,
  type OperationalAlert,
} from '@/features/platform';
import { refundableMinor } from '../domain/payment';
import type { FeeDependencies } from './fee';
import { refreshPayment } from './payments';
import type { BillingStore, PaymentGateway } from './ports';
import { processRefund } from './refunds';

export const reconcilePaymentInput = z.strictObject({ payment_id: z.uuid() });
export type ReconcilePaymentInput = z.infer<typeof reconcilePaymentInput>;
export type ReconcilePaymentResult = {
  readonly payment_id: string;
  readonly refund_id: string;
  readonly amount_minor: string;
};

/**
 * Command de sistema `reconciliation` (TECH-090, TECH-101; ADR-0035 §9): registra o estorno de um pagamento aprovado
 * que ficou sem desfecho (nenhum Fee vinculado) ou cujo estorno da reversão falhou. Revalida sob a trava do pagamento
 * (classe 8): vinculado sem reversão, sem saldo estornável ou não aprovado → `ERR_STATE_TRANSITION`.
 */
export function createReconcilePaymentHandler<Tx>(
  deps: FeeDependencies<Tx>,
): CommandHandler<ReconcilePaymentInput, ReconcilePaymentResult, Tx> {
  return {
    command: 'reconciliation',
    input: reconcilePaymentInput,
    async execute({ input, tx, locks, operationId, audit }) {
      locks.claim('payment', [input.payment_id]);
      const payment = await deps.store.lockPayment(tx, input.payment_id);
      if (payment === null) throw new CommandRejection('ERR_NOT_FOUND');
      const unbound = payment.feeCharge === null || payment.feeCharge.reversed;
      const remaining = refundableMinor(payment.amountMinor, payment.refunds);
      if (payment.state !== 'approved' || !unbound || remaining < 1n)
        throw new CommandRejection('ERR_STATE_TRANSITION');
      const refundId = await deps.store.insertRefund(tx, {
        paymentId: payment.id,
        operationId,
        amountMinor: remaining,
        currency: payment.currency,
      });
      audit({
        objectType: 'payment',
        objectId: payment.id,
        before: null,
        after: {
          refund_id: refundId,
          amount_minor: remaining.toString(),
          reason: payment.feeCharge === null ? 'without_outcome' : 'fee_reversal_retry',
        },
      });
      return { payment_id: payment.id, refund_id: refundId, amount_minor: remaining.toString() };
    },
  };
}

const SYSTEM_ACTOR = { kind: 'system', job: 'reconciliation' } as const;
export const reconciliationKey = (paymentId: string, correlationId: string) =>
  `reconciliation:refund:${paymentId}:${correlationId}`;

export interface ReconcileDependencies<Tx> {
  readonly store: BillingStore<Tx>;
  readonly gateway: PaymentGateway;
  readonly log: LogPort;
  readonly execute: (request: CommandRequest) => Promise<CommandOutcome<ReconcilePaymentResult>>;
}

/**
 * Estorna um pagamento aprovado sem desfecho: o mesmo command do job, disparado também pelo fluxo logo após a recusa do
 * domínio (TECH-080 etapa 6). Devolve o estorno executado no PSP, ou `null` quando nada havia a estornar.
 */
export async function reconcilePayment<Tx>(
  deps: ReconcileDependencies<Tx>,
  paymentId: string,
  correlationId: string,
): Promise<{ readonly refundId: string; readonly state: string | null } | null> {
  const outcome = await deps.execute({
    actor: SYSTEM_ACTOR,
    idempotencyKey: reconciliationKey(paymentId, correlationId),
    correlationId,
    input: { payment_id: paymentId },
  });
  if (outcome.status !== 'committed') return null;
  const refundId = outcome.result.refund_id;
  return { refundId, state: await processRefund(deps, refundId) };
}

/** Orçamento de uma execução, abaixo dos 300 s da função (o mesmo dos demais jobs). */
export const RECONCILIATION_TIME_BUDGET_MS = 240_000;

export interface ReconciliationJobDependencies<Tx> extends ReconcileDependencies<Tx> {
  readonly alert: OperationalAlert;
  readonly graceSeconds: number;
  readonly timeBudgetMs: number;
  readonly monotonicMs: () => number;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Job `reconciliation` (TECH-090, TECH-101): (1) pendentes além da carência → PSP; (2) aprovados sem desfecho ou com
 * estorno falho → alerta `payment_without_outcome` + estorno; (3) estornos pendentes → PSP, falha → alerta. Item a item,
 * idempotente e retomável; nunca é a única proteção (o banco recusa vínculo e estorno indevidos).
 */
export async function runReconciliation<Tx>(
  deps: ReconciliationJobDependencies<Tx>,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  const counts = {
    confirmed: 0,
    still_pending: 0,
    refunds_opened: 0,
    refunds_succeeded: 0,
    refunds_failed: 0,
    alerts: 0,
    failed: 0,
    deferred: 0,
  };
  const outOfTime = () => deps.monotonicMs() - started >= deps.timeBudgetMs;
  const raise = async (details: Record<string, string>) => {
    counts.alerts += 1;
    await deps.alert.raise({
      kind: 'payment_without_outcome',
      correlationId,
      scope: 'item',
      details,
    });
  };
  const item = async (name: string, id: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      counts.failed += 1;
      deps.log.error(`reconciliation ${name} failed`, {
        object_id: id,
        reason: errorName(error),
        correlation_id: correlationId,
      });
    }
  };

  const stages: readonly [
    string,
    () => Promise<readonly string[]>,
    (id: string) => Promise<void>,
  ][] = [
    [
      'payment',
      () => deps.store.stalePendingPayments(deps.graceSeconds),
      async (id) => {
        const payment = await refreshPayment(deps, id);
        if (payment?.state === 'pending') counts.still_pending += 1;
        else counts.confirmed += 1;
      },
    ],
    [
      'outcome',
      () => deps.store.paymentsNeedingRefund(deps.graceSeconds),
      async (id) => {
        await raise({ payment_id: id, reason: 'without_outcome' });
        const outcome = await deps.execute({
          actor: SYSTEM_ACTOR,
          idempotencyKey: reconciliationKey(id, correlationId),
          correlationId,
          input: { payment_id: id },
        });
        if (outcome.status === 'committed' && !outcome.replayed) counts.refunds_opened += 1;
      },
    ],
    [
      'refund',
      () => deps.store.pendingRefunds(),
      async (id) => {
        const state = await processRefund(deps, id);
        if (state === 'succeeded') counts.refunds_succeeded += 1;
        if (state === 'failed') {
          counts.refunds_failed += 1;
          await raise({ refund_id: id, reason: 'refund_failed' });
        }
      },
    ],
  ];
  for (const [name, list, work] of stages) {
    const ids = await list();
    for (const [index, id] of ids.entries()) {
      if (outOfTime()) {
        counts.deferred += ids.length - index;
        break;
      }
      await item(name, id, () => work(id));
    }
  }
  if (counts.deferred > 0)
    deps.log.warn('reconciliation budget exhausted', { deferred: counts.deferred });
  return counts;
}
