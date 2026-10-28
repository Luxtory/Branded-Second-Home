import { describe, expect, it, vi } from 'vitest';
import {
  InitialDrawScheduleError,
  initialDrawConsumers,
  type InitialDrawStore,
  type RevealContext,
} from '@/features/ownership/application/initial-draw';
import { InitialDrawBeaconInvalidError } from '@/features/ownership/application/initial-draw-ports';

const ids = {
  event: '00000000-0000-4000-8000-000000000001',
  operation: '00000000-0000-4000-8000-000000000002',
  acquisition: '00000000-0000-4000-8000-000000000003',
  home: '00000000-0000-4000-8000-000000000004',
  draw: '00000000-0000-4000-8000-000000000005',
};
const event = (type: string, payload: Record<string, string>) => ({
  id: ids.event,
  type,
  dedupKey: 'k',
  operationId: ids.operation,
  occurredAt: new Date(0),
  payload,
});
const scheduled = event('ownership.initial_draw_scheduled', {
  acquisition_id: ids.acquisition,
  second_home_id: ids.home,
});
const committed = event('ownership.initial_draw_committed', {
  draw_id: ids.draw,
  second_home_id: ids.home,
});
const context: RevealContext = {
  drawId: ids.draw,
  acquisitionId: ids.acquisition,
  secondHomeId: ids.home,
  operationId: ids.operation,
  participantCount: 2,
  targetRound: 10,
  seed: Buffer.alloc(32, 1),
  participants: [
    { ordinal: 1, stakeId: 's1' },
    { ordinal: 2, stakeId: 's2' },
  ],
  revealed: false,
};

function store(overrides: Partial<InitialDrawStore<null>> = {}): InitialDrawStore<null> {
  return {
    hasDraw: vi.fn(() => Promise.resolve(false)),
    schedule: vi.fn(() => Promise.resolve(null)),
    armTransactionTimeout: vi.fn(() => Promise.resolve(new Date(0))),
    insertCommitment: vi.fn(() => Promise.resolve()),
    revealContext: vi.fn(() => Promise.resolve(context)),
    insertReveal: vi.fn(() => Promise.resolve()),
    recipients: vi.fn(() => Promise.resolve(['p1', 'p2'])),
    audit: vi.fn(() => Promise.resolve()),
    enqueue: vi.fn(() => Promise.resolve(true)),
    notify: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

const consumers = (s: InitialDrawStore<null>, round = 10) =>
  initialDrawConsumers<null>({
    store: s,
    beacon: () => ({
      verifiedRound: () =>
        Promise.resolve({ round, randomness: Buffer.alloc(32, 2), signature: Buffer.alloc(48, 3) }),
    }),
    config: () => ({ transactionTimeoutMs: 1_000, beaconTimeoutMs: 500, leadSeconds: 1 }),
    clock: { now: () => new Date(0) },
  });

describe('W9 consumidores do sorteio, ramos defensivos [TECH-093]', () => {
  it('[TECH-093] evento sem sorteio Co-Owner correspondente não grava efeito', async () => {
    const s = store();
    const [commit] = consumers(s);
    await expect(commit!.handle(scheduled, null)).rejects.toBeInstanceOf(InitialDrawScheduleError);
    const other = store({
      schedule: () =>
        Promise.resolve({
          acquisitionId: ids.acquisition,
          secondHomeId: ids.home,
          operationId: '00000000-0000-4000-8000-0000000000ff',
          participantCount: 2,
          stakes: [],
        }),
    });
    await expect(consumers(other)[0]!.handle(scheduled, null)).rejects.toBeInstanceOf(
      InitialDrawScheduleError,
    );
    expect(s.insertCommitment).not.toHaveBeenCalled();
    expect(other.insertCommitment).not.toHaveBeenCalled();
  });

  it('[TECH-093] sorteio já comprometido ou já revelado é no-op', async () => {
    const s = store({
      hasDraw: () => Promise.resolve(true),
      revealContext: () => Promise.resolve({ ...context, revealed: true }),
    });
    const [commit, reveal] = consumers(s);
    await commit!.handle(scheduled, null);
    await reveal!.handle(committed, null);
    expect(s.insertCommitment).not.toHaveBeenCalled();
    expect(s.insertReveal).not.toHaveBeenCalled();
    expect(s.enqueue).not.toHaveBeenCalled();
  });

  it('[TECH-093] revelação sem sorteio ou com rodada diferente da fixada é recusada', async () => {
    const missing = store({ revealContext: () => Promise.resolve(null) });
    await expect(consumers(missing)[1]!.handle(committed, null)).rejects.toBeInstanceOf(
      InitialDrawScheduleError,
    );
    const s = store();
    await expect(consumers(s, 11)[1]!.handle(committed, null)).rejects.toBeInstanceOf(
      InitialDrawBeaconInvalidError,
    );
    expect(s.insertReveal).not.toHaveBeenCalled();
  });

  it('[TECH-091] o resultado notifica cada pessoa ou empresa titular só com ids', async () => {
    const s = store();
    const [, , notification] = consumers(s);
    await notification!.handle(
      event('ownership.initial_draw_completed', { draw_id: ids.draw, second_home_id: ids.home }),
      null,
    );
    expect(s.notify).toHaveBeenCalledTimes(2);
    expect(s.notify).toHaveBeenCalledWith(null, {
      eventId: ids.event,
      recipientPartyId: 'p1',
      kind: 'ownership.initial_draw_result',
      data: { draw_id: ids.draw, second_home_id: ids.home },
      at: new Date(0),
    });
  });
});
