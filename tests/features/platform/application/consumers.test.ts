import { describe, expect, it } from 'vitest';
import {
  ConsumerRegistry,
  ConsumerRegistryError,
  type OutboxConsumer,
} from '@/features/platform/application/outbox/consumers';

const consumer = (name: string, eventTypes: string[]): OutboxConsumer<unknown> => ({
  name,
  eventTypes,
  handle: () => Promise.resolve(),
});

describe('registro de consumidores do outbox (TECH-091)', () => {
  it('entrega cada tipo de evento só aos consumidores inscritos', () => {
    const registry = new ConsumerRegistry([
      consumer('notifier', ['booking.confirmed', 'booking.cancelled']),
      consumer('mirror', ['booking.confirmed']),
    ]);

    expect(registry.forEvent('booking.confirmed').map((item) => item.name)).toEqual([
      'notifier',
      'mirror',
    ]);
    expect(registry.forEvent('booking.cancelled').map((item) => item.name)).toEqual(['notifier']);
    expect(registry.forEvent('credits.expired')).toEqual([]);
  });

  it('nome repetido ou inválido e tipo de evento fora do padrão são recusados', () => {
    expect(() => new ConsumerRegistry([consumer('a', ['x.y']), consumer('a', ['x.z'])])).toThrow(
      ConsumerRegistryError,
    );
    expect(() => new ConsumerRegistry([consumer('Inválido', ['x.y'])])).toThrow(
      ConsumerRegistryError,
    );
    expect(() => new ConsumerRegistry([consumer('ok', ['sem_modulo'])])).toThrow(
      ConsumerRegistryError,
    );
  });
});
