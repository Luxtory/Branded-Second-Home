import { findUseRightFacts, stakeHolders } from '@/features/ownership';
import {
  enqueueOutboxEvent,
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildUseRightConsumers } from '../application/use-right-consumers';
import { createUseRightCalendar } from '../domain/use-right-calendar';
import { createPostgresSealingStore } from '../infrastructure/postgres-sealing-store';
import { createPostgresUseRightStore } from '../infrastructure/postgres-use-right-store';
import { temporalCivilTime } from '../infrastructure/temporal-civil-time';

/** Consumidores do outbox do Direito de Uso (W11), registrados pelo job `outbox` do platform. */
export function createUseRightConsumers({
  clock = systemClock,
}: { readonly clock?: Clock } = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return buildUseRightConsumers<DatabaseTransaction>({
    clock,
    useRightCalendar: createUseRightCalendar(temporalCivilTime),
    useRights: createPostgresUseRightStore(),
    lockSecondHome: createPostgresSealingStore().lockSecondHome,
    findUseRightFacts,
    enqueue: enqueueOutboxEvent,
    stakeHolders,
    notify: recordNotification,
  });
}
