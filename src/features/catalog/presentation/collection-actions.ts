'use server';

// Server Actions do Admin da Coleção (spec catalog §13.12): mesma entrada da API (ADR-0010 §6).
import {
  approveHomeConceptMediaInput,
  createCatalogTermInput,
  endHomeEditionProjectedInvestmentInput,
  MAX_AMOUNT_MINOR,
  registerHomeEditionProjectedInvestmentInput,
  setHomeConceptCurationInput,
  updateCatalogTermInput,
  uploadHomeConceptCoverInput,
  withdrawHomeConceptMediaInput,
} from '../application/inputs';
import {
  attributeValidation,
  field,
  imageField,
  integer,
  present,
  submit,
  valuesOf,
} from './action-support';
import type { FieldErrorCode, FormState } from './form-state';
import { catalogCommand, catalogHandlers } from './handlers';
import { reaisToMinor } from './money';
import { paths } from './paths';

/** Escolha sim/não dos formulários (rádio): `yes` → verdadeiro; ausente segue para o schema recusar. */
const YES = 'yes';
const NO = 'no';
const choice = (value: string): boolean | undefined =>
  value === YES ? true : value === NO ? false : undefined;

export async function createCatalogTermAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createCatalogTerm),
    schema: createCatalogTermInput,
    input: { kind: present(field(form, 'kind')), label: field(form, 'label') },
    values: valuesOf(form, ['kind', 'label']),
    success: () => paths.vocabulary('registered'),
  });
}

export async function updateCatalogTermAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.updateCatalogTerm),
    schema: updateCatalogTermInput,
    input: {
      catalog_term_id: field(form, 'catalog_term_id'),
      label: field(form, 'label'),
      active: choice(field(form, 'active')),
    },
    values: valuesOf(form, ['label', 'active']),
    success: () => paths.vocabulary('saved'),
  });
}

export async function uploadHomeConceptCoverAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const homeConceptId = field(form, 'home_concept_id');
  const { image, error } = await imageField(form);
  const result = await submit(state, {
    command: catalogCommand(catalogHandlers.uploadHomeConceptCover),
    schema: uploadHomeConceptCoverInput,
    input: {
      home_concept_id: homeConceptId,
      image,
      alt: field(form, 'alt'),
      credit: present(field(form, 'credit')),
      crop_x: integer(field(form, 'crop_x')),
      crop_y: integer(field(form, 'crop_y')),
    },
    values: valuesOf(form, ['alt', 'credit', 'crop_x', 'crop_y']),
    success: (media) => paths.media(homeConceptId, media.id, 'registered'),
    extraErrors: error === null ? {} : { image: error },
  });
  return attributeValidation(result, 'image', 'invalid_image');
}

export async function approveHomeConceptMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.approveHomeConceptMedia),
    schema: approveHomeConceptMediaInput,
    input: { home_concept_media_id: field(form, 'home_concept_media_id') },
    values: {},
    success: (media) => paths.media(media.home_concept_id, media.id, 'cover_approved'),
  });
}

export async function withdrawHomeConceptMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.withdrawHomeConceptMedia),
    schema: withdrawHomeConceptMediaInput,
    input: {
      home_concept_media_id: field(form, 'home_concept_media_id'),
      withdrawal_basis: field(form, 'withdrawal_basis'),
    },
    values: valuesOf(form, ['withdrawal_basis']),
    success: (media) => paths.media(media.home_concept_id, media.id, 'withdrawn'),
  });
}

export async function setHomeConceptCurationAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const rank = integer(field(form, 'rank'));
  return submit(state, {
    command: catalogCommand(catalogHandlers.setHomeConceptCuration),
    schema: setHomeConceptCurationInput,
    input: {
      home_concept_id: field(form, 'home_concept_id'),
      rank: rank ?? null,
      featured: choice(field(form, 'featured')),
    },
    values: valuesOf(form, ['rank', 'featured']),
    success: (curation) => paths.homeConcept(curation.home_concept_id, 'saved'),
  });
}

/** Reais digitados → unidades menores (TECH-033); fora do formato ou do limite vira erro do campo. */
function amountField(form: FormData): {
  readonly amount: number | undefined;
  readonly error: FieldErrorCode | null;
} {
  const text = field(form, 'amount');
  if (text.trim() === '') return { amount: undefined, error: 'required' };
  const minor = reaisToMinor(text);
  if (minor === null || minor < 1n || minor > BigInt(MAX_AMOUNT_MINOR)) {
    return { amount: undefined, error: 'invalid_amount' };
  }
  return { amount: Number(minor), error: null };
}

export async function registerProjectedInvestmentAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const homeEditionId = field(form, 'home_edition_id');
  const { amount, error } = amountField(form);
  const result = await submit(state, {
    command: catalogCommand(catalogHandlers.registerHomeEditionProjectedInvestment),
    schema: registerHomeEditionProjectedInvestmentInput,
    input: {
      home_edition_id: homeEditionId,
      amount_minor: amount,
      currency: 'BRL',
      valid_from: present(field(form, 'valid_from')),
    },
    values: valuesOf(form, ['amount', 'valid_from_local']),
    success: () => paths.homeEdition(homeEditionId, 'registered'),
    extraErrors: error === null ? {} : { amount: error },
  });
  // A única validação que só o command faz aqui: início no passado.
  return attributeValidation(result, 'valid_from', 'not_in_future');
}

export async function endProjectedInvestmentAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.endHomeEditionProjectedInvestment),
    schema: endHomeEditionProjectedInvestmentInput,
    input: {
      home_edition_projected_investment_id: field(form, 'home_edition_projected_investment_id'),
    },
    values: {},
    success: (investment) => paths.homeEdition(investment.home_edition_id, 'ended'),
  });
}
