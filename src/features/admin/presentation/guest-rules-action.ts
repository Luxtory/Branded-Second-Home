'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand, exercisedRole, getStaffAccess } from '@/features/identity';
import { getDatabase, isNonPersonalReference, type ErrorCode } from '@/features/platform';
import { createParameterHandlers, GUEST_RULES_MAX_LENGTH } from '../parameters';
import { guestRulesPath } from './guest-rules-paths';
import type { GuestRulesField, GuestRulesState } from './guest-rules-state';
import { localToInstant } from './local-instant';

const handlers = createParameterHandlers();

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_STATE_TRANSITION: 'vigency',
  ERR_PERMISSION: 'permission',
  ERR_NOT_FOUND: 'not_found',
  ERR_VALIDATION: 'invalid',
  ERR_UNAVAILABLE: 'unavailable',
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * "Publicar versão" (W14; REQ-095; spec admin §13): sessão verificada → guard Admin (AAL2 e `staff_role`) → executor
 * (TECH-054) → `set_parameter`. A action converte o horário da Second Home em instante, associa erros aos campos e
 * traduz o desfecho; a vigência (D3) é decidida pelo command e pelo banco.
 */
export async function setGuestRulesAction(
  state: GuestRulesState,
  form: FormData,
): Promise<GuestRulesState> {
  const homeId = field(form, 'second_home_id');
  const values = {
    value: field(form, 'value'),
    effective_from: field(form, 'effective_from').trim(),
    effective_to: field(form, 'effective_to').trim(),
    basis: field(form, 'basis').trim(),
  };
  // Autoriza antes de qualquer leitura (o proxy não autoriza nada): mesmo critério dos portões Admin — sessão, AAL2 e
  // papel `admin` exercido. O executor revalida tudo, inclusive no banco.
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (access.kind !== 'granted' || exercisedRole(access, 'admin') === null)
    return { ...state, values, fieldErrors: {}, rejection: 'permission' };
  const home = await getDatabase()
    .selectFrom('app.second_home')
    .select('timezone')
    .where('id', '=', homeId)
    .executeTakeFirst();
  if (home === undefined) return { ...state, values, fieldErrors: {}, rejection: 'not_found' };
  const errors: Partial<Record<GuestRulesField, true>> = {};
  const text = values.value.trim();
  if (text === '' || text.length > GUEST_RULES_MAX_LENGTH) errors.value = true;
  const from =
    values.effective_from === '' ? null : localToInstant(values.effective_from, home.timezone);
  const to = values.effective_to === '' ? null : localToInstant(values.effective_to, home.timezone);
  if (values.effective_from !== '' && from === null) errors.effective_from = true;
  if (
    values.effective_to !== '' &&
    (to === null || (from !== null && Date.parse(to) <= Date.parse(from)))
  )
    errors.effective_to = true;
  if (values.basis === '' || values.basis.length > 255 || !isNonPersonalReference(values.basis))
    errors.basis = true;
  if (Object.keys(errors).length > 0)
    return { ...state, values, fieldErrors: errors, rejection: 'invalid' };
  const outcome = await executeAdminCommand(
    { handler: handlers.setParameter, role: 'admin' },
    {
      second_home_id: homeId,
      key: 'guest_rules',
      value: text,
      effective_from: from,
      effective_to: to,
      basis: values.basis,
    },
    state.key,
  );
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed') redirect(`${guestRulesPath(homeId)}?feito=1`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return { key, values, fieldErrors: {}, rejection: REJECTIONS[outcome.code] ?? 'unexpected' };
}
