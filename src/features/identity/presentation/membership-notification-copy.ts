import { MEMBERSHIP_CHANGED_NOTIFICATION } from '../application/membership-consumers';
import { MEMBERSHIP_STATES, type MembershipState } from '../domain/membership';
import { membershipNotificationMessages as text, membershipStates } from './i18n/membership-pt-br';

/** Texto de um aviso da central do Titular (mesma forma do `NotificationCopy` da central). */
export interface MembershipNotificationCopy {
  readonly title: string;
  readonly what: string;
  readonly extra: readonly (readonly [string, string])[];
}

const stateOf = (value: unknown): MembershipState | null =>
  MEMBERSHIP_STATES.find((state) => state === value) ?? null;

/**
 * Aviso de mudança do Membership (REQ-097, W15) para a central, só com o que o consumidor grava (estados e instante);
 * `null` = outro tipo ou dados desconhecidos (a central mostra o aviso genérico). Notificação não cria direito nem prazo.
 */
export function membershipNotificationCopy(
  kind: string,
  data: Readonly<Record<string, unknown>>,
  instant: (iso: string) => string,
): MembershipNotificationCopy | null {
  if (kind !== MEMBERSHIP_CHANGED_NOTIFICATION) return null;
  const to = stateOf(data.to_state);
  const from = data.from_state === null ? null : stateOf(data.from_state);
  if (to === null || typeof data.changed_at !== 'string') return null;
  const title =
    to === 'suspended'
      ? text.suspended
      : to === 'ended'
        ? text.ended
        : from === null
          ? text.activated
          : text.reactivated;
  return { title, what: text.what(membershipStates[to], instant(data.changed_at)), extra: [] };
}
