import { z } from 'zod';
import type { Clock, OutboxConsumer } from '@/features/platform';
import { REQUEST_CLOSING_STATES, REQUEST_CLOSURE_REASONS } from '../domain/request';
import { REQUEST_ACCEPTED, REQUEST_CLOSED, REQUEST_SENT } from './request-events';

/** Tipos das notificações da Request na central do Titular (REQ-097; spec luxchange §13.6). */
export const REQUEST_SENT_NOTIFICATION = 'luxchange.request_sent';
export const REQUEST_RECEIVED_NOTIFICATION = 'luxchange.request_received';
export const REQUEST_CLOSED_NOTIFICATION = 'luxchange.request_closed';
export const REQUEST_RECEIVED_CLOSED_NOTIFICATION = 'luxchange.request_received_closed';
export const REQUEST_ACCEPTED_NOTIFICATION = 'luxchange.request_accepted';
export const REQUEST_RECEIVED_ACCEPTED_NOTIFICATION = 'luxchange.request_received_accepted';

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
  state: z.enum(REQUEST_CLOSING_STATES),
  reason: z.enum(REQUEST_CLOSURE_REASONS),
  guarantee_released: credits,
  closed_at: instant,
});
const accepted = z.strictObject({
  request_id: z.uuid(),
  requester_party_id: z.uuid(),
  holder_party_id: z.uuid(),
  second_home_id: z.uuid(),
  booking_id: z.uuid(),
  checkin: date,
  checkout: date,
  credits_required: credits,
  guarantee_credits: credits,
  complement_credits: credits,
  complement_consumption: credits,
  complement_excess: credits,
  holder_credits: credits,
  holder_credit_expires_at: instant,
  complement_credit_expires_at: instant.optional(),
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
      eventTypes: [REQUEST_SENT, REQUEST_CLOSED, REQUEST_ACCEPTED],
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
        if (event.type === REQUEST_ACCEPTED) {
          const payload = accepted.parse(event.payload);
          const stay = {
            request_id: payload.request_id,
            second_home_id: payload.second_home_id,
            checkin: payload.checkin,
            checkout: payload.checkout,
          };
          await notify(payload.requester_party_id, REQUEST_ACCEPTED_NOTIFICATION, {
            ...stay,
            booking_id: payload.booking_id,
            credits_required: payload.credits_required,
            guarantee_credits: payload.guarantee_credits,
            complement_consumption: payload.complement_consumption,
            complement_excess: payload.complement_excess,
            ...(payload.complement_credit_expires_at === undefined
              ? {}
              : { complement_credit_expires_at: payload.complement_credit_expires_at }),
          });
          await notify(payload.holder_party_id, REQUEST_RECEIVED_ACCEPTED_NOTIFICATION, {
            ...stay,
            holder_credits: payload.holder_credits,
            holder_credit_expires_at: payload.holder_credit_expires_at,
          });
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

/**
 * Eventos (contratos do AsyncAPI) cujo fato pode tirar a elegibilidade de uma Request pendente (ADR-0037 §5, §7):
 * Membership, reserva de uso próprio (confirmação, cancelamento, no-show, exceção, invalidação), depósito (custódia
 * cedida) e Request nova (compromisso sobre capacidade solicitada por outra).
 */
export const REQUEST_ELIGIBILITY_EVENTS = [
  'identity.membership_state_changed',
  'booking.own_use_confirmed',
  'booking.own_use_cancelled',
  'booking.own_use_no_show_declared',
  'booking.own_use_exception_opened',
  'booking.own_use_exception_resolved',
  'booking.own_use_invalidated',
  'luxchange.credits_originated',
  REQUEST_SENT,
] as const;

/**
 * Gatilho dos encerramentos por evento (ADR-0037 §7): só anota, na varredura do outbox, que houve evento relevante —
 * nada é gravado nem executado na transação de entrega. Quem roda a varredura executa os encerramentos depois dela, pelo
 * executor (job `expire_requests`), uma vez por varredura.
 */
export function buildRequestClosureTrigger<Tx>(onRelevant: () => void): OutboxConsumer<Tx> {
  return {
    name: 'luxchange_request_closure_trigger',
    eventTypes: REQUEST_ELIGIBILITY_EVENTS,
    async handle() {
      onRelevant();
    },
  };
}
