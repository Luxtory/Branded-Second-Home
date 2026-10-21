'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { ActivationMessage, ActivationState } from './form-state';
import { createPartyHandlers } from './party-handlers';
import { titularPaths } from './party-paths';
import { executeTitularCommand } from './titular-command';

const handlers = createPartyHandlers();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

function messageFor(code: string): ActivationMessage {
  if (code === 'ERR_STATE_TRANSITION') return 'state';
  if (code === 'ERR_PERMISSION') return 'permission';
  if (code === 'ERR_UNAVAILABLE') return 'unavailable';
  return 'unexpected';
}

/** "Ativar representação": o próprio convidado, autenticado, ativa a delegação pendente (spec identity §13.4). */
export async function activateDelegationAction(
  state: ActivationState,
  form: FormData,
): Promise<ActivationState> {
  const outcome = await executeTitularCommand(
    handlers.activatePartyDelegation,
    { party_delegation_id: field(form, 'party_delegation_id') },
    state.key,
  );
  if (outcome === 'unavailable') return { ...state, message: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect(titularPaths.login);
  if (outcome.status === 'rejected') {
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { key, message: messageFor(outcome.code) };
  }
  redirect(titularPaths.activated);
}
