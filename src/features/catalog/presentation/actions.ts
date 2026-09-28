'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { ZodType } from 'zod';
import { executeAdminCommand, type AdminCommand } from '@/features/identity';
import type { JsonValue } from '@/features/platform';
import { registerBrandPartnerInput, terminateBrandPartnerInput } from '../application/inputs';
import { fieldErrorsFrom, rejectionFor, type FormState } from './form-state';
import { catalogCommand, catalogHandlers } from './handlers';
import { paths } from './paths';

/**
 * Server Actions dos formulários do catálogo: mesma entrada da API (ADR-0010 §6). O schema do command valida antes só
 * para mostrar o erro no campo; a decisão é do command, que revalida tudo na transação.
 */
const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** Campo vazio = ausente (obrigatório → "Preencha este campo"; opcional → não enviado). */
const present = (value: string): string | undefined => (value.trim() === '' ? undefined : value);

const valuesOf = (form: FormData, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, field(form, name)]));

interface Submission<I, R extends JsonValue> {
  readonly command: AdminCommand<I, R>;
  readonly schema: ZodType<I>;
  readonly input: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly success: (result: R) => string;
}

async function submit<I, R extends JsonValue>(
  state: FormState,
  { command, schema, input, values, success }: Submission<I, R>,
): Promise<FormState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      key: state.key,
      values,
      fieldErrors: fieldErrorsFrom(parsed.error),
      rejection: 'invalid',
    };
  }
  const outcome = await executeAdminCommand(command, input, state.key);
  if (outcome === 'unavailable')
    return { key: state.key, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'rejected') {
    // Recusa gravada consome a chave (replay repetiria a recusa): o próximo envio leva uma nova.
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { key, values, fieldErrors: {}, rejection: rejectionFor(outcome.code) };
  }
  redirect(success(outcome.result));
}

export async function registerBrandPartnerAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.registerBrandPartner),
    schema: registerBrandPartnerInput,
    input: {
      brand_name: field(form, 'brand_name'),
      exposure_authorization_ref: present(field(form, 'exposure_authorization_ref')),
    },
    values: valuesOf(form, ['brand_name', 'exposure_authorization_ref']),
    success: (result) => paths.brandPartner(result.id, 'registered'),
  });
}

export async function terminateBrandPartnerAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.terminateBrandPartner),
    schema: terminateBrandPartnerInput,
    input: {
      brand_partner_id: field(form, 'brand_partner_id'),
      terminated_effective_at: present(field(form, 'terminated_effective_at')),
      termination_basis: field(form, 'termination_basis'),
    },
    values: valuesOf(form, ['terminated_effective_at_local', 'termination_basis']),
    success: (result) => paths.brandPartner(result.id, 'terminated'),
  });
}
