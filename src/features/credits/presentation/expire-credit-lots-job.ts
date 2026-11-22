import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  createProductionExecutor,
  getDatabase,
  systemClock,
  systemCommandGuard,
  type Clock,
  type Database,
  type EnvSource,
  type JobRunner,
  type LogPort,
} from '@/features/platform';
import {
  EXPIRE_CREDIT_LOTS_TIME_BUDGET_MS,
  createExpireCreditLotHandler,
  runExpireCreditLots,
} from '../application/expire-credit-lots';
import { dueCreditLots } from '../infrastructure/due-credit-lots';
import { createPostgresCreditStore } from '../infrastructure/postgres-credit-store';

export interface ExpireCreditLotsJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  readonly timeBudgetMs?: number;
}

/** Job `expire_credit_lots` com as dependências de produção (cron diário ou disparo manual pelo runbook). */
export function createExpireCreditLotsJob(env: ExpireCreditLotsJobEnvironment): JobRunner {
  return async (context) => {
    const correlationId = context?.correlationId ?? randomUUID();
    const db = env.database ?? getDatabase(env.source);
    const executor = createProductionExecutor({
      guard: systemCommandGuard,
      log: env.log,
      source: env.source,
      database: db,
      clock: env.clock ?? systemClock,
    });
    const handler = createExpireCreditLotHandler({ store: createPostgresCreditStore() });
    return runExpireCreditLots(
      {
        dueLots: () => dueCreditLots(db),
        execute: (request) => executor.execute(handler, request),
        log: env.log,
        timeBudgetMs: env.timeBudgetMs ?? EXPIRE_CREDIT_LOTS_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
      },
      { correlationId },
    );
  };
}
