'use server';

// Server Actions do Admin da Coleção (spec catalog §13.12): mesma entrada da API (ADR-0010 §6).
import {
  approveConceptMediaInput,
  COVER_MAX_BYTES,
  createCatalogTermInput,
  endEditionReferenceValueInput,
  MAX_AMOUNT_MINOR,
  registerEditionReferenceValueInput,
  setConceptCurationInput,
  updateCatalogTermInput,
  uploadConceptCoverInput,
  withdrawConceptMediaInput,
} from '../application/inputs';
import { field, integer, present, submit, valuesOf } from './action-support';
import type { FieldErrorCode, FormState } from './form-state';
import { catalogCommand, catalogHandlers } from './handlers';
import { reaisToMinor } from './money';
import { paths } from './paths';

/** Escolha sim/não dos formulários (rádio): `yes` → verdadeiro; ausente segue para o schema recusar. */
const YES = 'yes';
const NO = 'no';
const choice = (value: string): boolean | undefined =>
  value === YES ? true : value === NO ? false : undefined;

/**
 * Recusa `ERR_VALIDATION` do command sem erro de campo (algo que só o command valida): o erro vai para o campo que a
 * causou, para a tela dizer o quê corrigir.
 */
function attributeValidation(state: FormState, name: string, code: FieldErrorCode): FormState {
  return state.rejection === 'invalid' && Object.keys(state.fieldErrors).length === 0
    ? { ...state, fieldErrors: { [name]: code } }
    : state;
}

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

/** Arquivo do formulário → base64 do command; vazio ou acima de 3 MiB vira erro de campo antes do envio. */
async function imageField(form: FormData): Promise<{
  readonly image: string | undefined;
  readonly error: FieldErrorCode | null;
}> {
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return { image: undefined, error: 'required' };
  if (file.size > COVER_MAX_BYTES) return { image: undefined, error: 'file_too_large' };
  return { image: Buffer.from(await file.arrayBuffer()).toString('base64'), error: null };
}

export async function uploadConceptCoverAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const conceptId = field(form, 'concept_id');
  const { image, error } = await imageField(form);
  const result = await submit(state, {
    command: catalogCommand(catalogHandlers.uploadConceptCover),
    schema: uploadConceptCoverInput,
    input: {
      concept_id: conceptId,
      image,
      alt: field(form, 'alt'),
      credit: present(field(form, 'credit')),
      crop_x: integer(field(form, 'crop_x')),
      crop_y: integer(field(form, 'crop_y')),
    },
    values: valuesOf(form, ['alt', 'credit', 'crop_x', 'crop_y']),
    success: (media) => paths.media(conceptId, media.id, 'registered'),
    extraErrors: error === null ? {} : { image: error },
  });
  return attributeValidation(result, 'image', 'invalid_image');
}

export async function approveConceptMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.approveConceptMedia),
    schema: approveConceptMediaInput,
    input: { concept_media_id: field(form, 'concept_media_id') },
    values: {},
    success: (media) => paths.media(media.concept_id, media.id, 'cover_approved'),
  });
}

export async function withdrawConceptMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.withdrawConceptMedia),
    schema: withdrawConceptMediaInput,
    input: {
      concept_media_id: field(form, 'concept_media_id'),
      withdrawal_basis: field(form, 'withdrawal_basis'),
    },
    values: valuesOf(form, ['withdrawal_basis']),
    success: (media) => paths.media(media.concept_id, media.id, 'withdrawn'),
  });
}

export async function setConceptCurationAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const rank = integer(field(form, 'rank'));
  return submit(state, {
    command: catalogCommand(catalogHandlers.setConceptCuration),
    schema: setConceptCurationInput,
    input: {
      concept_id: field(form, 'concept_id'),
      rank: rank ?? null,
      featured: choice(field(form, 'featured')),
    },
    values: valuesOf(form, ['rank', 'featured']),
    success: (curation) => paths.concept(curation.concept_id, 'saved'),
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

export async function registerReferenceValueAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const editionId = field(form, 'edition_id');
  const { amount, error } = amountField(form);
  const result = await submit(state, {
    command: catalogCommand(catalogHandlers.registerEditionReferenceValue),
    schema: registerEditionReferenceValueInput,
    input: {
      edition_id: editionId,
      basis: present(field(form, 'basis')),
      amount_minor: amount,
      currency: 'BRL',
      valid_from: present(field(form, 'valid_from')),
    },
    values: valuesOf(form, ['basis', 'amount', 'valid_from_local']),
    success: () => paths.edition(editionId, 'registered'),
    extraErrors: error === null ? {} : { amount: error },
  });
  // A única validação que só o command faz aqui: início no passado.
  return attributeValidation(result, 'valid_from', 'not_in_future');
}

export async function endReferenceValueAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.endEditionReferenceValue),
    schema: endEditionReferenceValueInput,
    input: { edition_reference_value_id: field(form, 'edition_reference_value_id') },
    values: {},
    success: (value) => paths.edition(value.edition_id, 'ended'),
  });
}
