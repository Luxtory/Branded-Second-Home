import { describe, expect, it, vi } from 'vitest';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import {
  dispatchOutbox,
  type OutboxStore,
} from '@/features/platform/application/outbox/dispatcher';

const consumer = { name: 'test_consumer', eventTypes: ['platform.test_happened'], handle: vi.fn() };

function store(overrides: Partial<OutboxStore<null>>): OutboxStore<null> {
  return {
    withNextPending: () => Promise.resolve(null),
    isolated: (_tx, work) => work(),
    claimReceipt: () => Promise.resolve(true),
    markDelivered: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
    recordFailure: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('dispatcher do outbox (ADR-0022 §5)', () => {
  it('[TECH-091] falha antes de travar um evento (banco indisponível) propaga sem registrar tentativa', async () => {
    const failing = store({
      withNextPending: () => Promise.reject(new Error('connect ECONNREFUSED')),
    });
    await expect(
      dispatchOutbox({
        store: failing,
        consumers: new ConsumerRegistry([consumer]),
        clock: { now: () => new Date(0) },
        batchSize: 5,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }),
    ).rejects.toThrow('ECONNREFUSED');
    expect(failing.recordFailure).not.toHaveBeenCalled();
  });

  it('[ADR-0022] passa o instante do relógio injetado ao store', async () => {
    const withNextPending = vi.fn(() => Promise.resolve(null));
    await dispatchOutbox({
      store: store({ withNextPending }),
      consumers: new ConsumerRegistry([consumer]),
      clock: { now: () => new Date('2027-01-01T00:00:00Z') },
      batchSize: 5,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    expect(withNextPending).toHaveBeenCalledWith(
      ['platform.test_happened'],
      [],
      expect.any(Function),
      new Date('2027-01-01T00:00:00Z'),
    );
  });
});
