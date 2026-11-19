'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand } from '@/features/identity';
import {
  CapabilityNotActivatedError,
  isNonPersonalReference,
  rootLogger,
  type ErrorCode,
} from '@/features/platform';
import {
  civilDatesBetween,
  createLuxtorySelectionHandlers,
  MAX_SELECTION_NIGHTS,
} from '../luxtory-selection';
import { selectionPath } from './luxtory-selection-paths';
import type { LuxtorySelectionField, LuxtorySelectionState } from './luxtory-selection-state';

const handlers = createLuxtorySelectionHandlers();
const PURPOSES = ['maintenance', 'marketing', 'promotion', 'production', 'inventory'];

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_WINDOW_NOT_OPEN: 'window',
  ERR_USE_RIGHT_BALANCE: 'limit',
  ERR_CAPACITY_UNAVAILABLE: 'nights',
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
 * "Selecionar noites" (W14; REQ-036; spec calendar §9): sessão verificada → guard Admin (AAL2 e `staff_role`) →
 * executor (TECH-054) → `select_luxtory_capacity`. A action monta as noites do intervalo com a finalidade escolhida,
 * associa erros aos campos e traduz o desfecho — nada de regra aqui.
 */
export async function selectLuxtoryCapacityAction(
  state: LuxtorySelectionState,
  form: FormData,
): Promise<LuxtorySelectionState> {
  const homeId = field(form, 'second_home_id');
  const values = {
    first: field(form, 'first'),
    last: field(form, 'last'),
    purpose: field(form, 'purpose'),
    basis: field(form, 'basis'),
    confirm: field(form, 'confirm'),
  };
  const errors: Partial<Record<LuxtorySelectionField, true>> = {};
  // Datas civis estritas e tamanho conferido antes de expandir (até 366 noites).
  const dates = civilDatesBetween(values.first, values.last, MAX_SELECTION_NIGHTS);
  if (dates === null) {
    errors.first = true;
    errors.last = true;
  }
  if (!PURPOSES.includes(values.purpose)) errors.purpose = true;
  if (values.basis === '' || values.basis.length > 255 || !isNonPersonalReference(values.basis))
    errors.basis = true;
  if (values.confirm !== 'on') errors.confirm = true;
  if (Object.keys(errors).length > 0)
    return { ...state, values, fieldErrors: errors, rejection: 'invalid' };
  const input = {
    second_home_id: homeId,
    nights: (dates ?? []).map((date) => ({ stay_date: date, purpose: values.purpose })),
    basis: values.basis,
  };
  let outcome: Awaited<ReturnType<typeof executeAdminCommand>>;
  try {
    outcome = await executeAdminCommand(
      { handler: handlers.selectLuxtoryCapacity, role: 'admin' },
      input,
      state.key,
    );
  } catch (error) {
    // K3 ausente (handler ou gatilho): funcionalidade fechada, nada gravado; a chave continua livre.
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    rootLogger.info('luxtory selection not activated', { command: 'select_luxtory_capacity' });
    return { ...state, values, fieldErrors: {}, rejection: 'closed' };
  }
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed') redirect(`${selectionPath(homeId)}?feito=1`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return { key, values, fieldErrors: {}, rejection: REJECTIONS[outcome.code] ?? 'unexpected' };
}
