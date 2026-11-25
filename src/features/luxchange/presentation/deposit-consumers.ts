import {
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildDepositConsumers } from '../application/deposit-consumers';
import { buildRequestConsumers } from '../application/request-consumers';

/** Consumidores do outbox do Luxchange — depósito (W20) e Request (W21) —, registrados pelo job `outbox` do platform. */
export function createLuxchangeConsumers({
  clock = systemClock,
}: { readonly clock?: Clock } = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return [
    ...buildDepositConsumers<DatabaseTransaction>({ clock, notify: recordNotification }),
    ...buildRequestConsumers<DatabaseTransaction>({ clock, notify: recordNotification }),
  ];
}
