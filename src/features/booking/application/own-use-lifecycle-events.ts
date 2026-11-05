import type { JsonObject, OutboxEventDraft } from '@/features/platform';

/**
 * Eventos do ciclo da reserva (AsyncAPI; REQ-097, TECH-091; spec booking §10.12, D7): um por transição que notifica,
 * `dedup_key = <tipo>:<id da transição>`. Só ids, datas, contagens e enums — nunca base registrada, referência do
 * incidente ou dado pessoal. Recuperação e solicitação não emitem.
 */
export const OWN_USE_BOOKING_CANCELLED = 'booking.own_use_cancelled';
export const OWN_USE_NO_SHOW_DECLARED = 'booking.own_use_no_show_declared';
export const OWN_USE_EXCEPTION_OPENED = 'booking.own_use_exception_opened';
export const OWN_USE_EXCEPTION_RESOLVED = 'booking.own_use_exception_resolved';
export const OWN_USE_BOOKING_INVALIDATED = 'booking.own_use_invalidated';

export type LifecycleEventType =
  | typeof OWN_USE_BOOKING_CANCELLED
  | typeof OWN_USE_NO_SHOW_DECLARED
  | typeof OWN_USE_EXCEPTION_OPENED
  | typeof OWN_USE_EXCEPTION_RESOLVED
  | typeof OWN_USE_BOOKING_INVALIDATED;

/** Noites por categoria do Direito de Uso (TECH-027). */
export interface NightsByBucket {
  readonly alta: number;
  readonly media: number;
  readonly leap: number;
}

export const lifecycleEvent = (
  type: LifecycleEventType,
  transitionId: string,
  payload: JsonObject,
): OutboxEventDraft => ({ type, dedupKey: `${type}:${transitionId}`, payload });

export const nightsJson = (nights: NightsByBucket | null): JsonObject | null =>
  nights === null ? null : { alta: nights.alta, media: nights.media, leap: nights.leap };
