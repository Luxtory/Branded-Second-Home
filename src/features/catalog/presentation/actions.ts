'use server';

// Server Actions dos formulários do catálogo (ADR-0010 §6); o apoio comum fica em `action-support.ts`.
import {
  approveHomeConceptVersionInput,
  authorizeBrandExposureInput,
  newHomeConceptInput,
  newVersionInput,
  registerBrandPartnerInput,
  registerInvestorAuthorizationInput,
  registerSecondHomeInput,
  revokeInvestorAuthorizationInput,
  terminateBrandPartnerInput,
} from '../application/inputs';
import {
  field,
  lines,
  NO_INVESTOR,
  orderedChoices,
  present,
  submit,
  valuesOf,
} from './action-support';
import type { FieldErrorCode, FormState } from './form-state';
import { catalogCommand, catalogHandlers } from './handlers';
import { paths } from './paths';

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

/** Seleções de termo por vocabulário (spec catalog §13.12): lifestyle 1–3, estilo 1–2. */
const TERM_SLOTS = { lifestyle: 3, architectural_style: 2 } as const;

const VERSION_FIELDS = [
  'essential_elements',
  'preservation_premises',
  'specification',
  'summary',
  'lifestyle_1',
  'lifestyle_2',
  'lifestyle_3',
  'architectural_style_1',
  'architectural_style_2',
] as const;

const versionContent = (form: FormData) => ({
  essential_elements: lines(field(form, 'essential_elements')),
  preservation_premises: lines(field(form, 'preservation_premises')),
  specification: field(form, 'specification'),
  summary: present(field(form, 'summary')),
  lifestyle_ids: orderedChoices(form, 'lifestyle', TERM_SLOTS.lifestyle),
  architectural_style_ids: orderedChoices(
    form,
    'architectural_style',
    TERM_SLOTS.architectural_style,
  ),
});

/** O mesmo termo em duas posições: erro no grupo, antes do command (que só veria "duplicado"). */
function repeatedTerms(form: FormData): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {};
  for (const [kind, slots] of Object.entries(TERM_SLOTS)) {
    const chosen = orderedChoices(form, kind, slots);
    if (new Set(chosen).size !== chosen.length) errors[`${kind}_ids`] = 'duplicate_term';
  }
  return errors;
}

export async function registerHomeConceptAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createHomeConceptVersion),
    schema: newHomeConceptInput,
    input: {
      brand_partner_id: field(form, 'brand_partner_id'),
      title: field(form, 'title'),
      ...versionContent(form),
    },
    values: valuesOf(form, ['title', ...VERSION_FIELDS]),
    success: (result) => paths.homeConcept(result.home_concept_id, 'registered'),
    extraErrors: repeatedTerms(form),
  });
}

export async function createVersionAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createHomeConceptVersion),
    schema: newVersionInput,
    input: { home_concept_id: field(form, 'home_concept_id'), ...versionContent(form) },
    values: valuesOf(form, [...VERSION_FIELDS]),
    success: (result) => paths.homeConcept(result.home_concept_id, 'registered'),
    extraErrors: repeatedTerms(form),
  });
}

export async function approveVersionAction(state: FormState, form: FormData): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.approveHomeConceptVersion),
    schema: approveHomeConceptVersionInput,
    input: {
      home_concept_version_id: field(form, 'home_concept_version_id'),
      approval_refs: lines(field(form, 'approval_refs')),
    },
    values: valuesOf(form, ['approval_refs']),
    success: (result) => paths.homeConcept(result.home_concept_id, 'approved'),
  });
}

export async function registerAuthorizationAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const next = await submit(state, {
    command: catalogCommand(catalogHandlers.registerInvestorAuthorization),
    schema: registerInvestorAuthorizationInput,
    input: {
      home_concept_id: field(form, 'home_concept_id'),
      investor_document: field(form, 'investor_document'),
      instrument_ref: field(form, 'instrument_ref'),
      valid_from: present(field(form, 'valid_from')),
      valid_until: present(field(form, 'valid_until')),
    },
    values: valuesOf(form, [
      'investor_document',
      'instrument_ref',
      'valid_from_local',
      'valid_until_local',
    ]),
    success: (result) => paths.homeConcept(result.home_concept_id, 'registered'),
  });
  // W7 (D-W3-1): sem party para o documento, o erro vai para o campo — o Home Concept já existe na tela.
  return next.rejection === 'not_found'
    ? { ...next, rejection: 'invalid', fieldErrors: { investor_document: 'party_not_found' } }
    : next;
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
    success: (result) => paths.homeConcept(result.home_concept_id, 'revoked'),
  });
}

export async function registerSecondHomeAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const investor = field(form, 'investor_authorization_id');
  return submit(state, {
    command: catalogCommand(catalogHandlers.registerSecondHome),
    schema: registerSecondHomeInput,
    input: {
      home_edition_id: field(form, 'home_edition_id'),
      label: field(form, 'label'),
      timezone: present(field(form, 'timezone')),
      investor_authorization_id: investor === NO_INVESTOR ? undefined : present(investor),
    },
    values: valuesOf(form, ['label', 'timezone', 'investor_authorization_id']),
    success: (result) => paths.secondHome(result.id, 'registered'),
    extraErrors: investor === '' ? { investor_authorization_id: 'required' } : {},
  });
}
