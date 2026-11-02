import type { ErrorCode } from '@/features/platform';
import type { OwnUseBookingMessage, OwnUseBookingState } from './own-use-form-state';
import { ownUsePaths } from './own-use-paths';

/** Desfecho de uma tentativa de confirmação, como o executor (via `executeTitularCommand`) o entrega. */
export type OwnUseAttempt =
  | 'unavailable'
  | 'not_activated'
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'rejected'; readonly code: ErrorCode; readonly operationId: string | null }
  | { readonly status: 'committed'; readonly result: unknown };

export type OwnUseSubmission =
  | { readonly kind: 'redirect'; readonly to: string }
  | { readonly kind: 'state'; readonly state: OwnUseBookingState };

const MESSAGES: Partial<Record<ErrorCode, OwnUseBookingMessage>> = {
  ERR_PERMISSION: 'permission',
  ERR_STAY_LENGTH: 'stay_length',
  ERR_CAPACITY_UNAVAILABLE: 'capacity',
  ERR_BOOKING_CONFLICT: 'conflict',
  ERR_WINDOW_NOT_OPEN: 'window',
  ERR_USE_RIGHT_BALANCE: 'balance',
  ERR_VALIDATION: 'invalid',
  ERR_UNAVAILABLE: 'unavailable',
};

/**
 * Tradução do desfecho (ADR-0026 D6, corrigida na auditoria do PR #78): o resultado incerto se recupera só pela
 * idempotência do executor — a mesma chave devolve o resultado original (o guard confere a autoridade antes do replay e
 * a ativação não o bloqueia). Nada é inferido por Second Home e datas: um conflito é sempre conflito, mesmo que outra
 * holding representada pelo mesmo usuário tenha reserva nessas datas.
 * Incerto (`unavailable`) ou fechado mantém a chave, para o retry ser replay; recusa gravada a troca (intenção nova).
 */
export function translateOwnUseOutcome(
  state: OwnUseBookingState,
  attempt: OwnUseAttempt,
  newKey: () => string,
): OwnUseSubmission {
  if (attempt === 'unavailable')
    return { kind: 'state', state: { ...state, message: 'unavailable' } };
  if (attempt === 'not_activated') return { kind: 'state', state: { ...state, message: 'closed' } };
  if (attempt.status === 'unauthenticated') return { kind: 'redirect', to: ownUsePaths.login };
  if (attempt.status === 'rejected') {
    const key = attempt.operationId === null ? state.key : newKey();
    return { kind: 'state', state: { key, message: MESSAGES[attempt.code] ?? 'unexpected' } };
  }
  const bookingId = (attempt.result as { booking_id: string }).booking_id;
  return { kind: 'redirect', to: ownUsePaths.booking(bookingId) };
}
