'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand, exercisedRole, getStaffAccess } from '@/features/identity';
import { getDatabase, isNonPersonalReference, type ErrorCode } from '@/features/platform';
import { parseMoneyInput } from '../domain/money';
import { createPrlHandlers, MAX_PRL_NIGHTS } from '../prl';
import { localToInstant, nightsBetween } from './local-instant';
import { prlPath } from './prl-paths';
import type { PrlField, PrlFormKind, PrlFormState } from './prl-state';

const handlers = createPrlHandlers();

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_STATE_TRANSITION: 'vigency',
  ERR_PERMISSION: 'permission',
  ERR_NOT_FOUND: 'not_found',
  ERR_VALIDATION: 'invalid',
  ERR_UNAVAILABLE: 'unavailable',
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Publicação do PRL pela tela (W16; REQ-013; spec pricing §5): sessão verificada → guard (AAL2 e `staff_role`) → executor
 * (TECH-054). PRL inicial: Admin ou Super Admin (primeiro papel ativo); alteração: só Super Admin (BR-181). A action
 * expande o intervalo em noites, converte reais em unidade mínima e o horário da Second Home em instante; regras de
 * noite e vigência são do command e do banco.
 */
async function submit(
  kind: PrlFormKind,
  state: PrlFormState,
  form: FormData,
): Promise<PrlFormState> {
  const homeId = field(form, 'second_home_id');
  const values = {
    first_night: field(form, 'first_night'),
    last_night: field(form, 'last_night'),
    amount: field(form, 'amount'),
    effective_from: field(form, 'effective_from'),
    basis: field(form, 'basis'),
  };
  // Autoriza antes de qualquer leitura: mesmo critério dos portões Admin. O executor revalida tudo, inclusive no banco.
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  const allowed =
    access.kind === 'granted' &&
    (kind === 'change'
      ? exercisedRole(access, 'super_admin') !== null
      : exercisedRole(access, 'admin') !== null || exercisedRole(access, 'super_admin') !== null);
  if (!allowed) return { ...state, values, fieldErrors: {}, rejection: 'permission' };
  const home = await getDatabase()
    .selectFrom('app.second_home')
    .select('timezone')
    .where('id', '=', homeId)
    .executeTakeFirst();
  if (home === undefined) return { ...state, values, fieldErrors: {}, rejection: 'not_found' };

  const errors: Partial<Record<PrlField, true>> = {};
  const nights = nightsBetween(values.first_night, values.last_night, MAX_PRL_NIGHTS);
  if (nights === null) {
    errors.first_night = true;
    errors.last_night = true;
  }
  const amount = parseMoneyInput(values.amount);
  if (amount === null) errors.amount = true;
  const from =
    values.effective_from === '' ? null : localToInstant(values.effective_from, home.timezone);
  if (values.effective_from !== '' && from === null) errors.effective_from = true;
  if (values.basis === '' || values.basis.length > 255 || !isNonPersonalReference(values.basis))
    errors.basis = true;
  if (Object.keys(errors).length > 0 || nights === null || amount === null)
    return { ...state, values, fieldErrors: errors, rejection: 'invalid' };

  const outcome = await executeAdminCommand(
    kind === 'initial'
      ? { handler: handlers.publishInitialPrl, role: ['admin', 'super_admin'] }
      : { handler: handlers.changePublishedPrl, role: 'super_admin' },
    {
      second_home_id: homeId,
      nights: nights.map((stayDate) => ({ stay_date: stayDate, amount_minor: amount.toString() })),
      effective_from: from,
      basis: values.basis,
    },
    state.key,
  );
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed')
    redirect(`${prlPath(homeId)}?mes=${nights[0]!.slice(0, 7)}&feito=${kind}`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return { key, values, fieldErrors: {}, rejection: REJECTIONS[outcome.code] ?? 'unexpected' };
}

export async function publishInitialPrlAction(
  state: PrlFormState,
  form: FormData,
): Promise<PrlFormState> {
  return submit('initial', state, form);
}

export async function changePublishedPrlAction(
  state: PrlFormState,
  form: FormData,
): Promise<PrlFormState> {
  return submit('change', state, form);
}
