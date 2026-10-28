import {
  loadRuntimeConfig,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type EnvSource,
  type OutboxConsumer,
} from '@/features/platform';
import { initialDrawConsumers } from '../application/initial-draw';
import { createQuicknetBeacon } from '../infrastructure/drand-quicknet-beacon';
import { postgresInitialDrawStore } from '../infrastructure/postgres-initial-draw-store';

const DRAW_KEYS = [
  'DRAW_TRANSACTION_TIMEOUT_MS',
  'DRAW_BEACON_TIMEOUT_MS',
  'DRAW_BEACON_LEAD_SECONDS',
] as const;

export interface InitialDrawConsumerOptions {
  readonly source?: EnvSource;
  readonly clock?: Clock;
}

/**
 * Consumidores do sorteio (spec ownership §16, ADR-0022) com as dependências de produção: beacon drand quicknet sempre,
 * PostgreSQL e orçamentos `DRAW_*` lidos só ao processar um evento.
 */
export function createInitialDrawConsumers({
  source,
  clock = systemClock,
}: InitialDrawConsumerOptions = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return initialDrawConsumers<DatabaseTransaction>({
    store: postgresInitialDrawStore,
    beacon: (budgetMs) => createQuicknetBeacon({ budgetMs }),
    config: () => {
      const config = loadRuntimeConfig(DRAW_KEYS, source);
      return {
        transactionTimeoutMs: config.DRAW_TRANSACTION_TIMEOUT_MS,
        beaconTimeoutMs: config.DRAW_BEACON_TIMEOUT_MS,
        leadSeconds: config.DRAW_BEACON_LEAD_SECONDS,
      };
    },
    clock,
  });
}
