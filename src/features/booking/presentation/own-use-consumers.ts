import {
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildOwnUseConsumers } from '../application/own-use-consumers';

/** Consumidores do outbox da reserva de uso próprio (W12), registrados pelo job `outbox` do platform. */
export function createOwnUseBookingConsumers({
  clock = systemClock,
}: { readonly clock?: Clock } = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return buildOwnUseConsumers<DatabaseTransaction>({ clock, notify: recordNotification });
}
