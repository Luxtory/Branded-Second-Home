'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeTitularCommand } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import {
  CapabilityNotActivatedError,
  getDatabase,
  rootLogger,
  type ErrorCode,
} from '@/features/platform';
import { createGuestNominationHandlers } from './guest-nomination-handlers';
import type { GuestNominationOutcome, GuestNominationState } from './guest-nomination-state';
import { ownUsePaths } from './own-use-paths';

const handlers = createGuestNominationHandlers();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const OUTCOMES: Partial<Record<ErrorCode, GuestNominationOutcome>> = {
  ERR_PERMISSION: 'permission',
  ERR_STATE_TRANSITION: 'state',
  ERR_PARAMETER_MISSING: 'missing',
};

/**
 * "Declarar uso por convidados" (W14; REQ-092; spec booking §11): sessão verificada → guard do Titular → executor
 * (TECH-054) → `nominate_guest` com a versão de `guest_rules` exibida. A action só traduz o desfecho: regras mudaram →
 * a página relê as regras atuais (nada gravado); declarado → página com o aviso; resultado incerto → mesma chave.
 */
export async function nominateGuestAction(
  state: GuestNominationState,
  form: FormData,
): Promise<GuestNominationState> {
  if (field(form, 'accept') !== 'on') return { ...state, outcome: 'accept' };
  const bookingId = field(form, 'booking_id');
  const input = {
    second_home_id: field(form, 'second_home_id'),
    booking_id: bookingId,
    guest_rules_id: field(form, 'guest_rules_id'),
  };
  let attempt: Awaited<ReturnType<typeof executeTitularCommand>>;
  try {
    attempt = await executeTitularCommand(handlers.nominateGuest, input, state.key, {
      partyId: field(form, 'party_id'),
      holdings: createHoldingDirectory(() => getDatabase()),
    });
  } catch (error) {
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    rootLogger.info('guest nomination closed', { command: 'nominate_guest' });
    return { ...state, outcome: 'closed' };
  }
  if (attempt === 'unavailable') return { ...state, outcome: 'unavailable' };
  if (attempt.status === 'unauthenticated') redirect(ownUsePaths.login);
  if (attempt.status === 'committed') redirect(`${ownUsePaths.guests(bookingId)}?declarado=1`);
  if (attempt.code === 'ERR_GUEST_RULES_CHANGED')
    redirect(`${ownUsePaths.guests(bookingId)}?regras=mudaram`);
  const key = attempt.operationId === null ? state.key : randomUUID();
  return { key, outcome: OUTCOMES[attempt.code] ?? 'unexpected' };
}
