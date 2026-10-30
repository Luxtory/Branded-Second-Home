import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { findUseRightFacts } from '@/features/ownership';
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
  CLOSE_EXERCISE_TIME_BUDGET_MS,
  createCloseExerciseHandler,
  runCloseExercise,
} from '../application/close-exercise';
import { createUseRightCalendar } from '../domain/use-right-calendar';
import { createPostgresSealingStore } from '../infrastructure/postgres-sealing-store';
import {
  createPostgresUseRightStore,
  exercisesWithRemaining,
} from '../infrastructure/postgres-use-right-store';
import { temporalCivilTime } from '../infrastructure/temporal-civil-time';

export interface CloseExerciseJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  readonly timeBudgetMs?: number;
}

/** Job `close_exercise` com as dependências de produção (cron diário ou disparo manual pelo runbook). */
export function createCloseExerciseJob(env: CloseExerciseJobEnvironment): JobRunner {
  return async (context) => {
    const correlationId = context?.correlationId ?? randomUUID();
    const db = env.database ?? getDatabase(env.source);
    const clock = env.clock ?? systemClock;
    const calendar = createUseRightCalendar(temporalCivilTime);
    const executor = createProductionExecutor({
      guard: systemCommandGuard,
      log: env.log,
      source: env.source,
      database: db,
      clock,
    });
    const handler = createCloseExerciseHandler({
      useRightCalendar: calendar,
      useRights: createPostgresUseRightStore(),
      lockSecondHome: createPostgresSealingStore().lockSecondHome,
      findUseRightFacts,
    });
    return runCloseExercise(
      {
        clock,
        useRightCalendar: calendar,
        exercisesWithRemaining: () => exercisesWithRemaining(db),
        execute: (request) => executor.execute(handler, request),
        log: env.log,
        timeBudgetMs: env.timeBudgetMs ?? CLOSE_EXERCISE_TIME_BUDGET_MS,
        monotonicMs: () => performance.now(),
      },
      { correlationId },
    );
  };
}
