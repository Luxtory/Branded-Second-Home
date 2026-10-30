import { describe, expect, it, vi } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import type {
  OpenExerciseResult,
  SealingTarget,
} from '@/features/calendar/application/open-exercise';
import {
  exercisesDue,
  openExerciseKey,
  runOpenExercise,
  type OpenExerciseJobDependencies,
} from '@/features/calendar/application/open-exercise-job';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import type { CommandOutcome, CommandRequest, OperationalAlertEvent } from '@/features/platform';

const calendar = createCivilCalendar();
const NOW = new Date('2027-06-10T12:00:00Z');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const home = (
  id: string,
  operationStartDate: string,
  timezone = 'America/Sao_Paulo',
): SealingTarget => ({
  secondHomeId: id,
  modality: 'owner',
  operationStartDate,
  timezone,
});
const committed = (replayed = false): CommandOutcome<OpenExerciseResult> => ({
  status: 'committed',
  operationId: 'op',
  replayed,
  result: {
    second_home_id: A,
    exercise_year: 2027,
    nights: 365,
    root_holder: 'owner',
    use_right_grants: 0,
  },
});

function harness(overrides: Partial<OpenExerciseJobDependencies> = {}) {
  const alerts: OperationalAlertEvent[] = [];
  const requests: CommandRequest[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let elapsed = 0;
  const deps: OpenExerciseJobDependencies = {
    clock: { now: () => NOW },
    calendar,
    useRightCalendar: createUseRightCalendar(temporalCivilTime),
    leapDayStates: () => Promise.resolve([]),
    listFormalized: () => Promise.resolve([home(A, '2027-01-01'), home(B, '2030-01-01')]),
    sealedExercises: () => Promise.resolve(new Set<string>()),
    execute: (request) => {
      requests.push(request);
      return Promise.resolve(committed());
    },
    alert: {
      raise: (event) => {
        alerts.push(event);
        return Promise.resolve();
      },
    },
    log,
    timeBudgetMs: 1_000,
    monotonicMs: () => (elapsed += 1),
    ...overrides,
  };
  return { deps, alerts, requests, log };
}

describe('job open_exercise (W10) [TECH-090] [TECH-042] [TECH-101]', () => {
  it('[TECH-042] devidos: corrente e seguinte pela data local, a partir do ano da data-base, corrente primeiro', () => {
    const { due } = exercisesDue(
      [home(B, '2028-03-01'), home(A, '2027-01-01'), home('c', '2031-01-01')],
      NOW,
      calendar,
    );
    expect(due).toEqual([
      { secondHomeId: A, exerciseYear: 2027 },
      { secondHomeId: A, exerciseYear: 2028 },
      { secondHomeId: B, exerciseYear: 2028 },
    ]);
    // Virada de exercício pela data local: 31/12 23:30 em São Paulo já é 01/01 em UTC.
    const lateNight = new Date('2028-01-01T02:30:00Z');
    expect(exercisesDue([home(A, '2027-01-01')], lateNight, calendar).due).toEqual([
      { secondHomeId: A, exerciseYear: 2027 },
      { secondHomeId: A, exerciseYear: 2028 },
    ]);
  });

  it('[TECH-090] chave por execução: nunca reaproveitada entre execuções, estável dentro de uma', () => {
    const item = { secondHomeId: A, exerciseYear: 2027 };
    expect(openExerciseKey(item, 'run-1')).toBe(`open_exercise:${A}:2027:run-1`);
    expect(openExerciseKey(item, 'run-2')).not.toBe(openExerciseKey(item, 'run-1'));
  });

  it('[TECH-090] sela só o que falta, como sistema, e conta o já selado sem executar', async () => {
    const { deps, requests, alerts } = harness({
      sealedExercises: () => Promise.resolve(new Set([`${A}:2027`])),
    });
    await expect(runOpenExercise(deps, { correlationId: 'run-1' })).resolves.toEqual({
      formalized: 2,
      due: 2,
      sealed: 1,
      already_sealed: 1,
      leap_day_granted: 0,
      leap_day_lapsed: 0,
      failed: 0,
      deferred: 0,
    });
    expect(requests).toEqual([
      {
        actor: { kind: 'system', job: 'open_exercise' },
        idempotencyKey: `open_exercise:${A}:2028:run-1`,
        correlationId: 'run-1',
        input: { second_home_id: A, exercise_year: 2028, step: 'seal' },
      },
    ]);
    expect(alerts).toEqual([]);
  });

  it('[TECH-090] corrida e replay contam como já selado; recusa e exceção viram um único alerta por execução', async () => {
    const outcomes = [
      committed(true),
      { status: 'rejected', operationId: 'op', code: 'ERR_STATE_TRANSITION', replayed: false },
      { status: 'rejected', operationId: 'op', code: 'ERR_CAPACITY_UNAVAILABLE', replayed: false },
    ] as const;
    let call = 0;
    const { deps, alerts } = harness({
      listFormalized: () =>
        Promise.resolve([
          home(A, '2027-01-01'),
          home(B, '2027-01-01'),
          home('bad', '2027-01-01', 'Mars/Olympus'),
        ]),
      execute: () => {
        const outcome = outcomes[call];
        call += 1;
        return outcome === undefined
          ? Promise.reject(new TypeError('boom'))
          : Promise.resolve(outcome);
      },
    });
    await expect(runOpenExercise(deps, { correlationId: 'run-2' })).resolves.toMatchObject({
      sealed: 0,
      already_sealed: 2,
      failed: 3,
    });
    expect(alerts).toEqual([
      {
        kind: 'open_exercise_failure',
        scope: 'item',
        correlationId: 'run-2',
        details: {
          failed: 3,
          items: [
            { second_home_id: 'bad', exercise_year: null, reason: 'RangeError' },
            // Ordem de execução: exercício, depois Second Home (A 2027, B 2027, A 2028, B 2028).
            { second_home_id: A, exercise_year: 2028, reason: 'ERR_CAPACITY_UNAVAILABLE' },
            { second_home_id: B, exercise_year: 2028, reason: 'TypeError' },
          ],
        },
      },
    ]);
  });

  it('[TECH-090] orçamento esgotado adia o restante para a próxima execução, sem alerta', async () => {
    const { deps, requests, alerts, log } = harness({ timeBudgetMs: 0 });
    await expect(runOpenExercise(deps, { correlationId: 'run-3' })).resolves.toMatchObject({
      due: 2,
      sealed: 0,
      deferred: 2,
    });
    expect(requests).toEqual([]);
    expect(alerts).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith('open_exercise budget exhausted', { deferred: 2 });
  });

  it('[TECH-101] falha geral da execução alerta com escopo run e propaga o erro', async () => {
    const failure = new Error('database down');
    const { deps, alerts } = harness({ listFormalized: () => Promise.reject(failure) });
    await expect(runOpenExercise(deps, { correlationId: 'run-4' })).rejects.toBe(failure);
    expect(alerts).toEqual([
      {
        kind: 'open_exercise_failure',
        scope: 'run',
        correlationId: 'run-4',
        details: { reason: 'Error' },
      },
    ]);
  });
});
