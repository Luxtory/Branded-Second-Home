import { z } from 'zod';
import type { Clock, OutboxConsumer } from '@/features/platform';
import { CREDITS_ORIGINATED } from './deposit-events';

/** Tipo da notificação na central do Titular (REQ-097): depósito concluído, com a originação do lote. */
export const DEPOSIT_COMPLETED_NOTIFICATION = 'luxchange.deposit_completed';

const date = z.iso.date();
const originated = z.strictObject({
  lot_id: z.uuid(),
  recipient_party_id: z.uuid(),
  second_home_id: z.uuid(),
  nights: z.number().int().min(1),
  first_night: date,
  last_night: date,
  credits: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/),
  expires_at: z.iso.datetime({ offset: true }),
});

export interface DepositConsumerDependencies<Tx> {
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
 * Notificação da originação pelo depósito (REQ-097, W20) à party que depositou, vista por todos os seus representantes
 * vigentes. Uma por evento: o recibo do consumidor e a unicidade (evento, destinatário, tipo) impedem duplicata na
 * reentrega (TECH-091). Só datas, contagem, quantidade, validade e a operação — nunca PRL nem dado pessoal. Recusa e
 * rollback não emitem evento. Notificação não cria direito, prazo nem consequência econômica.
 */
export function buildDepositConsumers<Tx>(
  deps: DepositConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  return [
    {
      name: 'luxchange_deposit_notification',
      eventTypes: [CREDITS_ORIGINATED],
      async handle(event, tx) {
        const payload = originated.parse(event.payload);
        await deps.notify(tx, {
          eventId: event.id,
          recipientPartyId: payload.recipient_party_id,
          kind: DEPOSIT_COMPLETED_NOTIFICATION,
          data: {
            second_home_id: payload.second_home_id,
            operation_id: event.operationId,
            nights: payload.nights,
            first_night: payload.first_night,
            last_night: payload.last_night,
            credits: payload.credits,
            expires_at: payload.expires_at,
          },
          at: deps.clock.now(),
        });
      },
    },
  ];
}
