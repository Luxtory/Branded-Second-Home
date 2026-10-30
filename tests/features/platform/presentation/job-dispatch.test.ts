import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduled: (() => Promise<void>)[] = [];
const runs: unknown[] = [];
let failure: Error | null = null;

vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => {
    scheduled.push(callback);
  },
}));
vi.mock('@/features/platform/infrastructure/jobs/job-registry', () => ({
  createJobRegistry: () => ({
    get: (job: string) =>
      job === 'open_exercise'
        ? (context: unknown) => {
            runs.push(context);
            return failure === null ? Promise.resolve({ sealed: 1 }) : Promise.reject(failure);
          }
        : undefined,
  }),
}));

const { dispatchJobAfterCommit } = await import('@/features/platform/presentation/job-dispatch');

describe('disparo de job depois do commit (W10, ADR-0024 §2)', () => {
  beforeEach(() => {
    scheduled.length = 0;
    runs.length = 0;
    failure = null;
  });

  it('[TECH-090] agenda o open_exercise com o correlation id, sem executar antes da resposta', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    dispatchJobAfterCommit('open_exercise', log, 'corr-after');
    expect(runs).toEqual([]);
    await scheduled[0]!();
    expect(runs).toEqual([{ correlationId: 'corr-after' }]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('[TECH-090] falha de entrega só vira log: o cron diário recupera', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    failure = new TypeError('connection refused');
    dispatchJobAfterCommit('open_exercise', log, 'corr-fail');
    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('job after commit failed', {
      job: 'open_exercise',
      error_name: 'TypeError',
    });
    dispatchJobAfterCommit('close_exercise', log, 'corr-missing');
    await expect(scheduled[1]!()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenLastCalledWith('job after commit failed', {
      job: 'close_exercise',
      error_name: 'Error',
    });
  });
});
