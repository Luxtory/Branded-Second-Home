'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeTitularCommand } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import { CapabilityNotActivatedError, getDatabase, rootLogger } from '@/features/platform';
import type { OwnUseCancelState } from './own-use-cancel-state';
import { createOwnUseLifecycleHandlers } from './own-use-lifecycle-handlers';
import { ownUsePaths } from './own-use-paths';

const handlers = createOwnUseLifecycleHandlers();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * "Confirmar cancelamento" (W13 E4b; spec booking §10.15): sessão verificada → guard do Titular → executor (TECH-054)
 * → `cancel_own_use_booking` com os termos da prévia (D7). A action só traduz o desfecho — nada de regra aqui:
 * termos alterados → nova prévia (nada cancelado, nenhuma ação destrutiva com a prévia anterior); reserva alterada →
 * detalhe; ações do ciclo fechadas (K2) → estado fechado, nada gravado; resultado incerto → mesma chave (replay).
 */
export async function cancelOwnUseBookingAction(
  state: OwnUseCancelState,
  form: FormData,
): Promise<OwnUseCancelState> {
  const bookingId = field(form, 'booking_id');
  const expectedClass = field(form, 'expected_cancellation_class');
  const expectedFirst = field(form, 'expected_first_affected_date');
  const input = {
    second_home_id: field(form, 'second_home_id'),
    booking_id: bookingId,
    expected_cancellation_class: expectedClass === '' ? null : expectedClass,
    expected_first_affected_date: expectedFirst,
  };
  let attempt: Awaited<ReturnType<typeof executeTitularCommand>>;
  try {
    attempt = await executeTitularCommand(handlers.cancelOwnUseBooking, input, state.key, {
      partyId: field(form, 'party_id'),
      holdings: createHoldingDirectory(() => getDatabase()),
    });
  } catch (error) {
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    rootLogger.info('own use lifecycle not activated', { command: 'cancel_own_use_booking' });
    return { ...state, outcome: 'closed' };
  }
  if (attempt === 'unavailable') return { ...state, outcome: 'unavailable' };
  if (attempt.status === 'unauthenticated') redirect(ownUsePaths.login);
  if (attempt.status === 'committed') redirect(`${ownUsePaths.booking(bookingId)}?cancelada=1`);
  // Os termos enviados não voltam à tela: vieram do navegador e não provam a prévia anterior.
  if (attempt.code === 'ERR_CANCELLATION_TERMS_CHANGED')
    redirect(`${ownUsePaths.cancellation(bookingId)}?condicoes=mudaram`);
  if (attempt.code === 'ERR_STATE_TRANSITION')
    redirect(`${ownUsePaths.booking(bookingId)}?aviso=nada-cancelado`);
  // Recusa gravada consome a chave (o replay repetiria a recusa): a próxima tentativa leva uma nova.
  const key = attempt.operationId === null ? state.key : randomUUID();
  return { key, outcome: attempt.code === 'ERR_PERMISSION' ? 'permission' : 'unexpected' };
}
