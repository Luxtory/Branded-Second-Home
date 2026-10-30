import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createRootCustodyOpener } from '@/features/inventory';
import { findFormalizedSecondHome, listFormalizedSecondHomes } from '@/features/ownership';
import {
  createProductionExecutor,
  createProductionOperationalAlert,
  getDatabase,
  systemClock,
  systemCommandGuard,
  type Clock,
  type Database,
  type EnvSource,
  type JobRunner,
  type LogPort,
  type OperationalAlert,
} from '@/features/platform';
import { createOpenExerciseHandler } from '../application/open-exercise';
import {
  OPEN_EXERCISE_TIME_BUDGET_MS,
  runOpenExercise,
  type OpenExerciseJobDependencies,
} from '../application/open-exercise-job';
import { civilCalendar } from '../domain/civil-calendar';
import {
  createPostgresSealingStore,
  sealedExercises,
} from '../infrastructure/postgres-sealing-store';
import { temporalCivilTime } from '../infrastructure/temporal-civil-time';

export interface OpenExerciseJobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  readonly alert?: OperationalAlert;
  readonly timeBudgetMs?: number;
}

function dependencies(env: OpenExerciseJobEnvironment): OpenExerciseJobDependencies {
  const db = env.database ?? getDatabase(env.source);
  const clock = env.clock ?? systemClock;
  const calendar = civilCalendar(temporalCivilTime);
  // Ator `system` só passa no guard dos commands de sistema; o executor é o mesmo pipeline do TECH-054.
  const executor = createProductionExecutor({
    guard: systemCommandGuard,
    log: env.log,
    source: env.source,
    database: db,
    clock,
  });
  const handler = createOpenExerciseHandler({
    calendar,
    store: createPostgresSealingStore(),
    findFormalized: findFormalizedSecondHome,
    openRoots: createRootCustodyOpener(),
  });
  return {
    clock,
    calendar,
    listFormalized: () => listFormalizedSecondHomes(db),
    sealedExercises: (ids) => sealedExercises(db, ids),
    execute: (request) => executor.execute(handler, request),
    alert: env.alert ?? createProductionOperationalAlert({ log: env.log, source: env.source }),
    log: env.log,
    timeBudgetMs: env.timeBudgetMs ?? OPEN_EXERCISE_TIME_BUDGET_MS,
    monotonicMs: () => performance.now(),
  };
}

/** Job `open_exercise` com as dependências de produção (cron diário, `after()` da formalização ou disparo manual). */
export function createOpenExerciseJob(env: OpenExerciseJobEnvironment): JobRunner {
  return async (context) => {
    const correlationId = context?.correlationId ?? randomUUID();
    let deps: OpenExerciseJobDependencies;
    try {
      deps = dependencies(env);
    } catch (error) {
      // Falha geral antes de começar (configuração, banco): alerta pelo canal que não depende do banco.
      const alert =
        env.alert ?? createProductionOperationalAlert({ log: env.log, source: env.source });
      await alert.raise({
        kind: 'open_exercise_failure',
        scope: 'run',
        correlationId,
        details: { reason: error instanceof Error ? error.name : 'UnknownError' },
      });
      throw error;
    }
    return runOpenExercise(deps, { correlationId });
  };
}
