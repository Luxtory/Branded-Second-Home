'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand, exercisedRole, getStaffAccess } from '@/features/identity';
import { getDatabase, isNonPersonalReference, type ErrorCode } from '@/features/platform';
import { POLICY_MECHANISMS } from '../domain/commercial-policy';
import { policyInForce, policyVigencyConflict } from '../domain/policy-vigency';
import { createPolicyHandlers, policyHistory } from '../policies';
import { buildPolicyConfig } from './policy-input';
import type { PolicyFormState } from './policy-state';
import { policiesMessages as text } from './i18n/policies-pt-br';

const handlers = createPolicyHandlers();
const UTC_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_STATE_TRANSITION: 'vigency',
  ERR_PERMISSION: 'permission',
  ERR_VALIDATION: 'rules',
  ERR_UNAVAILABLE: 'unavailable',
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

function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of form.entries())
    if (typeof value === 'string' && name !== 'intent' && !name.startsWith('$'))
      values[name] = value.trim().slice(0, 300);
  return values;
}

/**
 * "Publicar nova versão" de uma política (W18; TECH-032, PD-009, REQ-104; spec pricing §5): `review` monta e valida o
 * documento no servidor e mostra a política como o Titular a verá, as consequências, a vigência e a base; `confirm` refaz
 * tudo e só então executa (sessão → guard Admin com AAL2 → executor → `publish_policy`); `edit` volta ao formulário. O
 * command e o banco revalidam esquema e vigência.
 */
export async function publishPolicyAction(
  state: PolicyFormState,
  form: FormData,
): Promise<PolicyFormState> {
  const values = formValues(form);
  const intent = typeof form.get('intent') === 'string' ? String(form.get('intent')) : '';
  const base = { ...state, values, fieldErrors: [], issues: [] };
  if (intent === 'edit') return { ...base, stage: 'edit', review: null, rejection: null };
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable') return { ...base, rejection: 'unavailable' };
  if (access.kind !== 'granted' || exercisedRole(access, 'admin') === null)
    return { ...base, rejection: 'permission' };
  if (!(POLICY_MECHANISMS as readonly string[]).includes(state.mechanism))
    return { ...base, rejection: 'invalid' };

  const built = buildPolicyConfig(state.mechanism, values);
  const errors = [...built.fieldErrors];
  const from = (values.effective_from ?? '') === '' ? null : utcInstant(values.effective_from!);
  const to = (values.effective_to ?? '') === '' ? null : utcInstant(values.effective_to!);
  if ((values.effective_from ?? '') !== '' && from === null) errors.push('effective_from');
  if (
    (values.effective_to ?? '') !== '' &&
    (to === null || (from !== null && Date.parse(to) <= Date.parse(from)))
  )
    errors.push('effective_to');
  const basis = values.basis ?? '';
  if (basis === '' || basis.length > 255 || !isNonPersonalReference(basis)) errors.push('basis');
  if (errors.length > 0)
    return { ...base, stage: 'edit', review: null, fieldErrors: errors, rejection: 'invalid' };
  if (built.config === null)
    return { ...base, stage: 'edit', review: null, issues: built.issues, rejection: 'rules' };

  const now = new Date();
  // Revisão com as mesmas regras do command: proposta incompatível volta antes da confirmação; a confirmação relê o
  // histórico (publicação concorrente) e o command e o banco revalidam.
  const versions = await policyHistory(getDatabase(), state.mechanism);
  const latest = versions.at(-1) ?? null;
  if (policyVigencyConflict(latest, from === null ? now : new Date(from), now) !== null)
    return {
      ...base,
      stage: 'edit',
      review: null,
      fieldErrors: ['effective_from'],
      rejection: 'vigency',
    };
  if (from === null && to !== null && Date.parse(to) <= now.getTime())
    return {
      ...base,
      stage: 'edit',
      review: null,
      fieldErrors: ['effective_to'],
      rejection: 'invalid',
    };
  const current = policyInForce(versions, now);
  const review = {
    config: built.config,
    current:
      current === null
        ? null
        : `${text.version(current.id)} · ${text.since} ${utc(current.effectiveFrom)}`,
    from: from === null ? text.review.fromNow : utc(new Date(from)),
    to: to === null ? text.review.toOpen : utc(new Date(to)),
    basis,
  };
  if (intent !== 'confirm') return { ...base, stage: 'review', review, rejection: null };
  const outcome = await executeAdminCommand(
    { handler: handlers.publishPolicy, role: 'admin' },
    {
      mechanism: state.mechanism,
      config: built.config,
      effective_from: from,
      effective_to: to,
      basis,
    },
    state.key,
  );
  if (outcome === 'unavailable')
    return { ...base, stage: 'review', review, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed')
    redirect(`/admin/politicas?feito=${state.mechanism}#${state.mechanism}`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return {
    ...base,
    key,
    stage: 'review',
    review,
    rejection: REJECTIONS[outcome.code] ?? 'unexpected',
  };
}
