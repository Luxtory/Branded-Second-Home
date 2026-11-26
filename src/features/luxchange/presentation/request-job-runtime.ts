import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  configuredPaymentGateway,
  createPostgresBillingStore,
  processRefund,
} from '@/features/billing';
import {
  createProductionExecutor,
  getDatabase,
  systemClock,
  systemCommandGuard,
  type JobRunner,
} from '@/features/platform';
import {
  EXPIRE_REQUESTS_BATCH,
  EXPIRE_REQUESTS_TIME_BUDGET_MS,
  runExpireRequests,
  type ClosingCommand,
} from '../application/expire-requests';
import { closableRequests } from '../infrastructure/postgres-request-store';
import { createSystemClosingProductionHandler } from './request-handlers';
import type { ExpireRequestsJobEnvironment } from './request-job';

/**
 * Execução do job `expire_requests` com as dependências de produção. Carregado sob demanda por `request-job.ts`: os
 * slices que o encerramento usa (billing, booking, credits, pricing) não entram no grafo de inicialização do registro de
 * jobs do platform.
 */
export function runExpireRequestsJob(
  env: ExpireRequestsJobEnvironment,
  context: Parameters<JobRunner>[0],
): ReturnType<JobRunner> {
  return (async () => {
    const correlationId = context?.correlationId ?? randomUUID();
    const db = env.database ?? getDatabase(env.source);
    const gateway = env.gateway !== undefined ? env.gateway : configuredPaymentGateway(env.source);
    const executor = createProductionExecutor({
      guard: systemCommandGuard,
      log: env.log,
      source: env.source,
      database: db,
      clock: env.clock ?? systemClock,
    });
    const handlers = {
      expire_requests: createSystemClosingProductionHandler('expire_requests', db),
      close_ineligible_request: createSystemClosingProductionHandler(
        'close_ineligible_request',
        db,
      ),
    } as const;
    const store = createPostgresBillingStore(db);
    return runExpireRequests(
      {
        closable: () => closableRequests(db, EXPIRE_REQUESTS_BATCH),
        execute: (command: ClosingCommand, request) => executor.execute(handlers[command], request),
        processRefund: async (refundId) =>
          gateway === null ? null : processRefund({ store, gateway, log: env.log }, refundId),
        log: env.log,
        timeBudgetMs: env.timeBudgetMs ?? EXPIRE_REQUESTS_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
      },
      { correlationId },
    );
  })();
}
