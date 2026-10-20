'use server';

// Server Actions da Home Edition (spec catalog §17.3, §17.6): mesma entrada da API (ADR-0010 §6).
import {
  approveHomeEditionMediaInput,
  correctHomeEditionEditorialInput,
  createHomeEditionInput,
  finalizeHomeEditionInput,
  publishHomeEditionInput,
  updateHomeEditionDraftInput,
  uploadHomeEditionMediaInput,
  withdrawHomeEditionInput,
  withdrawHomeEditionMediaInput,
} from '../application/inputs';
import {
  attributeValidation,
  field,
  imageField,
  integer,
  lines,
  present,
  submit,
  valuesOf,
} from './action-support';
import type { FormState } from './form-state';
import { catalogCommand, catalogHandlers } from './handlers';
import { paths } from './paths';

/** Campos da definição material e dos textos editoriais (criação e edição da preparação). */
const CONTENT_FIELDS = [
  'name',
  'description',
  'typology',
  'spatial_configuration',
  'projected_area_m2',
  'suites',
  'guests_max',
  'rooms',
  'amenities',
  'characteristics',
] as const;

/** Lista opcional de uma por linha: vazia = não registrada. */
const optionalLines = (value: string) => {
  const items = lines(value);
  return items.length === 0 ? undefined : items;
};

const homeEditionContent = (form: FormData) => ({
  name: field(form, 'name'),
  description: field(form, 'description'),
  typology: field(form, 'typology'),
  spatial_configuration: field(form, 'spatial_configuration'),
  projected_area_m2: integer(field(form, 'projected_area_m2')),
  suites: integer(field(form, 'suites')),
  guests_max: integer(field(form, 'guests_max')),
  rooms: optionalLines(field(form, 'rooms')),
  amenities: optionalLines(field(form, 'amenities')),
  characteristics: optionalLines(field(form, 'characteristics')),
});

export async function createHomeEditionAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.createHomeEdition),
    schema: createHomeEditionInput,
    input: { home_concept_id: field(form, 'home_concept_id'), ...homeEditionContent(form) },
    values: valuesOf(form, CONTENT_FIELDS),
    success: (result) => paths.homeEdition(result.id, 'registered'),
  });
}

export async function updateHomeEditionDraftAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.updateHomeEditionDraft),
    schema: updateHomeEditionDraftInput,
    input: { home_edition_id: field(form, 'home_edition_id'), ...homeEditionContent(form) },
    values: valuesOf(form, CONTENT_FIELDS),
    success: (result) => paths.homeEdition(result.id, 'saved'),
  });
}

export async function finalizeHomeEditionAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.finalizeHomeEdition),
    schema: finalizeHomeEditionInput,
    input: { home_edition_id: field(form, 'home_edition_id') },
    values: {},
    success: (result) => paths.homeEdition(result.id, 'finalized'),
  });
}

export async function publishHomeEditionAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.publishHomeEdition),
    schema: publishHomeEditionInput,
    input: { home_edition_id: field(form, 'home_edition_id') },
    values: {},
    success: (result) => paths.homeEdition(result.id, 'published'),
  });
}

export async function withdrawHomeEditionAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.withdrawHomeEdition),
    schema: withdrawHomeEditionInput,
    input: {
      home_edition_id: field(form, 'home_edition_id'),
      withdrawal_basis: field(form, 'withdrawal_basis'),
    },
    values: valuesOf(form, ['withdrawal_basis']),
    success: (result) => paths.homeEdition(result.id, 'unpublished'),
  });
}

export async function correctHomeEditionEditorialAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.correctHomeEditionEditorial),
    schema: correctHomeEditionEditorialInput,
    input: {
      home_edition_id: field(form, 'home_edition_id'),
      name: present(field(form, 'name')),
      description: present(field(form, 'description')),
      correction_basis: field(form, 'correction_basis'),
    },
    values: valuesOf(form, ['name', 'description', 'correction_basis']),
    success: (result) => paths.homeEdition(result.id, 'corrected'),
  });
}

export async function uploadHomeEditionMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  const homeEditionId = field(form, 'home_edition_id');
  const { image, error } = await imageField(form);
  const result = await submit(state, {
    command: catalogCommand(catalogHandlers.uploadHomeEditionMedia),
    schema: uploadHomeEditionMediaInput,
    input: {
      home_edition_id: homeEditionId,
      kind: present(field(form, 'kind')),
      image,
      alt: field(form, 'alt'),
      credit: present(field(form, 'credit')),
      crop_x: integer(field(form, 'crop_x')),
      crop_y: integer(field(form, 'crop_y')),
    },
    values: valuesOf(form, ['kind', 'alt', 'credit', 'crop_x', 'crop_y']),
    success: (media) => paths.homeEditionMedia(homeEditionId, media.id, 'registered'),
    extraErrors: error === null ? {} : { image: error },
  });
  return attributeValidation(result, 'image', 'invalid_image');
}

export async function approveHomeEditionMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.approveHomeEditionMedia),
    schema: approveHomeEditionMediaInput,
    input: { home_edition_media_id: field(form, 'home_edition_media_id') },
    values: {},
    success: (media) => paths.homeEditionMedia(media.home_edition_id, media.id, 'media_approved'),
  });
}

export async function withdrawHomeEditionMediaAction(
  state: FormState,
  form: FormData,
): Promise<FormState> {
  return submit(state, {
    command: catalogCommand(catalogHandlers.withdrawHomeEditionMedia),
    schema: withdrawHomeEditionMediaInput,
    input: {
      home_edition_media_id: field(form, 'home_edition_media_id'),
      withdrawal_basis: field(form, 'withdrawal_basis'),
    },
    values: valuesOf(form, ['withdrawal_basis']),
    success: (media) => paths.homeEditionMedia(media.home_edition_id, media.id, 'withdrawn'),
  });
}
