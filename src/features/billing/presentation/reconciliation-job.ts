import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  createProductionExecutor,
  createProductionOperationalAlert,
  getDatabase,
  loadRuntimeConfig,
  systemClock,
  systemCommandGuard,
  type Clock,
  type Database,
  type EnvSource,
  type JobRunner,
  type LogPort,
} from '@/features/platform';
import {
  RECONCILIATION_TIME_BUDGET_MS,
  createReconcilePaymentHandler,
  runReconciliation,
} from '../application/reconciliation';
import type { PaymentGateway } from '../application/ports';
import { configuredPaymentGateway } from '../infrastructure/payment-gateway';
import { createPostgresBillingStore } from '../infrastructure/postgres-billing-store';

export interface ReconciliationJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly database?: Database;
  readonly gateway?: PaymentGateway | null;
  readonly timeBudgetMs?: number;
}

/**
 * Job `reconciliation` (TECH-090; ADR-0035 §9) com as dependências de produção. Sem gateway configurado não há
 * pagamento a conciliar: no-op (`unconfigured`), sem ler banco nem carência. Com gateway, a carência do runbook é
 * obrigatória (TECH-001).
 */
export function createReconciliationJob(env: ReconciliationJobEnvironment): JobRunner {
  return async (context) => {
    const gateway = env.gateway !== undefined ? env.gateway : configuredPaymentGateway(env.source);
    if (gateway === null) {
      env.log.info('reconciliation skipped', { reason: 'gateway_not_configured' });
      return { unconfigured: 1 };
    }
    const { PAYMENT_OUTCOME_GRACE_SECONDS } = loadRuntimeConfig(
      ['PAYMENT_OUTCOME_GRACE_SECONDS'],
      env.source,
    );
    const correlationId = context?.correlationId ?? randomUUID();
    const db = env.database ?? getDatabase(env.source);
    const clock = env.clock ?? systemClock;
    const store = createPostgresBillingStore(db);
    const executor = createProductionExecutor({
      guard: systemCommandGuard,
      log: env.log,
      source: env.source,
      database: db,
      clock,
    });
    const handler = createReconcilePaymentHandler({ store });
    return runReconciliation(
      {
        store,
        gateway,
        log: env.log,
        alert: createProductionOperationalAlert({ log: env.log, source: env.source }),
        execute: (request) => executor.execute(handler, request),
        graceSeconds: PAYMENT_OUTCOME_GRACE_SECONDS,
        timeBudgetMs: env.timeBudgetMs ?? RECONCILIATION_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
      },
      { correlationId },
    );
  };
}
