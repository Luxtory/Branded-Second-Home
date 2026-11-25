import { z } from 'zod';
import type { Clock, OutboxConsumer } from '@/features/platform';
import { REQUEST_CLOSURE_REASONS } from '../domain/request';
import { REQUEST_CLOSED, REQUEST_SENT } from './request-events';

/** Tipos das notificações da Request na central do Titular (REQ-097; spec luxchange §13.6). */
export const REQUEST_SENT_NOTIFICATION = 'luxchange.request_sent';
export const REQUEST_RECEIVED_NOTIFICATION = 'luxchange.request_received';
export const REQUEST_CLOSED_NOTIFICATION = 'luxchange.request_closed';
export const REQUEST_RECEIVED_CLOSED_NOTIFICATION = 'luxchange.request_received_closed';

const date = z.iso.date();
const credits = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/);
const instant = z.iso.datetime({ offset: true });
const sent = z.strictObject({
  request_id: z.uuid(),
  requester_party_id: z.uuid(),
  holder_party_id: z.uuid(),
  second_home_id: z.uuid(),
  checkin: date,
  checkout: date,
  credits_required: credits,
  guarantee_credits: credits,
  complement_credits: credits,
  complement_nights: z.number().int().min(0),
  expires_at: instant,
});
const closed = z.strictObject({
  request_id: z.uuid(),
  requester_party_id: z.uuid(),
  holder_party_id: z.uuid(),
  second_home_id: z.uuid(),
  checkin: date,
  checkout: date,
  state: z.enum(['expired', 'cancelled_pre_accept']),
  reason: z.enum(REQUEST_CLOSURE_REASONS),
  guarantee_released: credits,
  closed_at: instant,
});

export interface RequestConsumerDependencies<Tx> {
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
 * Notificações da Request (REQ-097, W21): ao solicitante — enviada (Garantia, datas comprometidas) e encerrada (motivo,
 * Garantia liberada, devolução da Taxa); ao solicitado — recebida (Second Home, datas, prazo) e encerrada (só o estado:
 * nunca o motivo, a party do solicitante, Créditos nem complemento). Uma por evento e destinatário (recibo do consumidor
 * e unicidade evento/destinatário/tipo, TECH-091). Notificação não cria direito, prazo nem consequência econômica.
 */
export function buildRequestConsumers<Tx>(
  deps: RequestConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  return [
    {
      name: 'luxchange_request_notification',
      eventTypes: [REQUEST_SENT, REQUEST_CLOSED],
      async handle(event, tx) {
        const at = deps.clock.now();
        const notify = (
          recipientPartyId: string,
          kind: string,
          data: Record<string, string | number>,
        ) => deps.notify(tx, { eventId: event.id, recipientPartyId, kind, data, at });
        if (event.type === REQUEST_SENT) {
          const payload = sent.parse(event.payload);
          const where = {
            request_id: payload.request_id,
            second_home_id: payload.second_home_id,
            checkin: payload.checkin,
            checkout: payload.checkout,
            expires_at: payload.expires_at,
          };
          await notify(payload.requester_party_id, REQUEST_SENT_NOTIFICATION, {
            ...where,
            credits_required: payload.credits_required,
            guarantee_credits: payload.guarantee_credits,
            complement_credits: payload.complement_credits,
            complement_nights: payload.complement_nights,
          });
          await notify(payload.holder_party_id, REQUEST_RECEIVED_NOTIFICATION, where);
          return;
        }
        const payload = closed.parse(event.payload);
        const where = {
          request_id: payload.request_id,
          second_home_id: payload.second_home_id,
          checkin: payload.checkin,
          checkout: payload.checkout,
          state: payload.state,
          closed_at: payload.closed_at,
        };
        await notify(payload.requester_party_id, REQUEST_CLOSED_NOTIFICATION, {
          ...where,
          reason: payload.reason,
          guarantee_released: payload.guarantee_released,
        });
        await notify(payload.holder_party_id, REQUEST_RECEIVED_CLOSED_NOTIFICATION, where);
      },
    },
  ];
}
