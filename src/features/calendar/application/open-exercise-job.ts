import type {
  Clock,
  CommandOutcome,
  CommandRequest,
  JsonObject,
  LogPort,
  OperationalAlert,
} from '@/features/platform';
import type { CivilCalendar } from '../domain/civil-calendar';
import { isLeapYear } from '../domain/use-right';
import type { UseRightCalendar } from '../domain/use-right-calendar';
import type { OpenExerciseResult, OpenExerciseStep, SealingTarget } from './open-exercise';

/** Orçamento de uma execução, abaixo dos 300 s de duração máxima da função (Vercel Hobby, Fluid compute). */
export const OPEN_EXERCISE_TIME_BUDGET_MS = 240_000;

const SYSTEM_ACTOR = { kind: 'system', job: 'open_exercise' } as const;

export interface OpenExerciseItem {
  readonly secondHomeId: string;
  readonly exerciseYear: number;
}

/** Estado do 29/02 de um exercício devido (W11): noite selada, concessão feita e sorteio revelado. */
export interface LeapDayState extends OpenExerciseItem {
  readonly timezone: string;
  readonly nightSealed: boolean;
  readonly granted: boolean;
  readonly drawRevealed: boolean;
}

export interface OpenExerciseJobDependencies {
  readonly clock: Clock;
  readonly calendar: CivilCalendar;
  readonly useRightCalendar: UseRightCalendar;
  readonly listFormalized: () => Promise<readonly SealingTarget[]>;
  /** Exercícios já selados das Second Homes, como `<id>:<ano>`. */
  readonly sealedExercises: (secondHomeIds: readonly string[]) => Promise<ReadonlySet<string>>;
  /** Lido depois da selagem: o passo `leap_day` também é descoberto em exercício selado em execução anterior. */
  readonly leapDayStates: (items: readonly OpenExerciseItem[]) => Promise<readonly LeapDayState[]>;
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
 * Chave por execução e por passo (ADR-0024 §4, W11): o executor grava recusas na idempotência, então a chave nunca é
 * reaproveitada entre execuções — a seguinte retenta sozinha depois de uma correção. A selagem mantém o formato da W10.
 */
export function openExerciseKey(
  item: OpenExerciseItem,
  correlationId: string,
  step: OpenExerciseStep = 'seal',
): string {
  const base = `open_exercise:${item.secondHomeId}:${item.exerciseYear}`;
  return step === 'seal' ? `${base}:${correlationId}` : `${base}:${step}:${correlationId}`;
}

/**
 * Exercícios devidos com 29/02 da operação (Co-Owner, ano bissexto, 29/02 na data-base ou depois). Só candidatos: o
 * handler e o banco decidem pelos fatos.
 */
function leapDayCandidates(
  homes: readonly SealingTarget[],
  due: readonly OpenExerciseItem[],
): readonly OpenExerciseItem[] {
  const byId = new Map(homes.map((home) => [home.secondHomeId, home]));
  return due.filter((item) => {
    const home = byId.get(item.secondHomeId);
    if (home?.modality !== 'co_owner' || !isLeapYear(item.exerciseYear)) return false;
    return `${String(item.exerciseYear).padStart(4, '0')}-02-29` >= home.operationStartDate;
  });
}

interface StepCounts {
  done: number;
  notApplicable: number;
  deferred: number;
}

async function runStep(
  deps: OpenExerciseJobDependencies,
  step: OpenExerciseStep,
  pending: readonly OpenExerciseItem[],
  correlationId: string,
  started: number,
  failures: Failure[],
): Promise<StepCounts> {
  const counts = { done: 0, notApplicable: 0, deferred: 0 };
  for (const [index, item] of pending.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = pending.length - index;
      break;
    }
    const fields = { second_home_id: item.secondHomeId, exercise_year: item.exerciseYear };
    try {
      const outcome = await deps.execute({
        actor: SYSTEM_ACTOR,
        idempotencyKey: openExerciseKey(item, correlationId, step),
        correlationId,
        input: { second_home_id: item.secondHomeId, exercise_year: item.exerciseYear, step },
      });
      if (outcome.status === 'committed' && !outcome.replayed) counts.done += 1;
      else if (outcome.status === 'committed' || outcome.code === 'ERR_STATE_TRANSITION')
        counts.notApplicable += 1;
      else failures.push({ ...fields, reason: outcome.code });
    } catch (error) {
      failures.push({ ...fields, reason: errorName(error) });
    }
  }
  return counts;
}

/**
 * 29/02 a conceder agora: noite selada, sorteio revelado e ainda sem concessão. Depois do fim efetivo o direito venceu
 * sem concessão retroativa (D5) e a lista bissexta avança pelo calendário. `leap_day_lapsed` é só sinal operacional, no
 * horizonte do job (exercício corrente e seguinte); o vencimento sem concessão de qualquer exercício é reconstruível dos
 * fatos (consulta do runbook), não depende deste log.
 */
function leapDaysToGrant(
  deps: OpenExerciseJobDependencies,
  states: readonly LeapDayState[],
  now: Date,
): { readonly pending: readonly OpenExerciseItem[]; readonly lapsed: readonly OpenExerciseItem[] } {
  const pending: OpenExerciseItem[] = [];
  const lapsed: OpenExerciseItem[] = [];
  for (const state of states) {
    if (!state.nightSealed || state.granted || !state.drawRevealed) continue;
    const item = { secondHomeId: state.secondHomeId, exerciseYear: state.exerciseYear };
    const end = deps.useRightCalendar.effectiveEnd('leap', state.exerciseYear, state.timezone);
    (now.getTime() < end.getTime() ? pending : lapsed).push(item);
  }
  return { pending, lapsed };
}

/**
 * Job `open_exercise` (TECH-090): idempotente por item e retomável — cada passo de cada exercício é uma transação
 * própria; queda, timeout ou orçamento esgotado deixam o restante para a próxima execução. Falha de item ou da execução
 * → alerta `open_exercise_failure` (TECH-101), fora do outbox.
 */
export async function runOpenExercise(
  deps: OpenExerciseJobDependencies,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  try {
    const homes = await deps.listFormalized();
    const now = deps.clock.now();
    const { due, failures: calendarFailures } = exercisesDue(homes, now, deps.calendar);
    const sealed = await deps.sealedExercises([...new Set(due.map((item) => item.secondHomeId))]);
    const pending = due.filter((item) => !sealed.has(`${item.secondHomeId}:${item.exerciseYear}`));
    const failures: Failure[] = [...calendarFailures];
    const seal = await runStep(deps, 'seal', pending, correlationId, started, failures);
    const states = await deps.leapDayStates(leapDayCandidates(homes, due));
    const leap = leapDaysToGrant(deps, states, now);
    const leapDay = await runStep(deps, 'leap_day', leap.pending, correlationId, started, failures);
    const deferred = seal.deferred + leapDay.deferred;
    if (deferred > 0) deps.log.warn('open_exercise budget exhausted', { deferred });
    if (leap.lapsed.length > 0) {
      deps.log.warn('open_exercise leap day lapsed before it could be granted', {
        items: leap.lapsed.map((item) => ({
          second_home_id: item.secondHomeId,
          exercise_year: item.exerciseYear,
        })),
      });
    }
    if (failures.length > 0) {
      await deps.alert.raise({
        kind: 'open_exercise_failure',
        scope: 'item',
        correlationId,
        details: { failed: failures.length, items: failures },
      });
    }
    return {
      formalized: homes.length,
      due: due.length,
      sealed: seal.done,
      already_sealed: due.length - pending.length + seal.notApplicable,
      leap_day_granted: leapDay.done,
      leap_day_lapsed: leap.lapsed.length,
      failed: failures.length,
      deferred,
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
