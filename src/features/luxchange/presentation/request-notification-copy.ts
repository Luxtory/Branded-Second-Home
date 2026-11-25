import { REQUEST_CLOSURE_REASONS, type RequestClosureReason } from '../domain/request';
import {
  REQUEST_CLOSED_NOTIFICATION,
  REQUEST_RECEIVED_CLOSED_NOTIFICATION,
  REQUEST_RECEIVED_NOTIFICATION,
  REQUEST_SENT_NOTIFICATION,
} from '../application/request-consumers';
import { luxchangePaths } from '../paths';
import { formatCredits } from './deposit-format';
import type { DepositNotificationCopy } from './deposit-notification-copy';
import { requestMessages } from './i18n/request-pt-br';

type Format = {
  readonly date: (civil: string) => string;
  readonly instant: (iso: string) => string;
};

const DAY_MS = 86_400_000;
const str = (data: Readonly<Record<string, unknown>>, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : null;
const lastNight = (checkout: string) =>
  new Date(Date.parse(`${checkout}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const isReason = (value: string | null): value is RequestClosureReason =>
  value !== null && (REQUEST_CLOSURE_REASONS as readonly string[]).includes(value);

/**
 * Avisos da Request na central do Titular (REQ-097; spec luxchange §13.6), só com o que o consumidor grava: solicitante —
 * enviada (Garantia, datas comprometidas, Taxa paga, prazo) e encerrada (motivo, Garantia liberada, datas liberadas,
 * devolução solicitada — nunca "concluída"); solicitado — recebida e encerrada, sem dados do solicitante. `null` = outro
 * tipo ou dados desconhecidos. Notificação não cria direito nem prazo.
 */
export function requestNotificationCopy(
  kind: string,
  data: Readonly<Record<string, unknown>>,
  format: Format,
): DepositNotificationCopy | null {
  const text = requestMessages.notification;
  const [requestId, checkin, checkout] = [
    str(data, 'request_id'),
    str(data, 'checkin'),
    str(data, 'checkout'),
  ];
  if (requestId === null || checkin === null || checkout === null) return null;
  const dates = text.period(format.date(checkin), format.date(lastNight(checkout)));
  const expires = str(data, 'expires_at');
  switch (kind) {
    case REQUEST_SENT_NOTIFICATION: {
      const guarantee = str(data, 'guarantee_credits');
      const committed = typeof data.complement_nights === 'number' ? data.complement_nights : null;
      if (guarantee === null || expires === null || committed === null) return null;
      return {
        title: text.sent,
        what: text.sentWhat(dates),
        extra: [
          [text.guarantee, requestMessages.credits(formatCredits(guarantee))],
          [text.committed, text.committedCount(committed)],
          [text.fee, text.feePaid],
          [text.deadline, format.instant(expires)],
        ],
        href: luxchangePaths.request(requestId),
      };
    }
    case REQUEST_RECEIVED_NOTIFICATION:
      if (expires === null) return null;
      return {
        title: text.received,
        what: text.receivedWhat(dates),
        extra: [[text.deadline, format.instant(expires)]],
        href: luxchangePaths.requests,
      };
    case REQUEST_CLOSED_NOTIFICATION: {
      const reason = str(data, 'reason');
      const released = str(data, 'guarantee_released');
      if (!isReason(reason) || released === null) return null;
      return {
        title: text.closed,
        what: text.closedWhat(dates, requestMessages.reasons[reason].toLowerCase()),
        extra: [
          [text.released, requestMessages.credits(formatCredits(released))],
          [text.committed, text.releasedDates],
          [text.fee, text.feeRefund],
        ],
        href: luxchangePaths.request(requestId),
      };
    }
    case REQUEST_RECEIVED_CLOSED_NOTIFICATION:
      return {
        title: text.receivedClosed,
        what: text.receivedClosedWhat(dates),
        extra: [],
        href: luxchangePaths.requests,
      };
    default:
      return null;
  }
}
