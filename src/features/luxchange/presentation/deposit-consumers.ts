import {
  recordNotification,
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type OutboxConsumer,
} from '@/features/platform';
import { buildDepositConsumers } from '../application/deposit-consumers';
import {
  buildRequestClosureTrigger,
  buildRequestConsumers,
} from '../application/request-consumers';

/**
 * Consumidores do outbox do Luxchange — depósito (W20) e Request (W21) —, registrados pelo job `outbox` do platform.
 * `onRequestClosureDue`: com ele, o gatilho dos encerramentos por evento (ADR-0037 §7) avisa quem roda a varredura.
 */
export function createLuxchangeConsumers({
  clock = systemClock,
  onRequestClosureDue,
}: {
  readonly clock?: Clock;
  readonly onRequestClosureDue?: () => void;
} = {}): readonly OutboxConsumer<DatabaseTransaction>[] {
  return [
    ...buildDepositConsumers<DatabaseTransaction>({ clock, notify: recordNotification }),
    ...buildRequestConsumers<DatabaseTransaction>({ clock, notify: recordNotification }),
    ...(onRequestClosureDue === undefined
      ? []
      : [buildRequestClosureTrigger<DatabaseTransaction>(onRequestClosureDue)]),
  ];
}
