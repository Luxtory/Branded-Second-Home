'use server';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ZodType } from 'zod';
import { adminRoleGate } from '@/features/admin';
import { executeAdminCommand, readPartySummary, type AdminCommand } from '@/features/identity';
import { rootLogger, resolveCorrelationId, type JsonValue } from '@/features/platform';
import {
  formalizeAcquisitionInput,
  initialAllocationInput,
  administrationInput,
  operationStartInput,
} from '../application/acquisition-input';
import { acquisitionAdminCommand, createAcquisitionHandlers } from './acquisition-handlers';
import {
  acquisitionFormInput,
  formField,
  type AcquisitionFormKind,
} from './acquisition-form-input';
import type { AcquisitionFormState, MaskedPartyOption } from './acquisition-form-state';
const handlers = createAcquisitionHandlers();
const path = (id: string) => `/admin/catalogo/second-homes/${encodeURIComponent(id)}/formalizacao`;

async function submit<I, R extends JsonValue>(
  kind: AcquisitionFormKind,
  schema: ZodType<I>,
  command: AdminCommand<I, R>,
  state: AcquisitionFormState,
  form: FormData,
): Promise<AcquisitionFormState> {
  const values = Object.fromEntries(
    [...form.entries()].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && !entry[0].startsWith('$ACTION_'),
    ),
  );
  const input = acquisitionFormInput(kind, form);
  const parsed = schema.safeParse(input);
  const errors: Record<string, 'required' | 'invalid' | 'confirmation'> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const root = String(issue.path[0] ?? '');
      const leaf = String(issue.path.at(-1) ?? '');
      const name =
        root === 'grants'
          ? leaf
          : root === 'luxtory_capacity'
            ? `luxtory_${leaf}`
            : root === 'acquirer_party_ids' && typeof issue.path[1] === 'number'
              ? `acquirer_${issue.path[1] + 1}`
              : root === 'coverages'
                ? leaf
                : root;
      if (name !== '')
        errors[name] = values[name] === undefined || values[name] === '' ? 'required' : 'invalid';
    }
  if ((kind === 'formalize' || kind === 'start') && formField(form, 'confirmation') !== 'on')
    errors.confirmation = 'confirmation';
  if (kind === 'administration' && !['defined', 'none'].includes(formField(form, 'end_kind')))
    errors.end_kind = 'required';
  if (!parsed.success || Object.keys(errors).length > 0)
    return { ...state, values, errors, rejection: 'invalid' };
  let outcome;
  try {
    outcome = await executeAdminCommand(command, parsed.data, state.key);
  } catch {
    // Never log the payload or a driver/provider message: it can contain document/location data.
    rootLogger
      .child({ correlation_id: resolveCorrelationId(await headers()) })
      .error('acquisition Admin submission unconfirmed', { kind });
    return { ...state, values, errors: {}, rejection: 'unexpected' };
  }
  if (outcome === 'unavailable')
    return { ...state, values, errors: {}, rejection: 'ERR_UNAVAILABLE' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'rejected') {
    // Definitive functional refusals require a fresh corrected attempt. Transient failures keep the same key.
    const transient = ['ERR_UNAVAILABLE', 'ERR_INTERNAL'].includes(outcome.code);
    return {
      key: transient ? state.key : randomUUID(),
      values,
      errors: {},
      rejection: outcome.code,
    };
  }
  redirect(
    `${path(formField(form, 'second_home_id'))}?registered=${outcome.operationId}#registered`,
  );
}
export async function formalizeAcquisitionAction(state: AcquisitionFormState, form: FormData) {
  return submit(
    'formalize',
    formalizeAcquisitionInput,
    acquisitionAdminCommand(handlers.formalizeAcquisition),
    state,
    form,
  );
}
export async function initialAllocationAction(state: AcquisitionFormState, form: FormData) {
  return submit(
    'allocation',
    initialAllocationInput,
    acquisitionAdminCommand(handlers.initialAllocation),
    state,
    form,
  );
}
export async function administrationAction(state: AcquisitionFormState, form: FormData) {
  return submit(
    'administration',
    administrationInput,
    acquisitionAdminCommand(handlers.administration),
    state,
    form,
  );
}
export async function operationStartAction(state: AcquisitionFormState, form: FormData) {
  return submit(
    'start',
    operationStartInput,
    acquisitionAdminCommand(handlers.operationStart),
    state,
    form,
  );
}

/** Authorized W7 lookup; accepts only a party id, never a CPF/CNPJ or ciphertext. */
export async function lookupAcquisitionParty(
  id: string,
): Promise<{ party: MaskedPartyOption | null; unavailable: boolean }> {
  const gate = await adminRoleGate('admin');
  if (
    gate.kind === 'blocked' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return { party: null, unavailable: false };
  try {
    const party = await readPartySummary(gate.session, id);
    return {
      party:
        party === null
          ? null
          : {
              id: party.id,
              documentType: party.documentType,
              maskedDocument: party.maskedDocument,
            },
      unavailable: false,
    };
  } catch {
    rootLogger
      .child({ correlation_id: resolveCorrelationId(await headers()) })
      .error('acquisition party selector unavailable', {});
    return { party: null, unavailable: true };
  }
}
