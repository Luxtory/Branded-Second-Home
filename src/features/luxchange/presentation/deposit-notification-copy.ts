import { DEPOSIT_COMPLETED_NOTIFICATION } from '../application/deposit-consumers';
import { luxchangePaths } from '../paths';
import { formatCredits, operationCode } from './deposit-format';
import { depositMessages } from './i18n/deposit-pt-br';

/** Texto de um aviso da central do Titular (mesma forma do `NotificationCopy` da central), com o link do resultado. */
export interface DepositNotificationCopy {
  readonly title: string;
  readonly what: string;
  readonly extra: readonly (readonly [string, string])[];
  readonly href: string;
}

const str = (data: Readonly<Record<string, unknown>>, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : null;

/**
 * Aviso do depósito concluído (REQ-097, W20) para a central, só com o que o consumidor grava (datas, contagem,
 * quantidade, validade, operação); `null` = outro tipo ou dados desconhecidos. Notificação não cria direito nem prazo.
 */
export function depositNotificationCopy(
  kind: string,
  data: Readonly<Record<string, unknown>>,
  format: { readonly date: (civil: string) => string; readonly instant: (iso: string) => string },
): DepositNotificationCopy | null {
  if (kind !== DEPOSIT_COMPLETED_NOTIFICATION) return null;
  const nights = typeof data.nights === 'number' ? data.nights : null;
  const [credits, first, last, expires, operation] = [
    str(data, 'credits'),
    str(data, 'first_night'),
    str(data, 'last_night'),
    str(data, 'expires_at'),
    str(data, 'operation_id'),
  ];
  if (
    nights === null ||
    credits === null ||
    first === null ||
    last === null ||
    expires === null ||
    operation === null
  )
    return null;
  const text = depositMessages.notification;
  return {
    title: text.title,
    what: text.what(nights, formatCredits(credits), format.date(first), format.date(last)),
    extra: [
      [text.validity, format.instant(expires)],
      [text.reference, operationCode(operation)],
    ],
    href: luxchangePaths.depositResult(operation),
  };
}
