'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { executeAdminCommand, type AdminCommand } from '@/features/identity';
import {
  CapabilityNotActivatedError,
  rootLogger,
  type ErrorCode,
  type JsonValue,
} from '@/features/platform';
import { incidentReference, referenceBasis } from '../application/lifecycle-inputs';
import { createBookingAuthorizationQuota } from './booking-authorization-quota';
import type { AdminActField, AdminActState } from './own-use-admin-state';
import { createOwnUseLifecycleHandlers } from './own-use-lifecycle-handlers';

/**
 * Server Actions dos atos do Admin no ciclo da reserva (W13 E4b; spec booking §10.15): sessão verificada → guard
 * (AAL2 e `staff_role` revalidados) → executor (TECH-054) → handler da E2 (K2 e autorização independente no handler e no
 * banco). A action valida os campos para associar o erro ao campo e traduz o desfecho — nada de regra aqui. A
 * solicitação de autorização passa pela cota do G-E4-1, consumida pelo executor depois da idempotência.
 */
const handlers = createOwnUseLifecycleHandlers();
const quota = createBookingAuthorizationQuota();
const ADMIN = 'admin' as const;
const REASONS = [
  'emergency_maintenance',
  'security',
  'casualty',
  'fortuitous_event',
  'force_majeure',
];
const PURPOSES = ['no_show', 'recovery', 'exception_cancellation', 'invalidation'];

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_PERMISSION: 'permission',
  ERR_STATE_TRANSITION: 'state',
  ERR_NOT_FOUND: 'state',
  ERR_CAPACITY_UNAVAILABLE: 'capacity',
  ERR_RATE_LIMITED: 'rate_limited',
  ERR_UNAVAILABLE: 'unavailable',
  ERR_PARAMETER_MISSING: 'parameter_missing',
  ERR_VALIDATION: 'invalid',
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const target = (form: FormData) => ({
  second_home_id: field(form, 'second_home_id'),
  booking_id: field(form, 'booking_id'),
});

const detailPath = (bookingId: string) => `/admin/reservas/${bookingId}`;

function invalid(
  state: AdminActState,
  values: Record<string, string>,
  fieldErrors: Partial<Record<AdminActField, true>>,
): AdminActState {
  return { ...state, values, fieldErrors, rejection: 'invalid' };
}

async function submit<I, R extends JsonValue>(
  command: AdminCommand<I, R>,
  input: unknown,
  state: AdminActState,
  values: Record<string, string>,
  done: (result: R) => string,
): Promise<AdminActState> {
  let outcome: Awaited<ReturnType<typeof executeAdminCommand<I, R>>>;
  try {
    outcome = await executeAdminCommand(command, input, state.key);
  } catch (error) {
    // K2 ausente (handler ou gatilho): funcionalidade fechada, nada gravado; a chave continua livre.
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    rootLogger.info('own use lifecycle not activated', { command: command.handler.command });
    return { ...state, values, fieldErrors: {}, rejection: 'closed' };
  }
  if (outcome === 'unavailable')
    return { ...state, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed') redirect(done(outcome.result));
  // Recusa gravada consome a chave; recusa antes da operação (limite, indisponível) mantém a chave utilizável.
  const key = outcome.operationId === null ? state.key : randomUUID();
  return { key, values, fieldErrors: {}, rejection: REJECTIONS[outcome.code] ?? 'unexpected' };
}

const basisOk = (value: string) => referenceBasis.safeParse(value).success;

/** `open_exception`: exceção operacional (motivo da PD-010) ou apuração (referência do incidente). */
export async function openExceptionAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = {
    type: field(form, 'type'),
    reason: field(form, 'reason'),
    incident_ref: field(form, 'incident_ref'),
    basis: field(form, 'basis'),
  };
  const errors: Partial<Record<AdminActField, true>> = {};
  if (values.type !== 'operational' && values.type !== 'unauthorized_booking') errors.type = true;
  if (values.type === 'operational' && !REASONS.includes(values.reason)) errors.reason = true;
  if (
    values.type === 'unauthorized_booking' &&
    !incidentReference.safeParse(values.incident_ref).success
  )
    errors.incident_ref = true;
  if (!basisOk(values.basis)) errors.basis = true;
  if (Object.keys(errors).length > 0) return invalid(state, values, errors);
  const input =
    values.type === 'operational'
      ? {
          ...target(form),
          exception_type: 'operational',
          reason: values.reason,
          basis: values.basis,
        }
      : {
          ...target(form),
          exception_type: 'unauthorized_booking',
          incident_ref: values.incident_ref,
          basis: values.basis,
        };
  return submit(
    { handler: handlers.openException, role: ADMIN },
    input,
    state,
    values,
    () => `${detailPath(field(form, 'booking_id'))}?feito=open_exception`,
  );
}

/** `resolve_exception`: o servidor exige a autorização viva só para cancelar (e o banco a confere). */
export async function resolveExceptionAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = { outcome: field(form, 'outcome'), basis: field(form, 'basis') };
  const errors: Partial<Record<AdminActField, true>> = {};
  if (!['confirmed', 'completed', 'cancelled'].includes(values.outcome)) errors.outcome = true;
  if (!basisOk(values.basis)) errors.basis = true;
  if (Object.keys(errors).length > 0) return invalid(state, values, errors);
  return submit(
    { handler: handlers.resolveException, role: ADMIN },
    {
      ...target(form),
      exception_id: field(form, 'exception_id'),
      outcome: values.outcome,
      basis: values.basis,
    },
    state,
    values,
    () => `${detailPath(field(form, 'booking_id'))}?feito=resolve`,
  );
}

/** `declare_no_show`: registro verificável atestado pelo Admin; autorização `no_show` exigida pelo handler e pelo banco. */
export async function declareNoShowAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = { basis: field(form, 'basis'), attest: field(form, 'attest') };
  const errors: Partial<Record<AdminActField, true>> = {};
  if (!basisOk(values.basis)) errors.basis = true;
  if (values.attest !== 'on') errors.attest = true;
  if (Object.keys(errors).length > 0) return invalid(state, values, errors);
  return submit(
    { handler: handlers.declareNoShow, role: ADMIN },
    { ...target(form), basis: values.basis },
    state,
    values,
    () => `${detailPath(field(form, 'booking_id'))}?feito=no_show`,
  );
}

/** `correct_use_right`: apuração de Co-Owner com autorização `invalidation` (uma operação resolve, libera e corrige). */
export async function correctUseRightAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = { basis: field(form, 'basis') };
  if (!basisOk(values.basis)) return invalid(state, values, { basis: true });
  return submit(
    { handler: handlers.correctUseRight, role: ADMIN },
    { ...target(form), exception_id: field(form, 'exception_id'), basis: values.basis },
    state,
    values,
    () => `${detailPath(field(form, 'booking_id'))}?feito=invalidation`,
  );
}

/** `recover_future_capacity`: só as custódias gravadas na autorização `recovery`, ainda futuras e ativas. */
export async function recoverFutureCapacityAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = { basis: field(form, 'basis') };
  if (!basisOk(values.basis)) return invalid(state, values, { basis: true });
  return submit(
    { handler: handlers.recoverFutureCapacity, role: ADMIN },
    { ...target(form), basis: values.basis },
    state,
    values,
    () => `${detailPath(field(form, 'booking_id'))}?feito=recovery`,
  );
}

/** `request_booking_authorization` (fora da K2, D12) com a cota do G-E4-1; o resultado é o id opaco da solicitação. */
export async function requestBookingAuthorizationAction(
  state: AdminActState,
  form: FormData,
): Promise<AdminActState> {
  const values = {
    purpose: field(form, 'purpose'),
    basis: field(form, 'basis'),
    attest: field(form, 'attest'),
  };
  const errors: Partial<Record<AdminActField, true>> = {};
  if (!PURPOSES.includes(values.purpose)) errors.purpose = true;
  if (!basisOk(values.basis)) errors.basis = true;
  if (
    field(form, 'attest_required') === 'yes' &&
    values.purpose === 'recovery' &&
    values.attest !== 'on'
  )
    errors.attest = true;
  if (Object.keys(errors).length > 0) return invalid(state, values, errors);
  return submit(
    { handler: { ...handlers.requestBookingAuthorization, consumeQuota: quota }, role: ADMIN },
    {
      ...target(form),
      purpose: values.purpose,
      basis: values.basis,
      availability_attested: values.purpose === 'recovery' && values.attest === 'on',
    },
    state,
    values,
    (result) =>
      `${detailPath(field(form, 'booking_id'))}?solicitacao=${(result as { request_id: string }).request_id}`,
  );
}
