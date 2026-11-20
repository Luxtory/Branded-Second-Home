'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand, exercisedRole, getStaffAccess } from '@/features/identity';
import { getDatabase, isNonPersonalReference, type ErrorCode } from '@/features/platform';
import { isEconomicParameterKey } from '../domain/parameter';
import { reviewParameterVersion } from '../application/review-parameter';
import { createParameterHandlers, parameterHistory } from '../parameters';
import { displayValue, toCanonicalValue } from './economic-parameter-input';
import type { EconomicParameterField, EconomicParameterState } from './economic-parameter-state';
import { economicParametersMessages as text } from './i18n/economic-parameters-pt-br';

const handlers = createParameterHandlers();
const UTC_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_STATE_TRANSITION: 'vigency',
  ERR_PERMISSION: 'permission',
  ERR_VALIDATION: 'invalid',
  ERR_UNAVAILABLE: 'unavailable',
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/** `datetime-local` em UTC → instante ISO; inválido → `null`. */
function utcInstant(value: string): string | null {
  if (!UTC_INPUT.test(value)) return null;
  const at = new Date(`${value}:00Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 16) !== value
    ? null
    : at.toISOString();
}

const utc = (at: Date) =>
  `${at.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })} (UTC)`;

/**
 * "Publicar versão" de um parâmetro econômico global (W16; REQ-095; spec admin §14): `review` mostra, calculado no
 * servidor, o vigente agora, os agendados, o novo valor, a vigência e a base; `confirm` refaz a validação e só então
 * executa (sessão → guard Admin com AAL2 e `staff_role` → executor → `set_parameter` sem Second Home); `edit` volta ao
 * formulário. Vigência (D3) e tipo são decididos também pelo command e pelo banco.
 */
export async function setEconomicParameterAction(
  state: EconomicParameterState,
  form: FormData,
): Promise<EconomicParameterState> {
  const values = {
    value: field(form, 'value'),
    effective_from: field(form, 'effective_from'),
    effective_to: field(form, 'effective_to'),
    basis: field(form, 'basis'),
  };
  const intent = field(form, 'intent');
  if (intent === 'edit')
    return { ...state, values, stage: 'edit', review: null, fieldErrors: {}, rejection: null };
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (access.kind !== 'granted' || exercisedRole(access, 'admin') === null)
    return { ...state, values, fieldErrors: {}, rejection: 'permission' };
  if (!isEconomicParameterKey(state.parameter))
    return { ...state, values, fieldErrors: {}, rejection: 'invalid' };
  const errors: Partial<Record<EconomicParameterField, true>> = {};
  const value = toCanonicalValue(state.parameter, values.value);
  if (value === null) errors.value = true;
  const from = values.effective_from === '' ? null : utcInstant(values.effective_from);
  const to = values.effective_to === '' ? null : utcInstant(values.effective_to);
  if (values.effective_from !== '' && from === null) errors.effective_from = true;
  if (
    values.effective_to !== '' &&
    (to === null || (from !== null && Date.parse(to) <= Date.parse(from)))
  )
    errors.effective_to = true;
  if (values.basis === '' || values.basis.length > 255 || !isNonPersonalReference(values.basis))
    errors.basis = true;
  if (Object.keys(errors).length > 0 || value === null)
    return {
      ...state,
      values,
      stage: 'edit',
      review: null,
      fieldErrors: errors,
      rejection: 'invalid',
    };
  const now = new Date();
  // Revisão com as mesmas regras do command (D3): proposta incompatível volta antes da confirmação; a confirmação
  // relê o histórico (mudança concorrente) e o command e o banco revalidam.
  const versions = await parameterHistory(getDatabase(), state.parameter, null);
  const checked = reviewParameterVersion(
    versions,
    from === null ? null : new Date(from),
    to === null ? null : new Date(to),
    now,
  );
  if (checked.conflict !== null)
    return {
      ...state,
      values,
      stage: 'edit',
      review: null,
      fieldErrors:
        checked.conflict === 'end_not_future' ? { effective_to: true } : { effective_from: true },
      rejection: checked.conflict === 'end_not_future' ? 'invalid' : 'vigency',
    };
  const show = (canonical: string) => displayValue(state.parameter, canonical, text);
  const review = {
    current: checked.current === null ? null : show(checked.current.value),
    scheduled: checked.scheduled.map((version) =>
      text.scheduledEntry(show(version.value), utc(version.effectiveFrom)),
    ),
    previous: checked.previous === null ? null : show(checked.previous.value),
    proposed: show(value),
    from: from === null ? text.review.fromNow : utc(new Date(from)),
    to: to === null ? text.review.toOpen : utc(new Date(to)),
    basis: values.basis,
  };
  if (intent !== 'confirm')
    return { ...state, values, stage: 'review', review, fieldErrors: {}, rejection: null };
  const outcome = await executeAdminCommand(
    { handler: handlers.setParameter, role: 'admin' },
    {
      second_home_id: null,
      key: state.parameter,
      value,
      effective_from: from,
      effective_to: to,
      basis: values.basis,
    },
    state.key,
  );
  if (outcome === 'unavailable')
    return { ...state, values, stage: 'review', review, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed')
    redirect(`/admin/parametros?feito=${state.parameter}#${state.parameter}`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return {
    ...state,
    key,
    values,
    stage: 'review',
    review,
    fieldErrors: {},
    rejection: REJECTIONS[outcome.code] ?? 'unexpected',
  };
}
