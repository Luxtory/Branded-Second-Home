import { beforeEach, describe, expect, it, vi } from 'vitest';

// `after()` só existe dentro de um request do Next: aqui a callback é capturada e executada pelo teste.
const scheduled: (() => Promise<void>)[] = [];
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => {
    scheduled.push(callback);
  },
}));

const { scheduleOutboxDispatch } = await import('@/features/platform/presentation/outbox-dispatch');

describe('disparo do outbox após o commit (TECH-091)', () => {
  beforeEach(() => {
    scheduled.length = 0;
  });

  it('[TECH-091] agenda a entrega para depois da resposta', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ delivered: 1, failed: 0 }));
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    scheduleOutboxDispatch(dispatch, log);

    expect(dispatch).not.toHaveBeenCalled();
    await scheduled[0]?.();
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('[TECH-091] falha no disparo só vira log: o evento fica para a varredura', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    scheduleOutboxDispatch(() => Promise.reject(new RangeError('x')), log);
    await scheduled[0]?.();

    expect(log.error).toHaveBeenCalledWith('outbox dispatch after commit failed', {
      error_name: 'RangeError',
    });
  });
});
