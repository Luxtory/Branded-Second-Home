import { createInitialDrawConsumers } from '@/features/ownership';
import type { Clock } from '../../application/clock';
import { JobRegistry, type JobRunner } from '../../application/jobs/registry';
import type { LogPort } from '../../application/log';
import { ConsumerRegistry } from '../../application/outbox/consumers';
import { dispatchOutbox } from '../../application/outbox/dispatcher';
import type { DatabaseTransaction } from '../database/connection';
import { getDatabase } from '../database/connection';
import { loadRuntimeConfig, type EnvSource } from '../env';
import { createPostgresOutboxStore } from '../outbox/postgres-outbox-store';
import { systemClock } from '../system-clock';

export interface JobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
}

/**
 * Consumidores do outbox: cada wave registra aqui os consumidores dos eventos que produz (AsyncAPI). Criados a cada
 * varredura, sem ler configuração: o estado de falha rápida do beacon vale só para ela (ADR-0022 §6).
 */
export function createOutboxConsumers({
  source,
  clock,
}: Omit<JobEnvironment, 'log'>): ConsumerRegistry<DatabaseTransaction> {
  return new ConsumerRegistry<DatabaseTransaction>([
    // W9 — sorteio inicial (spec ownership §16).
    ...createInitialDrawConsumers({ source, clock }),
  ]);
}

/** Varredura do outbox (TECH-090 `outbox`, TECH-091); também serve de disparo logo após um commit. */
export function createOutboxDispatch({
  log,
  source,
  clock = systemClock,
}: JobEnvironment): JobRunner {
  return async () => {
    const { OUTBOX_BATCH_SIZE } = loadRuntimeConfig(['OUTBOX_BATCH_SIZE'], source);
    const store = createPostgresOutboxStore(getDatabase(source));
    return dispatchOutbox({
      store,
      consumers: createOutboxConsumers({ source, clock }),
      clock,
      batchSize: OUTBOX_BATCH_SIZE,
      log,
    });
  };
}

/** Jobs implementados, com as dependências de produção. */
export function createJobRegistry(environment: JobEnvironment): JobRegistry {
  return new JobRegistry({ outbox: createOutboxDispatch(environment) });
}
