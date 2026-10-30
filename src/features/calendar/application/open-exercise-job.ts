import type {
  Clock,
  CommandOutcome,
  CommandRequest,
  JsonObject,
  LogPort,
  OperationalAlert,
} from '@/features/platform';
import type { CivilCalendar } from '../domain/civil-calendar';
import type { OpenExerciseResult, SealingTarget } from './open-exercise';

/** Orçamento de uma execução, abaixo dos 300 s de duração máxima da função (Vercel Hobby, Fluid compute). */
export const OPEN_EXERCISE_TIME_BUDGET_MS = 240_000;

const SYSTEM_ACTOR = { kind: 'system', job: 'open_exercise' } as const;

export interface OpenExerciseItem {
  readonly secondHomeId: string;
  readonly exerciseYear: number;
}

export interface OpenExerciseJobDependencies {
  readonly clock: Clock;
  readonly calendar: CivilCalendar;
  readonly listFormalized: () => Promise<readonly SealingTarget[]>;
  /** Exercícios já selados das Second Homes, como `<id>:<ano>`. */
  readonly sealedExercises: (secondHomeIds: readonly string[]) => Promise<ReadonlySet<string>>;
  readonly execute: (request: CommandRequest) => Promise<CommandOutcome<OpenExerciseResult>>;
  readonly alert: OperationalAlert;
  readonly log: LogPort;
  readonly timeBudgetMs: number;
  /** Relógio monotônico da execução (ms), só para o orçamento. */
  readonly monotonicMs: () => number;
}

interface Failure extends JsonObject {
  readonly second_home_id: string;
  readonly exercise_year: number | null;
  readonly reason: string;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Exercícios devidos: o corrente e o seguinte pela data local de cada Second Home (TECH-040), a partir do ano da
 * data-base — a posição 1 abre em 15/09 do ano anterior (TECH-042). Corrente primeiro (mais urgente).
 */
export function exercisesDue(
  homes: readonly SealingTarget[],
  now: Date,
  calendar: CivilCalendar,
): { readonly due: readonly OpenExerciseItem[]; readonly failures: readonly Failure[] } {
  const due: OpenExerciseItem[] = [];
  const failures: Failure[] = [];
  for (const home of homes) {
    try {
      const current = calendar.exerciseYear(calendar.localDate(now, home.timezone));
      const start = calendar.exerciseYear(home.operationStartDate);
      for (const exerciseYear of [current, current + 1]) {
        if (exerciseYear >= start) due.push({ secondHomeId: home.secondHomeId, exerciseYear });
      }
    } catch (error) {
      failures.push({
        second_home_id: home.secondHomeId,
        exercise_year: null,
        reason: errorName(error),
      });
    }
  }
  due.sort(
    (a, b) =>
      a.exerciseYear - b.exerciseYear ||
      (a.secondHomeId < b.secondHomeId ? -1 : a.secondHomeId > b.secondHomeId ? 1 : 0),
  );
  return { due, failures };
}

/**
 * Chave por execução (ADR-0024 §4): o executor grava recusas na idempotência, então a chave nunca é reaproveitada
 * entre execuções — a seguinte retenta sozinha depois de uma correção. A selagem única vem do estado do banco.
 */
export function openExerciseKey(item: OpenExerciseItem, correlationId: string): string {
  return `open_exercise:${item.secondHomeId}:${item.exerciseYear}:${correlationId}`;
}

async function sealDue(
  deps: OpenExerciseJobDependencies,
  pending: readonly OpenExerciseItem[],
  correlationId: string,
  started: number,
) {
  const counts = { sealed: 0, already_sealed: 0, deferred: 0 };
  const failures: Failure[] = [];
  for (const [index, item] of pending.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = pending.length - index;
      break;
    }
    const fields = { second_home_id: item.secondHomeId, exercise_year: item.exerciseYear };
    try {
      const outcome = await deps.execute({
        actor: SYSTEM_ACTOR,
        idempotencyKey: openExerciseKey(item, correlationId),
        correlationId,
        input: { second_home_id: item.secondHomeId, exercise_year: item.exerciseYear },
      });
      if (outcome.status === 'committed' && !outcome.replayed) counts.sealed += 1;
      else if (outcome.status === 'committed' || outcome.code === 'ERR_STATE_TRANSITION')
        counts.already_sealed += 1;
      else failures.push({ ...fields, reason: outcome.code });
    } catch (error) {
      failures.push({ ...fields, reason: errorName(error) });
    }
  }
  return { counts, failures };
}

/**
 * Job `open_exercise` (TECH-090): idempotente por item e retomável — cada exercício é selado numa transação própria;
 * queda, timeout ou orçamento esgotado deixam o restante para a próxima execução. Falha de item ou da execução →
 * alerta `open_exercise_failure` (TECH-101), fora do outbox.
 */
export async function runOpenExercise(
  deps: OpenExerciseJobDependencies,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  try {
    const homes = await deps.listFormalized();
    const { due, failures: calendarFailures } = exercisesDue(
      homes,
      deps.clock.now(),
      deps.calendar,
    );
    const sealed = await deps.sealedExercises([...new Set(due.map((item) => item.secondHomeId))]);
    const pending = due.filter((item) => !sealed.has(`${item.secondHomeId}:${item.exerciseYear}`));
    const { counts, failures } = await sealDue(deps, pending, correlationId, started);
    const allFailures = [...calendarFailures, ...failures];
    if (counts.deferred > 0)
      deps.log.warn('open_exercise budget exhausted', { deferred: counts.deferred });
    if (allFailures.length > 0) {
      await deps.alert.raise({
        kind: 'open_exercise_failure',
        scope: 'item',
        correlationId,
        details: { failed: allFailures.length, items: allFailures },
      });
    }
    return {
      formalized: homes.length,
      due: due.length,
      sealed: counts.sealed,
      already_sealed: due.length - pending.length + counts.already_sealed,
      failed: allFailures.length,
      deferred: counts.deferred,
    };
  } catch (error) {
    await deps.alert.raise({
      kind: 'open_exercise_failure',
      scope: 'run',
      correlationId,
      details: { reason: errorName(error) },
    });
    throw error;
  }
}
