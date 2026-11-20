import { z } from 'zod';
import type { Clock, OutboxConsumer } from '@/features/platform';
import { MEMBERSHIP_STATE_CHANGED, MEMBERSHIP_STATES } from '../domain/membership';

/** Tipo da notificação na central do Titular (REQ-097): mudança de elegibilidade do Membership. */
export const MEMBERSHIP_CHANGED_NOTIFICATION = 'identity.membership_changed';

const changed = z
  .object({
    membership_id: z.uuid(),
    recipient_party_id: z.uuid(),
    from_state: z.enum(MEMBERSHIP_STATES).nullable(),
    to_state: z.enum(MEMBERSHIP_STATES),
    changed_at: z.iso.datetime({ offset: true }),
  })
  .loose();

export interface MembershipConsumerDependencies<Tx> {
  readonly clock: Clock;
  readonly notify: (
    tx: Tx,
    draft: {
      readonly eventId: string;
      readonly recipientPartyId: string;
      readonly kind: string;
      readonly data: Record<string, string | null>;
      readonly at: Date;
    },
  ) => Promise<boolean>;
}

/**
 * Notificação à party do Membership (REQ-097, W15), vista por todos os seus representantes vigentes. Uma por transição:
 * o recibo do consumidor e a unicidade (evento, destinatário, tipo) impedem duplicata na reentrega (TECH-091). Só estados
 * e instante, nunca a base. Notificação não cria direito, prazo nem consequência econômica.
 */
export function buildMembershipConsumers<Tx>(
  deps: MembershipConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  return [
    {
      name: 'identity_membership_notification',
      eventTypes: [MEMBERSHIP_STATE_CHANGED],
      async handle(event, tx) {
        const payload = changed.parse(event.payload);
        await deps.notify(tx, {
          eventId: event.id,
          recipientPartyId: payload.recipient_party_id,
          kind: MEMBERSHIP_CHANGED_NOTIFICATION,
          data: {
            from_state: payload.from_state,
            to_state: payload.to_state,
            changed_at: payload.changed_at,
          },
          at: deps.clock.now(),
        });
      },
    },
  ];
}
