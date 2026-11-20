import {
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildMembershipConsumers } from '../application/membership-consumers';

/** Consumidores do outbox do Membership (W15), registrados pelo job `outbox` do platform. */
export function createMembershipConsumers({
  clock = systemClock,
}: { readonly clock?: Clock } = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return buildMembershipConsumers<DatabaseTransaction>({ clock, notify: recordNotification });
}
