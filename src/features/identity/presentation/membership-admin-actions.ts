'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { membershipChangeInput } from '../application/membership-commands';
import { executeAdminCommand } from './admin-command';
import { createMembershipHandlers } from './membership-handlers';
import { partyFieldErrors, partyRejectionFor, type PartyFormState } from './party-form-state';
import { partyPaths, type MembershipAction } from './party-paths';

const handlers = createMembershipHandlers();
const HANDLER_FOR = {
  activate: handlers.activateMembership,
  suspend: handlers.suspendMembership,
  reactivate: handlers.reactivateMembership,
  end: handlers.endMembership,
} as const;

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

// Só as chaves próprias das quatro ações: `in` aceitaria herdadas do protótipo (`constructor`, `toString`, `__proto__`).
const isAction = (value: string): value is MembershipAction => Object.hasOwn(HANDLER_FOR, value);

/**
 * Mudança do Membership pelo Admin (W15): a mesma entrada da API — o executor autoriza (papel Admin, AAL2, atribuição
 * ativa) e o command revalida tudo na transação; a tela só mostra a recusa. Nada é lido antes do command.
 */
export async function changeMembershipAction(
  state: PartyFormState,
  form: FormData,
): Promise<PartyFormState> {
  const action = field(form, 'action');
  const values = { basis: field(form, 'basis') };
  const input = { party_id: field(form, 'party_id'), ...values };
  if (!isAction(action)) return { ...state, values, fieldErrors: {}, rejection: 'unexpected' };
  const parsed = membershipChangeInput.safeParse(input);
  if (!parsed.success)
    return { ...state, values, fieldErrors: partyFieldErrors(parsed.error), rejection: 'invalid' };
  const outcome = await executeAdminCommand(
    { handler: HANDLER_FOR[action], role: 'admin' },
    input,
    state.key,
  );
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'rejected') {
    // Recusa gravada consome a chave (o replay repetiria a recusa): o próximo envio leva uma nova.
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { ...state, key, values, fieldErrors: {}, rejection: partyRejectionFor(outcome.code) };
  }
  redirect(partyPaths.party(parsed.data.party_id, `membership_${action}`));
}
