import {
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildDepositConsumers } from '../application/deposit-consumers';

/** Consumidores do outbox do depósito Luxchange (W20), registrados pelo job `outbox` do platform. */
export function createLuxchangeConsumers({
  clock = systemClock,
}: { readonly clock?: Clock } = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return buildDepositConsumers<DatabaseTransaction>({ clock, notify: recordNotification });
}
