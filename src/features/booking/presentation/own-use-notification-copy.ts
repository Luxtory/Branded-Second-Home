import {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
} from '../application/own-use-lifecycle-events';
import { membershipNotificationCopy } from '@/features/identity';
import { depositNotificationCopy } from '@/features/luxchange/notifications';
import {
  lifecycleLabels,
  lifecycleNotificationMessages as text,
} from './i18n/own-use-lifecycle-pt-br';

/**
 * Texto de cada aviso da central (W13 E4b; REQ-097; spec booking §10.15): título curto + Second Home + "O que mudou",
 * só com os campos que o consumidor da E3 grava (nunca o payload inteiro, base registrada, referência do incidente ou
 * dado pessoal). Sem marcação de leitura. Notificação não cria direito, prazo nem consequência econômica.
 */
export const OWN_USE_CONFIRMED_KIND = 'booking.own_use_confirmed';

export type NotificationData = Readonly<Record<string, unknown>>;

export interface NotificationCopy {
  readonly title: string;
  readonly what: string;
  /** Linhas extras (ex.: saldo devolvido por categoria). */
  readonly extra: readonly (readonly [string, string])[];
  /** Destino do aviso quando não é uma reserva (W20: resultado do depósito Luxchange). */
  readonly href?: string;
}

export interface NotificationFormat {
  /** Data civil `YYYY-MM-DD` → `DD/MM/AAAA`. */
  readonly date: (civil: string) => string;
  /** Instante ISO → `DD/MM/AAAA às HH:MM` no fuso da Second Home. */
  readonly instant: (iso: string) => string;
}

const str = (data: NotificationData, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : null;
const num = (data: NotificationData, key: string) =>
  typeof data[key] === 'number' ? (data[key] as number) : null;

/** "Alta/Super Alta 3 · Média/Baixa 1" — só as categorias com noites. */
function buckets(data: NotificationData, prefix: string): string | null {
  const parts = (['alta', 'media', 'leap'] as const).flatMap((bucket) => {
    const count = num(data, `${prefix}_${bucket}`);
    return count === null || count === 0 ? [] : [`${lifecycleLabels.buckets[bucket]} ${count}`];
  });
  return parts.length === 0 ? null : parts.join(' · ');
}

const sentence = (...parts: readonly (string | null)[]) =>
  parts.filter((part): part is string => part !== null && part !== '').join(' ');

function cancelled(data: NotificationData, f: NotificationFormat): NotificationCopy | null {
  const n = num(data, 'released_nights');
  const first = str(data, 'first_released_date');
  if (n === null || first === null) return null;
  const owner = str(data, 'modality') === 'owner';
  const timely = str(data, 'cancellation_class') === 'timely';
  const byLuxtory = str(data, 'cause') === 'exception';
  const exceptionType = str(data, 'exception_type');
  const effect = owner
    ? text.returnedToOwner(n, f.date(first))
    : timely
      ? text.returnedToBalance(n, f.date(first))
      : text.leftReservation(n, f.date(first));
  const prefix = byLuxtory
    ? owner
      ? text.exceptionOwner
      : timely
        ? text.exceptionTimely
        : text.exceptionLate
    : owner
      ? null
      : timely
        ? text.timely
        : text.late;
  const closed =
    byLuxtory || exceptionType === null
      ? null
      : exceptionType === 'unauthorized_booking'
        ? text.reviewClosed
        : text.exceptionClosed;
  const returned = !owner && timely ? buckets(data, 'restored') : null;
  return {
    title: byLuxtory ? text.cancelledByLuxtoryTitle : text.cancelledTitle,
    what: sentence(prefix, effect, closed),
    extra: returned === null ? [] : [[text.returned, returned]],
  };
}

function noShow(data: NotificationData, f: NotificationFormat): NotificationCopy | null {
  const n = num(data, 'released_nights');
  if (n === null) return null;
  const first = str(data, 'first_released_date');
  if (n === 0 || first === null)
    return { title: text.noShowTitle, what: text.noShowNone, extra: [] };
  const owner = str(data, 'modality') === 'owner';
  return {
    title: text.noShowTitle,
    what: owner ? text.returnedToOwner(n, f.date(first)) : text.leftReservation(n, f.date(first)),
    extra: [],
  };
}

function opened(data: NotificationData, f: NotificationFormat): NotificationCopy | null {
  if (str(data, 'exception_type') === 'unauthorized_booking')
    return { title: text.openedReviewTitle, what: text.openedReview, extra: [] };
  const reason = lifecycleLabels.reasons[str(data, 'reason') ?? ''];
  if (reason === undefined) return null;
  const until = str(data, 'timely_until');
  return {
    title: text.openedOperationalTitle,
    what: sentence(
      text.openedReason(reason),
      until === null ? null : text.openedDeadline(f.instant(until)),
    ),
    extra: [],
  };
}

function resolved(data: NotificationData): NotificationCopy | null {
  const outcome = str(data, 'outcome');
  if (outcome !== 'confirmed' && outcome !== 'completed') return null;
  const result = outcome === 'confirmed' ? text.resolvedConfirmed : text.resolvedCompleted;
  return str(data, 'exception_type') === 'unauthorized_booking'
    ? {
        title: text.resolvedReviewTitle,
        what: sentence(text.resolvedReviewPrefix, result),
        extra: [],
      }
    : { title: text.resolvedOperationalTitle, what: result, extra: [] };
}

function invalidated(data: NotificationData, f: NotificationFormat): NotificationCopy | null {
  const n = num(data, 'released_nights');
  const first = str(data, 'first_released_date');
  if (n === null || first === null) return null;
  const owner = str(data, 'modality') === 'owner';
  const corrected = owner ? null : buckets(data, 'corrected');
  return {
    title: text.invalidatedTitle,
    what: sentence(
      text.invalidatedPrefix,
      owner ? text.returnedToOwner(n, f.date(first)) : text.invalidatedBalance(n, f.date(first)),
    ),
    extra: corrected === null ? [] : [[text.corrected, corrected]],
  };
}

function confirmed(data: NotificationData, f: NotificationFormat): NotificationCopy | null {
  const checkin = str(data, 'checkin_date');
  const checkout = str(data, 'checkout_date');
  const n = num(data, 'nights');
  if (checkin === null || checkout === null || n === null) return null;
  return {
    title: text.confirmedTitle,
    what: text.confirmed(f.date(checkin), f.date(checkout), n),
    extra: [],
  };
}

/** Texto do aviso, ou `null` quando o tipo ou os dados não são conhecidos (a central mostra o aviso genérico). */
export function notificationCopy(
  kind: string,
  data: NotificationData,
  format: NotificationFormat,
): NotificationCopy | null {
  switch (kind) {
    case OWN_USE_CONFIRMED_KIND:
      return confirmed(data, format);
    case OWN_USE_BOOKING_CANCELLED:
      return cancelled(data, format);
    case OWN_USE_NO_SHOW_DECLARED:
      return noShow(data, format);
    case OWN_USE_EXCEPTION_OPENED:
      return opened(data, format);
    case OWN_USE_EXCEPTION_RESOLVED:
      return resolved(data);
    case OWN_USE_BOOKING_INVALIDATED:
      return invalidated(data, format);
    default:
      // W15: mudança do Membership (texto do identity); W20: depósito Luxchange; outros tipos → aviso genérico.
      return (
        depositNotificationCopy(kind, data, format) ??
        membershipNotificationCopy(kind, data, format.instant)
      );
  }
}
