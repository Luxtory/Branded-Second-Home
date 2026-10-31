'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeTitularCommand, requireTitularSession } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import { getDatabase, rootLogger, type ErrorCode } from '@/features/platform';
import { OwnUseBookingNotActivatedError } from '../application/create-own-use-booking';
import type { OwnUseBookingMessage, OwnUseBookingState } from './own-use-form-state';
import { createOwnUseBookingHandler } from './own-use-handler';
import { ownUsePaths } from './own-use-paths';
import { findConfirmedOwnUseBooking } from './own-use-read';

const handler = createOwnUseBookingHandler();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

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
 * Consulta somente leitura quando o resultado é incerto (indisponível, fechado ou conflito com chave nova): a reserva
 * confirmada destas datas, se a autorização vigente do usuário ainda a mostra (RLS). Sem sessão ou sem leitura, `null`.
 */
async function recovered(input: {
  second_home_id: string;
  checkin_date: string;
  checkout_date: string;
}): Promise<string | null> {
  const session = await requireTitularSession();
  if (session === 'unavailable') return null;
  try {
    return await findConfirmedOwnUseBooking(session.userId, {
      secondHomeId: input.second_home_id,
      checkinDate: input.checkin_date,
      checkoutDate: input.checkout_date,
    });
  } catch (error) {
    rootLogger.warn('own use booking recovery read failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    });
    return null;
  }
}

/**
 * "Confirmar reserva" (W12, spec booking): um único caminho — sessão verificada → guard do Titular → executor
 * (TECH-054) → `create_own_use_booking`. A action só traduz o resultado; nada de regra aqui. A ausência da ativação é
 * funcionalidade fechada (ADR-0026), registrada como tal, nunca como falha de autenticação.
 */
export async function createOwnUseBookingAction(
  state: OwnUseBookingState,
  form: FormData,
): Promise<OwnUseBookingState> {
  const input = {
    second_home_id: field(form, 'second_home_id'),
    checkin_date: field(form, 'checkin_date'),
    checkout_date: field(form, 'checkout_date'),
  };
  let outcome: Awaited<ReturnType<typeof executeTitularCommand>>;
  try {
    outcome = await executeTitularCommand(handler, input, state.key, {
      partyId: field(form, 'party_id'),
      holdings: createHoldingDirectory(() => getDatabase()),
    });
  } catch (error) {
    if (!(error instanceof OwnUseBookingNotActivatedError)) throw error;
    rootLogger.info('own use booking not activated', { command: 'create_own_use_booking' });
    const bookingId = await recovered(input);
    return bookingId === null
      ? { ...state, message: 'closed' }
      : { key: randomUUID(), message: 'already_confirmed', bookingId };
  }
  if (outcome === 'unavailable') {
    const bookingId = await recovered(input);
    return bookingId === null
      ? { ...state, message: 'unavailable' }
      : { key: randomUUID(), message: 'already_confirmed', bookingId };
  }
  if (outcome.status === 'unauthenticated') redirect(ownUsePaths.login);
  if (outcome.status === 'rejected') {
    if (outcome.code === 'ERR_BOOKING_CONFLICT') {
      const bookingId = await recovered(input);
      if (bookingId !== null) return { key: randomUUID(), message: 'already_confirmed', bookingId };
    }
    // Recusa antes da operação (validação, permissão, indisponível) mantém a chave; recusa gravada a troca.
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { key, message: MESSAGES[outcome.code] ?? 'unexpected' };
  }
  redirect(ownUsePaths.booking((outcome.result as { booking_id: string }).booking_id));
}
