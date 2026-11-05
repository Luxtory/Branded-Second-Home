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
import { createAdvanceBookingStatesHandler } from '../application/advance-booking-states';
import { createFlagNoShowCandidatesHandler } from '../application/flag-no-show-candidates';
import {
  LIFECYCLE_JOB_TIME_BUDGET_MS,
  runBookingSweep,
} from '../application/own-use-lifecycle-jobs';
import {
  advanceCandidates,
  createPostgresBookingJobStore,
  noShowCandidates,
} from '../infrastructure/postgres-booking-job-store';
import { createPostgresBookingLifecycleStore } from '../infrastructure/postgres-booking-lifecycle-store';

export interface LifecycleJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  readonly timeBudgetMs?: number;
}

function productionExecutor(env: LifecycleJobEnvironment, database: Database) {
  return createProductionExecutor({
    guard: systemCommandGuard,
    log: env.log,
    source: env.source,
    database,
    clock: env.clock ?? systemClock,
  });
}

const jobDependencies = () => ({
  store: createPostgresBookingLifecycleStore(),
  jobs: createPostgresBookingJobStore(),
});

/** Job `advance_booking_states` com as dependências de produção (cron diário ou disparo manual pelo runbook). */
export function createAdvanceBookingStatesJob(env: LifecycleJobEnvironment): JobRunner {
  return async (context) => {
    const database = env.database ?? getDatabase(env.source);
    const executor = productionExecutor(env, database);
    const handler = createAdvanceBookingStatesHandler(jobDependencies());
    return runBookingSweep(
      {
        job: 'advance_booking_states',
        candidates: () => advanceCandidates(database),
        execute: (request) => executor.execute(handler, request),
        log: env.log,
        timeBudgetMs: env.timeBudgetMs ?? LIFECYCLE_JOB_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
        extra: { keys: ['transitions'], of: (result) => ({ transitions: result.transitions }) },
      },
      { correlationId: context?.correlationId ?? randomUUID() },
    );
  };
}

/**
 * Job `flag_no_show_candidates` com as dependências de produção (cron 2×/dia, horas 05 e 17 UTC, ou disparo manual). O
 * registro não se recupera depois do check-out: candidatas mais próximas do fim da janela primeiro.
 */
export function createFlagNoShowCandidatesJob(env: LifecycleJobEnvironment): JobRunner {
  return async (context) => {
    const database = env.database ?? getDatabase(env.source);
    const executor = productionExecutor(env, database);
    const handler = createFlagNoShowCandidatesHandler(jobDependencies());
    return runBookingSweep(
      {
        job: 'flag_no_show_candidates',
        candidates: () => noShowCandidates(database),
        execute: (request) => executor.execute(handler, request),
        log: env.log,
        timeBudgetMs: env.timeBudgetMs ?? LIFECYCLE_JOB_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
      },
      { correlationId: context?.correlationId ?? randomUUID() },
    );
  };
}
