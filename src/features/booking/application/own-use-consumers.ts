import { z } from 'zod';
import type { Clock, OutboxConsumer } from '@/features/platform';
import { OWN_USE_BOOKING_CONFIRMED } from './create-own-use-booking';
import { buildOwnUseLifecycleConsumers } from './own-use-lifecycle-consumers';

/** Tipo da notificação de confirmação na central do Titular (REQ-097). */
export const OWN_USE_BOOKING_CONFIRMED_NOTIFICATION = 'booking.own_use_confirmed';

const confirmed = z
  .object({
    booking_id: z.uuid(),
    second_home_id: z.uuid(),
    recipient_party_id: z.uuid(),
    checkin_date: z.iso.date(),
    checkout_date: z.iso.date(),
    nights: z.number().int().min(1),
  })
  .loose();

export interface OwnUseConsumerDependencies<Tx> {
  readonly clock: Clock;
  readonly notify: (
    tx: Tx,
    draft: {
      readonly eventId: string;
      readonly recipientPartyId: string;
      readonly kind: string;
      readonly data: Record<string, string | number>;
      readonly at: Date;
    },
  ) => Promise<boolean>;
}

/**
 * Notificação da confirmação (REQ-097; alcança também Titular sem Membership) à party que reservou, fixada no evento no
 * COMMIT — não aos titulares vigentes na entrega: a confirmação é um ato, não um direito da Ação, e continua de quem
 * reservou numa transferência futura (D6). Só ids, datas e números. Notificação não cria direito nem prazo.
 */
function confirmation<Tx>(deps: OwnUseConsumerDependencies<Tx>): OutboxConsumer<Tx> {
  return {
    name: 'booking_own_use_confirmation_notification',
    eventTypes: [OWN_USE_BOOKING_CONFIRMED],
    async handle(event, tx) {
      const payload = confirmed.parse(event.payload);
      await deps.notify(tx, {
        eventId: event.id,
        recipientPartyId: payload.recipient_party_id,
        kind: OWN_USE_BOOKING_CONFIRMED_NOTIFICATION,
        data: {
          booking_id: payload.booking_id,
          second_home_id: payload.second_home_id,
          checkin_date: payload.checkin_date,
          checkout_date: payload.checkout_date,
          nights: payload.nights,
        },
        at: deps.clock.now(),
      });
    },
  };
}

export function buildOwnUseConsumers<Tx>(
  deps: OwnUseConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  // W13 E3: as cinco notificações do ciclo da reserva.
  return [confirmation(deps), ...buildOwnUseLifecycleConsumers(deps)];
}
