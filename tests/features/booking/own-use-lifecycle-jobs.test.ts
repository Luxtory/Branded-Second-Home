import { describe, expect, it } from 'vitest';
import {
  runBookingSweep,
  sweepKey,
  type BookingSweepCandidate,
} from '@/features/booking/application/own-use-lifecycle-jobs';
import type { CommandOutcome, CommandRequest } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';

const candidate = (n: number, head: string | null = null): BookingSweepCandidate => ({
  bookingId: `00000000-0000-4000-8000-00000000000${n}`,
  secondHomeId: '00000000-0000-4000-8000-0000000000aa',
  lastTransitionId: head,
});

type Result = { readonly transitions: number };

function sweep(
  candidates: readonly BookingSweepCandidate[],
  respond: (request: CommandRequest, index: number) => Promise<CommandOutcome<Result>>,
  budget = { timeBudgetMs: 1_000, clock: () => 0 },
) {
  const log = captureLogger();
  const requests: CommandRequest[] = [];
  const run = runBookingSweep<Result>(
    {
      job: 'advance_booking_states',
      candidates: () => Promise.resolve(candidates),
      execute: (request) => {
        requests.push(request);
        return respond(request, requests.length - 1);
      },
      log: log.logger,
      timeBudgetMs: budget.timeBudgetMs,
      monotonicMs: budget.clock,
      extra: { keys: ['transitions'], of: (result) => ({ transitions: result.transitions }) },
    },
    { correlationId: 'corr-1' },
  );
  return { run, requests, log };
}

const committed = (transitions: number, replayed = false): CommandOutcome<Result> => ({
  status: 'committed',
  operationId: 'op',
  result: { transitions },
  replayed,
});

describe('varredura dos jobs do ciclo (W13 E3)', () => {
  it('[TECH-090][spec booking §10.14] sem candidata: nenhuma chamada ao executor, contagens zeradas', async () => {
    const { run, requests } = sweep([], () => Promise.reject(new Error('never')));

    expect(await run).toEqual({
      candidates: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
      transitions: 0,
    });
    expect(requests).toEqual([]);
  });

  it('[TECH-101] processada, replay e estado mudado; recusa inesperada e erro contam como falha, só com ids e códigos', async () => {
    const outcomes: (() => Promise<CommandOutcome<Result>>)[] = [
      () => Promise.resolve(committed(2)),
      () => Promise.resolve(committed(1, true)),
      () =>
        Promise.resolve({
          status: 'rejected',
          operationId: 'op',
          code: 'ERR_STATE_TRANSITION',
          replayed: false,
        }),
      () =>
        Promise.resolve({
          status: 'rejected',
          operationId: null,
          code: 'ERR_PERMISSION',
          replayed: false,
        }),
      () => Promise.reject(new TypeError('boom with detail')),
    ];
    const { run, requests, log } = sweep(
      [1, 2, 3, 4, 5].map((n) => candidate(n)),
      (_request, index) => outcomes[index]!(),
    );

    expect(await run).toEqual({
      candidates: 5,
      processed: 1,
      skipped: 2,
      failed: 2,
      deferred: 0,
      transitions: 2,
    });
    expect(requests[0]).toMatchObject({
      actor: { kind: 'system', job: 'advance_booking_states' },
      correlationId: 'corr-1',
      input: { second_home_id: candidate(1).secondHomeId, booking_id: candidate(1).bookingId },
    });
    const errors = log.entries().filter((entry) => entry.level === 'error');
    expect(errors.map((entry) => entry.reason)).toEqual(['ERR_PERMISSION', 'TypeError']);
    expect(JSON.stringify(log.entries())).not.toContain('boom with detail');
  });

  it('[TECH-090] orçamento esgotado: o restante fica para a próxima execução (deferred)', async () => {
    let now = 0;
    const { run, requests } = sweep(
      [1, 2, 3].map((n) => candidate(n)),
      () => {
        now += 600;
        return Promise.resolve(committed(1));
      },
      { timeBudgetMs: 1_000, clock: () => now },
    );

    expect(await run).toMatchObject({ processed: 2, deferred: 1 });
    expect(requests).toHaveLength(2);
  });

  it('[TECH-101][spec booking §10.14] chave pela folha da cadeia: mesmo estado = mesma chave; estado novo = chave nova', () => {
    const root = sweepKey('flag_no_show_candidates', candidate(1));
    const head = sweepKey(
      'flag_no_show_candidates',
      candidate(1, 'aaaaaaaa-0000-4000-8000-000000000001'),
    );

    expect(root).toBe(`flag_no_show_candidates:${candidate(1).bookingId}:root`);
    expect(head).not.toBe(root);
    expect(sweepKey('advance_booking_states', candidate(1))).not.toBe(root);
    expect(head).toMatch(/^[!-~]{1,255}$/);
  });
});
