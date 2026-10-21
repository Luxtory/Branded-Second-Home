'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { unavailableKeys, type JsonValue } from '@/features/platform';
import {
  createPartyDelegationInput,
  partyDocumentInput,
  registerPartyInput,
  revokePartyDelegationInput,
} from '../application/party-commands';
import { exercisedRole } from '../application/staff-access';
import { executeAdminCommand, type AdminCommand } from './admin-command';
import { lookupPartyByDocument } from './party-admin-read';
import {
  partyFieldErrors,
  partyRejectionFor,
  type PartyFieldError,
  type PartyFormState,
} from './party-form-state';
import { createPartyHandlers } from './party-handlers';
import { partyPaths } from './party-paths';
import { getStaffAccess } from './staff-access';

const handlers = createPartyHandlers();

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const present = (value: string): string | undefined => (value.trim() === '' ? undefined : value);

interface Submission<I, R extends JsonValue> {
  readonly state: PartyFormState;
  readonly command: AdminCommand<I, R>;
  readonly input: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly success: (result: R) => string;
}

/** Mesma entrada da API (ADR-0010 §6): o command decide e revalida tudo; a tela só mostra o erro no campo. */
async function submit<I, R extends JsonValue>({
  state,
  command,
  input,
  values,
  success,
}: Submission<I, R>): Promise<PartyFormState> {
  const outcome = await executeAdminCommand(command, input, state.key);
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'rejected') {
    // Recusa gravada consome a chave (o replay repetiria a recusa): o próximo envio leva uma nova.
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { ...state, key, values, fieldErrors: {}, rejection: partyRejectionFor(outcome.code) };
  }
  redirect(success(outcome.result));
}

const invalid = (
  state: PartyFormState,
  values: Record<string, string>,
  fieldErrors: Record<string, PartyFieldError>,
  step: PartyFormState['step'] = 'edit',
): PartyFormState => ({ ...state, values, fieldErrors, rejection: 'invalid', step });

/** `register_party`: CPF ou CNPJ → detalhe da parte nova. */
export async function registerPartyAction(
  state: PartyFormState,
  form: FormData,
): Promise<PartyFormState> {
  const values = { document: field(form, 'document') };
  const parsed = registerPartyInput.safeParse(values);
  if (!parsed.success) return invalid(state, values, partyFieldErrors(parsed.error));
  return submit({
    state,
    command: { handler: handlers.registerParty, role: 'admin' },
    input: values,
    values,
    success: (result) => partyPaths.party(result.id, 'registered'),
  });
}

/**
 * Busca por CPF/CNPJ por POST (o documento nunca vai ao endereço nem aos logs de acesso): HMAC em todas as chaves,
 * `admin_read` com o id achado ou `not_found`.
 */
export async function searchPartyAction(
  state: PartyFormState,
  form: FormData,
): Promise<PartyFormState> {
  const values = { document: field(form, 'document') };
  const parsed = z.strictObject({ document: partyDocumentInput }).safeParse(values);
  if (!parsed.success) return invalid(state, values, partyFieldErrors(parsed.error));
  const access = await getStaffAccess();
  if (access.kind === 'unavailable') return { ...state, values, rejection: 'unavailable' };
  const exercised = access.kind === 'granted' ? exercisedRole(access, 'admin') : null;
  if (access.kind !== 'granted' || exercised === null) {
    return { ...state, values, rejection: 'permission' };
  }
  const session = { userId: access.userId, roles: access.roles, ...exercised };
  let partyId: string | null;
  try {
    partyId = await lookupPartyByDocument(session, parsed.data.document);
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return { ...state, values, rejection: 'unavailable' };
  }
  if (partyId === null)
    return { ...state, values, fieldErrors: {}, rejection: null, notFound: true };
  redirect(partyPaths.party(partyId));
}

const INVITE_FIELDS = ['email', 'email_confirmation', 'valid_until', 'valid_until_local', 'basis'];

/** Valida o convite sem executar (passo 1 → resumo); e-mails diferentes ou fim no passado ficam no campo. */
function reviewInvite(partyId: string, values: Record<string, string>) {
  const input = {
    party_id: partyId,
    email: values.email,
    valid_until: present(values.valid_until ?? ''),
    basis: values.basis,
  };
  const parsed = createPartyDelegationInput.safeParse(input);
  const errors = parsed.success ? {} : partyFieldErrors(parsed.error);
  const typed = (values.email ?? '').trim().toLowerCase();
  if (
    errors.email === undefined &&
    typed !== (values.email_confirmation ?? '').trim().toLowerCase()
  ) {
    errors.email_confirmation = 'email_mismatch';
  }
  if (
    input.valid_until !== undefined &&
    errors.valid_until === undefined &&
    Date.parse(input.valid_until) <= Date.now()
  ) {
    errors.valid_until = 'not_in_future';
  }
  return { input, errors };
}

/**
 * Convite em dois passos (spec identity §13.4): dados → resumo com o e-mail para conferência visual e o documento
 * mascarado → `create_party_delegation`. "Corrigir" volta ao passo 1 com os valores.
 */
export async function inviteRepresentativeAction(
  state: PartyFormState,
  form: FormData,
): Promise<PartyFormState> {
  const partyId = field(form, 'party_id');
  const values = Object.fromEntries(INVITE_FIELDS.map((name) => [name, field(form, name)]));
  const intent = field(form, 'intent');
  if (intent === 'edit')
    return { ...state, values, fieldErrors: {}, rejection: null, step: 'edit' };
  const { input, errors } = reviewInvite(partyId, values);
  if (Object.keys(errors).length > 0) return invalid(state, values, errors);
  if (intent !== 'confirm')
    return { ...state, values, fieldErrors: {}, rejection: null, step: 'review' };
  return submit({
    state: { ...state, step: 'review' },
    command: { handler: handlers.createPartyDelegation, role: 'admin' },
    input,
    values,
    success: () => partyPaths.party(partyId, 'invited'),
  });
}

/** `revoke_party_delegation`, com a base. */
export async function revokeDelegationAction(
  state: PartyFormState,
  form: FormData,
): Promise<PartyFormState> {
  const partyId = field(form, 'party_id');
  const values = { revocation_basis: field(form, 'revocation_basis') };
  const input = { party_delegation_id: field(form, 'party_delegation_id'), ...values };
  const parsed = revokePartyDelegationInput.safeParse(input);
  if (!parsed.success) return invalid(state, values, partyFieldErrors(parsed.error));
  return submit({
    state,
    command: { handler: handlers.revokePartyDelegation, role: 'admin' },
    input,
    values,
    success: () => partyPaths.party(partyId, 'revoked'),
  });
}
