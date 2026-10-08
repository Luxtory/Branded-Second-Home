import { z } from 'zod';
import { EDITION_MODALITIES } from '../domain/catalog';
import {
  CATALOG_TERM_KINDS,
  CROP_STEPS,
  MAX_TERMS_PER_KIND,
  REFERENCE_VALUE_BASES,
  REFERENCE_VALUE_CURRENCIES,
  termSlug,
} from '../domain/collection';
import { FORBIDDEN_TERM, hasForbiddenTerm } from '../domain/terminology';
import { isIanaTimeZone } from '../domain/time-zone';

/**
 * Corpos das operações do catálogo (OpenAPI, tag `catalog`). As telas usam os mesmos schemas para mostrar o erro no
 * campo; a decisão é sempre do command (ADR-0010 §6). Todo texto registrado passa pela checagem de terminologia.
 */
const NAME_MAX = 200;
const REF_MAX = 255;
const LABEL_MAX = 120;
const LONG_TEXT_MAX = 20_000;
const LIST_ITEM_MAX = 500;
const LIST_MAX_ITEMS = 50;
const APPROVAL_REFS_MAX = 20;
const TIME_ZONE_MAX = 64;
const SUMMARY_MAX = 160;
const GUESTS_MAX = 100;
const SUITES_MAX = 50;
const BUILT_AREA_MAX_M2 = 100_000;
const TERM_LABEL_MAX = 80;
const ALT_MAX = 300;
const CREDIT_MAX = 200;
const RANK_MAX = 999;
/** Arquivo de imagem até 3 MiB, em base64 (4 caracteres a cada 3 bytes): cabe no limite de corpo da Vercel. */
export const COVER_MAX_BYTES = 3 * 1024 * 1024;
const COVER_BASE64_MAX = Math.ceil(COVER_MAX_BYTES / 3) * 4;
/** Maior valor de referência aceito, em unidades menores (abaixo do inteiro exato do JSON). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

/** Mensagem de validação quando o valor não é um fuso IANA conhecido. */
export const INVALID_TIME_ZONE = 'invalid_time_zone';
export const DUPLICATE_ITEM = 'duplicate_item';
export const END_BEFORE_START = 'end_before_start';
/** Rótulo sem nenhuma letra ou número (não gera slug). */
export const INVALID_TERM_LABEL = 'invalid_term_label';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasForbiddenTerm(value), FORBIDDEN_TERM);

const textList = z.array(text(LIST_ITEM_MAX)).min(1).max(LIST_MAX_ITEMS);
const instant = z.iso.datetime({ offset: true });
const id = z.uuid();
const count = (max: number) => z.int().min(1).max(max);
const termIds = (max: number) =>
  z
    .array(id)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, DUPLICATE_ITEM);

export const registerBrandPartnerInput = z.strictObject({
  brand_name: text(NAME_MAX),
  exposure_authorization_ref: text(REF_MAX).optional(),
});

export const authorizeBrandExposureInput = z.strictObject({
  brand_partner_id: id,
  exposure_authorization_ref: text(REF_MAX),
});

export const terminateBrandPartnerInput = z.strictObject({
  brand_partner_id: id,
  terminated_effective_at: instant,
  termination_basis: text(REF_MAX),
});

const versionContent = {
  essential_elements: textList,
  preservation_premises: textList,
  specification: text(LONG_TEXT_MAX),
  summary: text(SUMMARY_MAX).optional(),
  guests_max: count(GUESTS_MAX).optional(),
  suites: count(SUITES_MAX).optional(),
  built_area_m2: count(BUILT_AREA_MAX_M2).optional(),
  lifestyle_ids: termIds(MAX_TERMS_PER_KIND.lifestyle).optional(),
  architectural_style_ids: termIds(MAX_TERMS_PER_KIND.architectural_style).optional(),
};

/** Concept novo: Brand Partner + título, com a versão 1. */
export const newConceptInput = z.strictObject({
  brand_partner_id: id,
  title: text(NAME_MAX),
  ...versionContent,
});

/** Versão nova de um Concept existente. */
export const newVersionInput = z.strictObject({ concept_id: id, ...versionContent });

/** Concept novo (versão 1) ou versão nova — corpo de `create_concept_version`. */
export const createConceptVersionInput = z.union([newConceptInput, newVersionInput]);

export const approveConceptVersionInput = z.strictObject({
  concept_version_id: id,
  approval_refs: z
    .array(text(REF_MAX))
    .min(1)
    .max(APPROVAL_REFS_MAX)
    .refine((refs) => new Set(refs).size === refs.length, DUPLICATE_ITEM),
});

export const registerInvestorAuthorizationInput = z
  .strictObject({
    concept_id: id,
    instrument_ref: text(REF_MAX),
    valid_from: instant,
    valid_until: instant.optional(),
  })
  .refine(
    (input) =>
      input.valid_until === undefined ||
      Date.parse(input.valid_until) > Date.parse(input.valid_from),
    { message: END_BEFORE_START, path: ['valid_until'] },
  );

export const revokeInvestorAuthorizationInput = z.strictObject({
  investor_authorization_id: id,
  revocation_basis: text(REF_MAX),
});

export const createEditionInput = z.strictObject({
  concept_id: id,
  region: text(NAME_MAX),
  modality: z.enum(EDITION_MODALITIES),
  commercial_conditions: text(LONG_TEXT_MAX),
});

export const registerResidenceInput = z.strictObject({
  edition_id: id,
  label: text(LABEL_MAX),
  timezone: z.string().max(TIME_ZONE_MAX).refine(isIanaTimeZone, INVALID_TIME_ZONE),
  investor_authorization_id: id.optional(),
});

const termLabel = text(TERM_LABEL_MAX).refine(
  (label) => termSlug(label).length > 0,
  INVALID_TERM_LABEL,
);

export const createCatalogTermInput = z.strictObject({
  kind: z.enum(CATALOG_TERM_KINDS),
  label: termLabel,
});

export const updateCatalogTermInput = z.strictObject({
  catalog_term_id: id,
  label: termLabel,
  active: z.boolean(),
});

const cropStep = z.literal(CROP_STEPS);

export const uploadConceptCoverInput = z.strictObject({
  concept_id: id,
  image: z.base64().min(4).max(COVER_BASE64_MAX),
  alt: text(ALT_MAX),
  credit: text(CREDIT_MAX).optional(),
  crop_x: cropStep,
  crop_y: cropStep,
});

export const approveConceptMediaInput = z.strictObject({ concept_media_id: id });

export const withdrawConceptMediaInput = z.strictObject({
  concept_media_id: id,
  withdrawal_basis: text(REF_MAX),
});

export const setConceptCurationInput = z.strictObject({
  concept_id: id,
  rank: count(RANK_MAX).nullable(),
  featured: z.boolean(),
});

export const registerEditionReferenceValueInput = z.strictObject({
  edition_id: id,
  basis: z.enum(REFERENCE_VALUE_BASES),
  amount_minor: z.int().min(1).max(MAX_AMOUNT_MINOR),
  currency: z.enum(REFERENCE_VALUE_CURRENCIES),
  valid_from: instant.optional(),
});

export const endEditionReferenceValueInput = z.strictObject({ edition_reference_value_id: id });

export type RegisterBrandPartnerInput = z.infer<typeof registerBrandPartnerInput>;
export type AuthorizeBrandExposureInput = z.infer<typeof authorizeBrandExposureInput>;
export type TerminateBrandPartnerInput = z.infer<typeof terminateBrandPartnerInput>;
export type CreateConceptVersionInput = z.infer<typeof createConceptVersionInput>;
export type ApproveConceptVersionInput = z.infer<typeof approveConceptVersionInput>;
export type RegisterInvestorAuthorizationInput = z.infer<typeof registerInvestorAuthorizationInput>;
export type RevokeInvestorAuthorizationInput = z.infer<typeof revokeInvestorAuthorizationInput>;
export type CreateEditionInput = z.infer<typeof createEditionInput>;
export type RegisterResidenceInput = z.infer<typeof registerResidenceInput>;
export type CreateCatalogTermInput = z.infer<typeof createCatalogTermInput>;
export type UpdateCatalogTermInput = z.infer<typeof updateCatalogTermInput>;
export type UploadConceptCoverInput = z.infer<typeof uploadConceptCoverInput>;
export type ApproveConceptMediaInput = z.infer<typeof approveConceptMediaInput>;
export type WithdrawConceptMediaInput = z.infer<typeof withdrawConceptMediaInput>;
export type SetConceptCurationInput = z.infer<typeof setConceptCurationInput>;
export type RegisterEditionReferenceValueInput = z.infer<typeof registerEditionReferenceValueInput>;
export type EndEditionReferenceValueInput = z.infer<typeof endEditionReferenceValueInput>;
