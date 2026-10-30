import { describe, expect, it, vi } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import {
  closeExerciseKey,
  runCloseExercise,
  type CloseExerciseJobDependencies,
  type CloseExerciseResult,
} from '@/features/calendar/application/close-exercise';
import type {
  OpenExerciseResult,
  SealingTarget,
} from '@/features/calendar/application/open-exercise';
import {
  openExerciseKey,
  runOpenExercise,
  type LeapDayState,
  type OpenExerciseJobDependencies,
} from '@/features/calendar/application/open-exercise-job';
import { buildUseRightConsumers } from '@/features/calendar/application/use-right-consumers';
import {
  windowOpeningEvents,
  type UseRightFacts,
} from '@/features/calendar/application/use-rights';
import { createUseRightCalendar } from '@/features/calendar/domain/use-right-calendar';
import { temporalCivilTime } from '@/features/calendar/infrastructure/temporal-civil-time';
import type { CommandOutcome, CommandRequest, OutboxEvent } from '@/features/platform';

const calendar = createCivilCalendar();
const rights = createUseRightCalendar(temporalCivilTime);
const A = '00000000-0000-4000-8000-00000000000a';
const S1 = '00000000-0000-4000-8000-0000000000f1';
const S2 = '00000000-0000-4000-8000-0000000000f2';
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('job open_exercise — passo leap_day (W11) [TECH-090] [TECH-027]', () => {
  const coOwner: SealingTarget = {
    secondHomeId: A,
    modality: 'co_owner',
    operationStartDate: '2027-01-01',
    timezone: 'America/Sao_Paulo',
  };
  const state = (overrides: Partial<LeapDayState> = {}): LeapDayState => ({
    secondHomeId: A,
    exerciseYear: 2028,
    timezone: 'America/Sao_Paulo',
    nightSealed: true,
    granted: false,
    drawRevealed: true,
    ...overrides,
  });
  function harness(now: Date, states: readonly LeapDayState[]) {
    const requests: CommandRequest[] = [];
    const logs = log();
    const queried: unknown[] = [];
    const deps: OpenExerciseJobDependencies = {
      clock: { now: () => now },
      calendar,
      useRightCalendar: rights,
      listFormalized: () => Promise.resolve([coOwner]),
      // Todos os exercícios devidos já selados: só o passo leap_day está em jogo.
      sealedExercises: () =>
        Promise.resolve(new Set([2027, 2028, 2029].map((year) => `${A}:${year}`))),
      leapDayStates: (items) => {
        queried.push(items);
        return Promise.resolve(states);
      },
      execute: (request) => {
        requests.push(request);
        return Promise.resolve({
          status: 'committed',
          operationId: 'op',
          replayed: false,
          result: { second_home_id: A, exercise_year: 2028, step: 'leap_day', stake_id: S1 },
        } as CommandOutcome<OpenExerciseResult>);
      },
      alert: { raise: () => Promise.resolve() },
      log: logs,
      timeBudgetMs: 1_000,
      monotonicMs: () => 0,
    };
    return { deps, requests, logs, queried };
  }

  it('[REQ-031] descobre o 29/02 pendente em exercício já selado e executa o passo com chave própria', async () => {
    const { deps, requests, queried } = harness(new Date('2027-10-01T12:00:00Z'), [state()]);
    await expect(runOpenExercise(deps, { correlationId: 'run' })).resolves.toMatchObject({
      sealed: 0,
      leap_day_granted: 1,
      leap_day_lapsed: 0,
    });
    // Só o exercício bissexto com 29/02 da operação é candidato.
    expect(queried).toEqual([[{ secondHomeId: A, exerciseYear: 2028 }]]);
    expect(requests).toEqual([
      {
        actor: { kind: 'system', job: 'open_exercise' },
        idempotencyKey: `open_exercise:${A}:2028:leap_day:run`,
        correlationId: 'run',
        input: { second_home_id: A, exercise_year: 2028, step: 'leap_day' },
      },
    ]);
    expect(openExerciseKey({ secondHomeId: A, exerciseYear: 2028 }, 'run')).toBe(
      `open_exercise:${A}:2028:run`,
    );
  });

  it.each([
    ['sorteio pendente', { drawRevealed: false }],
    ['noite não selada', { nightSealed: false }],
    ['já concedido', { granted: true }],
  ])('[REQ-031] %s: nenhum passo, sem falha', async (_label, overrides) => {
    const { deps, requests } = harness(new Date('2027-10-01T12:00:00Z'), [state(overrides)]);
    await expect(runOpenExercise(deps, { correlationId: 'run' })).resolves.toMatchObject({
      leap_day_granted: 0,
      leap_day_lapsed: 0,
      failed: 0,
    });
    expect(requests).toEqual([]);
  });

  it('[PD-004] depois do fim efetivo o 29/02 não é concedido retroativamente: registrado como vencido', async () => {
    const { deps, requests, logs } = harness(new Date('2028-03-01T03:00:00Z'), [state()]);
    await expect(runOpenExercise(deps, { correlationId: 'run' })).resolves.toMatchObject({
      leap_day_granted: 0,
      leap_day_lapsed: 1,
    });
    expect(requests).toEqual([]);
    expect(logs.warn).toHaveBeenCalledWith(
      'open_exercise leap day lapsed before it could be granted',
      {
        items: [{ second_home_id: A, exercise_year: 2028 }],
      },
    );
  });
});

describe('job close_exercise (W11) [TECH-090] [INV-5]', () => {
  const item = {
    secondHomeId: A,
    exerciseYear: 2027,
    timezone: 'America/Sao_Paulo',
    buckets: ['alta', 'media'] as const,
  };
  function harness(
    now: Date,
    outcomes: readonly (CommandOutcome<CloseExerciseResult> | Error)[],
    candidates: CloseExerciseJobDependencies['exercisesWithRemaining'] = () =>
      Promise.resolve([item]),
  ) {
    const requests: CommandRequest[] = [];
    const logs = log();
    let call = 0;
    let elapsed = 0;
    const deps: CloseExerciseJobDependencies = {
      clock: { now: () => now },
      useRightCalendar: rights,
      exercisesWithRemaining: candidates,
      execute: (request) => {
        requests.push(request);
        const outcome = outcomes[call] ?? outcomes.at(-1)!;
        call += 1;
        return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
      },
      log: logs,
      timeBudgetMs: 10,
      monotonicMs: () => (elapsed += 1),
    };
    return { deps, requests, logs };
  }
  const committed = (replayed = false): CommandOutcome<CloseExerciseResult> => ({
    status: 'committed',
    operationId: 'op',
    replayed,
    result: { second_home_id: A, exercise_year: 2027, expired: [] },
  });

  it('[INV-5] antes do fim efetivo nada é tentado; depois, um command por exercício, como sistema', async () => {
    const before = harness(new Date('2028-01-01T02:59:59Z'), [committed()]);
    await expect(runCloseExercise(before.deps, { correlationId: 'run' })).resolves.toMatchObject({
      candidates: 1,
      due: 0,
      closed: 0,
    });
    expect(before.requests).toEqual([]);
    const after = harness(new Date('2028-01-01T03:00:00Z'), [committed()]);
    await expect(runCloseExercise(after.deps, { correlationId: 'run' })).resolves.toMatchObject({
      due: 1,
      closed: 1,
    });
    expect(after.requests).toEqual([
      {
        actor: { kind: 'system', job: 'close_exercise' },
        idempotencyKey: closeExerciseKey(item, 'run'),
        correlationId: 'run',
        input: { second_home_id: A, exercise_year: 2027 },
      },
    ]);
  });

  it('[TECH-090] replay e não aplicável contam como no-op; recusa e exceção vão ao log, sem alerta inventado', async () => {
    const two = () =>
      Promise.resolve([
        item,
        { ...item, secondHomeId: '00000000-0000-4000-8000-00000000000b' },
        { ...item, exerciseYear: 2026 },
        { ...item, exerciseYear: 2025 },
      ]);
    const { deps, logs } = harness(
      new Date('2030-01-01T00:00:00Z'),
      [
        committed(true),
        { status: 'rejected', operationId: 'op', code: 'ERR_STATE_TRANSITION', replayed: false },
        { status: 'rejected', operationId: 'op', code: 'ERR_USE_RIGHT_BALANCE', replayed: false },
        new TypeError('boom'),
      ],
      two,
    );
    await expect(runCloseExercise(deps, { correlationId: 'run' })).resolves.toMatchObject({
      due: 4,
      closed: 0,
      not_due: 2,
      failed: 2,
    });
    expect(logs.error).toHaveBeenCalledWith(
      'close_exercise item rejected',
      expect.objectContaining({ reason: 'ERR_USE_RIGHT_BALANCE' }),
    );
    expect(logs.error).toHaveBeenCalledWith(
      'close_exercise item failed',
      expect.objectContaining({ reason: 'TypeError' }),
    );
  });

  it('[TECH-090] falha da consulta inicial propaga (a rota responde 500 com log estruturado) sem executar nada', async () => {
    const failure = new Error('database down');
    const { deps, requests } = harness(new Date('2030-01-01T00:00:00Z'), [committed()], () =>
      Promise.reject(failure),
    );
    await expect(runCloseExercise(deps, { correlationId: 'run' })).rejects.toBe(failure);
    expect(requests).toEqual([]);
  });

  it('[TECH-090] orçamento esgotado adia; fim efetivo incalculável no fuso falha fechado, sem expirar', async () => {
    const budget = harness(new Date('2030-01-01T00:00:00Z'), [committed()], () =>
      Promise.resolve(
        Array.from({ length: 20 }, (_, index) => ({ ...item, exerciseYear: 2000 + index })),
      ),
    );
    const result = await runCloseExercise(budget.deps, { correlationId: 'run' });
    expect(result.deferred).toBeGreaterThan(0);
    expect(budget.logs.warn).toHaveBeenCalledWith('close_exercise budget exhausted', {
      deferred: result.deferred,
    });
    const zone = harness(new Date('2030-01-01T00:00:00Z'), [committed()], () =>
      Promise.resolve([{ ...item, timezone: 'Mars/Olympus' }]),
    );
    await expect(runCloseExercise(zone.deps, { correlationId: 'run' })).resolves.toMatchObject({
      due: 0,
      failed: 1,
    });
    expect(zone.requests).toEqual([]);
  });
});

describe('janelas e notificações do Direito de Uso (W11) [REQ-097] [D4]', () => {
  const facts: UseRightFacts = {
    secondHomeId: A,
    acquisitionId: 'acq',
    modality: 'co_owner',
    operationStartDate: '2027-01-01',
    formalizedAt: new Date('2026-03-01T12:00:00Z'),
    timezone: 'America/Sao_Paulo',
    configuration: { stakes: 2, alta: 48, media: 128 },
    stakeIds: [S1, S2],
    drawn: [
      { stakeId: S1, position: 2 },
      { stakeId: S2, position: 1 },
    ],
  };

  it('[REQ-032] uma janela por Ação, na abertura canônica; Owner, sorteio pendente ou exercício encerrado não geram janela', () => {
    const events = windowOpeningEvents(facts, 2027, new Date('2026-06-01T00:00:00Z'), rights);
    expect(
      events.map((event) => [
        event.payload.stake_id,
        event.payload.position,
        event.availableAt.toISOString(),
      ]),
    ).toEqual([
      [S2, 1, '2026-09-15T03:00:00.000Z'],
      [S1, 2, '2026-09-22T03:00:00.000Z'],
    ]);
    expect(windowOpeningEvents({ ...facts, modality: 'owner' }, 2027, new Date(), rights)).toEqual(
      [],
    );
    expect(windowOpeningEvents({ ...facts, drawn: null }, 2027, new Date(), rights)).toEqual([]);
    expect(windowOpeningEvents(facts, 2027, new Date('2028-01-01T03:00:00Z'), rights)).toEqual([]);
  });

  it('[REQ-097] notifica os titulares vigentes na entrega; o 29/02 já vencido não é notificado', async () => {
    const notify = vi.fn(() => Promise.resolve(true));
    let now = new Date('2028-02-01T00:00:00Z');
    const consumers = buildUseRightConsumers<null>({
      clock: { now: () => now },
      useRightCalendar: rights,
      useRights: { sealedExerciseYears: () => Promise.resolve([]) },
      lockSecondHome: () => Promise.resolve(),
      findUseRightFacts: () => Promise.resolve(null),
      enqueue: () => Promise.resolve(true),
      stakeHolders: () => Promise.resolve(['party-1', 'party-2']),
      notify,
    });
    const notifications = consumers.find(
      (consumer) => consumer.name === 'calendar_use_right_notification',
    )!;
    const leapEvent: OutboxEvent = {
      id: 'event-1',
      type: 'calendar.leap_day_granted',
      dedupKey: 'k',
      operationId: 'op',
      occurredAt: now,
      payload: {
        second_home_id: A,
        stake_id: S1,
        exercise_year: 2028,
        expires_at: '2028-03-01T03:00:00.000Z',
      },
    };
    await notifications.handle(leapEvent, null);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(null, {
      eventId: 'event-1',
      recipientPartyId: 'party-1',
      kind: 'calendar.leap_day_right',
      data: { second_home_id: A, exercise_year: 2028 },
      at: now,
    });
    now = new Date('2028-03-01T03:00:00Z');
    await notifications.handle({ ...leapEvent, id: 'event-2' }, null);
    expect(notify).toHaveBeenCalledTimes(2);
    // Sem fatos (Second Home inexistente), o consumidor da revelação não agenda nada.
    const windows = consumers.find((consumer) => consumer.name === 'calendar_use_windows_on_draw')!;
    await expect(
      windows.handle(
        { ...leapEvent, type: 'ownership.initial_draw_completed', payload: { second_home_id: A } },
        null,
      ),
    ).resolves.toBeUndefined();
  });
});
