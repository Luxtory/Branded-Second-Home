'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeTitularCommand } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import { getDatabase, rootLogger } from '@/features/platform';
import { OwnUseBookingNotActivatedError } from '../application/create-own-use-booking';
import type { OwnUseBookingState } from './own-use-form-state';
import { createOwnUseBookingHandler } from './own-use-handler';
import { translateOwnUseOutcome, type OwnUseAttempt } from './own-use-outcome';

const handler = createOwnUseBookingHandler();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * "Confirmar reserva" (W12, spec booking): um único caminho — sessão verificada → guard do Titular → executor
 * (TECH-054) → `create_own_use_booking`. A action só traduz o resultado; nada de regra aqui. A ausência da ativação é
 * funcionalidade fechada (ADR-0026), registrada como tal, nunca como falha de autenticação. Resultado incerto: o retry
 * com a mesma chave é replay do executor (sem consulta por Second Home e datas).
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
  let attempt: OwnUseAttempt;
  try {
    attempt = await executeTitularCommand(handler, input, state.key, {
      partyId: field(form, 'party_id'),
      holdings: createHoldingDirectory(() => getDatabase()),
    });
  } catch (error) {
    if (!(error instanceof OwnUseBookingNotActivatedError)) throw error;
    rootLogger.info('own use booking not activated', { command: 'create_own_use_booking' });
    attempt = 'not_activated';
  }
  const submission = translateOwnUseOutcome(state, attempt, randomUUID);
  if (submission.kind === 'redirect') redirect(submission.to);
  return submission.state;
}
