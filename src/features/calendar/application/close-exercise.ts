import { z } from 'zod';
import {
  CommandRejection,
  type Clock,
  type CommandHandler,
  type CommandOutcome,
  type CommandRequest,
  type LogPort,
} from '@/features/platform';
import type { UseRightCalendar } from '../domain/use-right-calendar';
import type { UseRightBucket } from '../domain/use-right';
import type { UseRightFacts, UseRightStore } from './use-rights';

export const closeExerciseInput = z.strictObject({
  second_home_id: z.uuid(),
  exercise_year: z.number().int().min(1).max(9999),
});
export type CloseExerciseInput = z.infer<typeof closeExerciseInput>;

export type CloseExerciseResult = {
  readonly second_home_id: string;
  readonly exercise_year: number;
  readonly expired: readonly {
    readonly stake_id: string;
    readonly bucket: string;
    readonly quantity: number;
  }[];
};

export interface CloseExerciseDependencies<Tx> {
  readonly useRightCalendar: UseRightCalendar;
  readonly useRights: UseRightStore<Tx>;
  /** Mesma trava consultiva da Second Home da W8/W10, antes de qualquer leitura. */
  readonly lockSecondHome: (tx: Tx, secondHomeId: string) => Promise<void>;
  readonly findUseRightFacts: (tx: Tx, secondHomeId: string) => Promise<UseRightFacts | null>;
}

/**
 * `close_exercise` (TECH-026, TECH-090; INV-5, PD-004; spec calendar §6): registra a expiração do saldo restante de cada
 * bucket cujo fim efetivo já passou — o 29/02 depois de 01/03 00:00, Alta e Média depois de 01/01 seguinte 00:00, no
 * fuso da Second Home. Exatamente o restante; nada vencido → `ERR_STATE_TRANSITION`. O registro nunca é o que torna o
 * saldo inutilizável: o banco recusa uso depois do fim efetivo com ou sem ele.
 */
export function createCloseExerciseHandler<Tx>(
  deps: CloseExerciseDependencies<Tx>,
): CommandHandler<CloseExerciseInput, CloseExerciseResult, Tx> {
  return {
    command: 'close_exercise',
    input: closeExerciseInput,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, operationId, now, audit }) {
      const { second_home_id: secondHomeId, exercise_year: exerciseYear } = input;
      await deps.lockSecondHome(tx, secondHomeId);
      const facts = await deps.findUseRightFacts(tx, secondHomeId);
      if (facts === null) throw new CommandRejection('ERR_STATE_TRANSITION');
      const balances = await deps.useRights.remainingBalances(tx, secondHomeId, exerciseYear);
      const due = balances.filter(
        (balance) =>
          now.getTime() >=
          deps.useRightCalendar
            .effectiveEnd(balance.bucket, exerciseYear, facts.timezone)
            .getTime(),
      );
      if (due.length === 0) throw new CommandRejection('ERR_STATE_TRANSITION');
      for (const balance of due) {
        await deps.useRights.insertExpiration(tx, {
          secondHomeId,
          acquisitionId: facts.acquisitionId,
          stakeId: balance.stakeId,
          exerciseYear,
          bucket: balance.bucket,
          quantity: balance.remaining,
          operationId,
        });
      }
      const expired = due.map((balance) => ({
        stake_id: balance.stakeId,
        bucket: balance.bucket,
        quantity: balance.remaining,
      }));
      audit({
        objectType: 'use_right_exercise',
        objectId: `${secondHomeId}:${exerciseYear}`,
        before: null,
        after: { exercise_year: exerciseYear, expired },
      });
      return { second_home_id: secondHomeId, exercise_year: exerciseYear, expired };
    },
  };
}

/** Orçamento de uma execução, abaixo dos 300 s da função (o mesmo do `open_exercise`). */
export const CLOSE_EXERCISE_TIME_BUDGET_MS = 240_000;

const SYSTEM_ACTOR = { kind: 'system', job: 'close_exercise' } as const;

export interface ExpirableExercise {
  readonly secondHomeId: string;
  readonly exerciseYear: number;
  readonly timezone: string;
  readonly buckets: readonly UseRightBucket[];
}

export interface CloseExerciseJobDependencies {
  readonly clock: Clock;
  readonly useRightCalendar: UseRightCalendar;
  /** Todos os exercícios com saldo restante, de qualquer ano: recupera atrasos de dias, meses ou exercícios. */
  readonly exercisesWithRemaining: () => Promise<readonly ExpirableExercise[]>;
  readonly execute: (request: CommandRequest) => Promise<CommandOutcome<CloseExerciseResult>>;
  readonly log: LogPort;
  readonly timeBudgetMs: number;
  readonly monotonicMs: () => number;
}

export function closeExerciseKey(item: ExpirableExercise, correlationId: string): string {
  return `close_exercise:${item.secondHomeId}:${item.exerciseYear}:${correlationId}`;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Job `close_exercise` (TECH-090): idempotente e retomável — uma transação por exercício, chave por execução, saldo já
 * expirado é no-op. Falha só vai ao log estruturado: o TECH-101 não tem alerta deste job, e a validade não depende dele.
 */
export async function runCloseExercise(
  deps: CloseExerciseJobDependencies,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  const now = deps.clock.now();
  const candidates = await deps.exercisesWithRemaining();
  const counts = { closed: 0, not_due: 0, failed: 0, deferred: 0 };
  const due = candidates.filter((item) => {
    try {
      return item.buckets.some(
        (bucket) =>
          now.getTime() >=
          deps.useRightCalendar.effectiveEnd(bucket, item.exerciseYear, item.timezone).getTime(),
      );
    } catch (error) {
      // Fim efetivo não calculável no fuso (hora local inexistente ou ambígua): falha fechada, sem expirar.
      counts.failed += 1;
      deps.log.error('close_exercise effective end unavailable', {
        second_home_id: item.secondHomeId,
        exercise_year: item.exerciseYear,
        reason: errorName(error),
        correlation_id: correlationId,
      });
      return false;
    }
  });
  for (const [index, item] of due.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = due.length - index;
      break;
    }
    const fields = { second_home_id: item.secondHomeId, exercise_year: item.exerciseYear };
    try {
      const outcome = await deps.execute({
        actor: SYSTEM_ACTOR,
        idempotencyKey: closeExerciseKey(item, correlationId),
        correlationId,
        input: fields,
      });
      if (outcome.status === 'committed' && !outcome.replayed) counts.closed += 1;
      else if (outcome.status === 'committed' || outcome.code === 'ERR_STATE_TRANSITION')
        counts.not_due += 1;
      else {
        counts.failed += 1;
        deps.log.error('close_exercise item rejected', {
          ...fields,
          reason: outcome.code,
          correlation_id: correlationId,
        });
      }
    } catch (error) {
      counts.failed += 1;
      deps.log.error('close_exercise item failed', {
        ...fields,
        reason: errorName(error),
        correlation_id: correlationId,
      });
    }
  }
  if (counts.deferred > 0)
    deps.log.warn('close_exercise budget exhausted', { deferred: counts.deferred });
  return { candidates: candidates.length, due: due.length, ...counts };
}
