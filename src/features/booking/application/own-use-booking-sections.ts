import type { BookingState, ExceptionType } from '../domain/own-use-lifecycle';

/**
 * Seções da lista de reservas do Titular (W13 E4b; spec booking §10.15). A situação exibida é sempre o estado gravado
 * (REQ-096); o relógio só separa, entre as reservas ainda confirmadas, as que já começaram das futuras — nunca cria
 * "Em uso" ou "Concluída" (o job é best effort e pode atrasar). Histórico só por transição registrada.
 */
export type BookingSection = 'in_progress' | 'attention' | 'upcoming' | 'history';

export const BOOKING_SECTIONS: readonly BookingSection[] = [
  'in_progress',
  'attention',
  'upcoming',
  'history',
];

const TERMINAL: readonly BookingState[] = ['completed', 'cancelled', 'no_show'];

export function bookingSection(
  state: BookingState,
  firstCheckinAt: Date,
  now: Date,
): BookingSection {
  if (TERMINAL.includes(state)) return 'history';
  if (state === 'in_exception') return 'attention';
  if (state === 'in_use') return 'in_progress';
  return now.getTime() >= firstCheckinAt.getTime() ? 'in_progress' : 'upcoming';
}

/** Situação exibida (REQ-096): "Em exceção" vira "Em exceção operacional" (P-A) ou "Em apuração" (P-B) pelo registro. */
export type DisplayState =
  | 'confirmed'
  | 'in_use'
  | 'completed'
  | 'cancelled_timely'
  | 'cancelled_late'
  | 'cancelled'
  | 'no_show'
  | 'operational_exception'
  | 'unauthorized_review';

export function displayState(
  state: BookingState,
  facts: {
    readonly exceptionType: ExceptionType | null;
    readonly cancellationClass: 'timely' | 'late' | null;
  },
): DisplayState {
  if (state === 'in_exception')
    return facts.exceptionType === 'unauthorized_booking'
      ? 'unauthorized_review'
      : 'operational_exception';
  if (state === 'cancelled') {
    if (facts.cancellationClass === 'timely') return 'cancelled_timely';
    if (facts.cancellationClass === 'late') return 'cancelled_late';
    return 'cancelled';
  }
  return state;
}
