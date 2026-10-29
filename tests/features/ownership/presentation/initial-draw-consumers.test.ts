import { describe, expect, it } from 'vitest';
import { ConfigurationMissingError, type DatabaseTransaction } from '@/features/platform';
import { createOutboxConsumers } from '@/features/platform/infrastructure/jobs/job-registry';
import { createInitialDrawConsumers } from '@/features/ownership';

const event = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'ownership.initial_draw_scheduled',
  dedupKey: 'k',
  operationId: '00000000-0000-4000-8000-000000000002',
  occurredAt: new Date(0),
  payload: {
    acquisition_id: '00000000-0000-4000-8000-000000000003',
    second_home_id: '00000000-0000-4000-8000-000000000004',
  },
};
// A configuração ausente falha antes de qualquer acesso à transação; um uso indevido estouraria aqui.
const untouchedTx = new Proxy(
  {},
  {
    get() {
      throw new Error('transaction must not be used');
    },
  },
) as DatabaseTransaction;

describe('W9 registro dos consumidores do sorteio (ADR-0022)', () => {
  it('[TECH-093] o outbox de produção registra os três consumidores do sorteio sem ler configuração', () => {
    const registry = createOutboxConsumers({ source: {} });
    expect(registry.eventTypes()).toEqual(
      expect.arrayContaining([
        'ownership.initial_draw_scheduled',
        'ownership.initial_draw_committed',
        'ownership.initial_draw_completed',
      ]),
    );
    expect(createInitialDrawConsumers({ source: {} }).map((c) => c.name)).toEqual([
      'ownership_initial_draw_commit',
      'ownership_initial_draw_commit_evidence',
      'ownership_initial_draw_reveal',
      'ownership_initial_draw_notification',
    ]);
  });

  it('[TECH-001] sem os orçamentos DRAW_* o consumidor falha antes de tocar a transação', async () => {
    const [commit] = createInitialDrawConsumers({ source: {} });
    await expect(commit!.handle(event, untouchedTx)).rejects.toBeInstanceOf(
      ConfigurationMissingError,
    );
  });
});
