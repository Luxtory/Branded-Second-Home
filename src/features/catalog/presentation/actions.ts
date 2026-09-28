'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { ZodType } from 'zod';
import { executeAdminCommand, type AdminCommand } from '@/features/identity';
import type { JsonValue } from '@/features/platform';
import {
  approveConceptVersionInput,
  authorizeBrandExposureInput,
  createEditionInput,
  newConceptInput,
  newVersionInput,
  registerBrandPartnerInput,
  registerInvestorAuthorizationInput,
  registerResidenceInput,
  revokeInvestorAuthorizationInput,
  terminateBrandPartnerInput,
} from '../application/inputs';
import { fieldErrorsFrom, rejectionFor, type FieldErrorCode, type FormState } from './form-state';
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

/** Campo de várias linhas → lista (uma entrada por linha, sem linhas vazias). */
const lines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** "Sem Investor" é escolha explícita; a opção vazia não foi escolhida. */
const NO_INVESTOR = 'none';

interface Submission<I, R extends JsonValue> {
  readonly command: AdminCommand<I, R>;
  readonly schema: ZodType<I>;
  readonly input: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly success: (result: R) => string;
  /** Erros que só a tela conhece (ex.: escolha obrigatória que o command trata como opcional). */
  readonly extraErrors?: Readonly<Record<string, FieldErrorCode>>;
}

async function submit<I, R extends JsonValue>(
  state: FormState,
  { command, schema, input, values, success, extraErrors = {} }: Submission<I, R>,
): Promise<FormState> {
  const parsed = schema.safeParse(input);
  const fieldErrors = { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)), ...extraErrors };
  if (Object.keys(fieldErrors).length > 0) {
    return { key: state.key, values, fieldErrors, rejection: 'invalid' };
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

export async function authorizeBrandExposureAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.authorizeBrandExposure),
    schema: authorizeBrandExposureInput,
    input: {
      brand_partner_id: field(form, 'brand_partner_id'),
      exposure_authorization_ref: field(form, 'exposure_authorization_ref'),
    },
    values: valuesOf(form, ['exposure_authorization_ref']),
    success: (result) => paths.brandPartner(result.id, 'exposure'),
  });
}

const VERSION_FIELDS = ['essential_elements', 'preservation_premises', 'specification'] as const;

const versionContent = (form: FormData) => ({
  essential_elements: lines(field(form, 'essential_elements')),
  preservation_premises: lines(field(form, 'preservation_premises')),
  specification: field(form, 'specification'),
});

export async function registerConceptAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createConceptVersion),
    schema: newConceptInput,
    input: {
      brand_partner_id: field(form, 'brand_partner_id'),
      title: field(form, 'title'),
      ...versionContent(form),
    },
    values: valuesOf(form, ['title', ...VERSION_FIELDS]),
    success: (result) => paths.concept(result.concept_id, 'registered'),
  });
}

export async function createVersionAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createConceptVersion),
    schema: newVersionInput,
    input: { concept_id: field(form, 'concept_id'), ...versionContent(form) },
    values: valuesOf(form, [...VERSION_FIELDS]),
    success: (result) => paths.concept(result.concept_id, 'registered'),
  });
}

export async function approveVersionAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.approveConceptVersion),
    schema: approveConceptVersionInput,
    input: {
      concept_version_id: field(form, 'concept_version_id'),
      approval_refs: lines(field(form, 'approval_refs')),
    },
    values: valuesOf(form, ['approval_refs']),
    success: (result) => paths.concept(result.concept_id, 'approved'),
  });
}

export async function createEditionAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createEdition),
    schema: createEditionInput,
    input: {
      concept_id: field(form, 'concept_id'),
      region: field(form, 'region'),
      modality: present(field(form, 'modality')),
      commercial_conditions: field(form, 'commercial_conditions'),
    },
    values: valuesOf(form, ['region', 'modality', 'commercial_conditions']),
    success: (result) => paths.edition(result.id, 'registered'),
  });
}

export async function registerAuthorizationAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.registerInvestorAuthorization),
    schema: registerInvestorAuthorizationInput,
    input: {
      concept_id: field(form, 'concept_id'),
      instrument_ref: field(form, 'instrument_ref'),
      valid_from: present(field(form, 'valid_from')),
      valid_until: present(field(form, 'valid_until')),
    },
    values: valuesOf(form, ['instrument_ref', 'valid_from_local', 'valid_until_local']),
    success: (result) => paths.concept(result.concept_id, 'registered'),
  });
}

export async function revokeAuthorizationAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.revokeInvestorAuthorization),
    schema: revokeInvestorAuthorizationInput,
    input: {
      investor_authorization_id: field(form, 'investor_authorization_id'),
      revocation_basis: field(form, 'revocation_basis'),
    },
    values: valuesOf(form, ['revocation_basis']),
    success: (result) => paths.concept(result.concept_id, 'revoked'),
  });
}

export async function registerResidenceAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const investor = field(form, 'investor_authorization_id');
  return submit(state, {
    command: catalogCommand(catalogHandlers.registerResidence),
    schema: registerResidenceInput,
    input: {
      edition_id: field(form, 'edition_id'),
      label: field(form, 'label'),
      timezone: present(field(form, 'timezone')),
      investor_authorization_id: investor === NO_INVESTOR ? undefined : present(investor),
    },
    values: valuesOf(form, ['label', 'timezone', 'investor_authorization_id']),
    success: (result) => paths.residence(result.id, 'registered'),
    extraErrors: investor === '' ? { investor_authorization_id: 'required' } : {},
  });
}
