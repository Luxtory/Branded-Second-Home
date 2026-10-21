import { z } from 'zod';
import { partyDocumentInput } from '@/features/identity';
import {
  CATALOG_TERM_KINDS,
  CROP_STEPS,
  HOME_EDITION_MEDIA_KINDS,
  MAX_TERMS_PER_KIND,
  PROJECTED_INVESTMENT_CURRENCIES,
  termSlug,
} from '../domain/collection';
import { FORBIDDEN_TERM, framesProductAsDwelling, hasForbiddenTerm } from '../domain/terminology';
import { isIanaTimeZone } from '../domain/time-zone';

/**
 * Corpos das operações do catálogo (OpenAPI, tag `catalog`). As telas usam os mesmos schemas para mostrar o erro no
 * campo; a decisão é sempre do command (ADR-0010 §6). Todo texto registrado passa pela checagem de terminologia; os
 * campos de produto (Home Concept, Home Edition) também pela da BR-377.
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
const PROJECTED_AREA_MAX_M2 = 100_000;
const TYPOLOGY_MAX = 200;
const SPATIAL_CONFIGURATION_MAX = 4_000;
const EDITION_LIST_ITEM_MAX = 200;
const TERM_LABEL_MAX = 80;
const ALT_MAX = 300;
const CREDIT_MAX = 200;
const RANK_MAX = 999;
/** Arquivo de imagem até 3 MiB, em base64 (4 caracteres a cada 3 bytes): cabe no limite de corpo da Vercel. */
export const COVER_MAX_BYTES = 3 * 1024 * 1024;
const COVER_BASE64_MAX = Math.ceil(COVER_MAX_BYTES / 3) * 4;
/** Maior média projetada aceita, em unidades menores (abaixo do inteiro exato do JSON). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

/** Mensagem de validação quando o valor não é um fuso IANA conhecido. */
export const INVALID_TIME_ZONE = 'invalid_time_zone';
export const DUPLICATE_ITEM = 'duplicate_item';
export const END_BEFORE_START = 'end_before_start';
/** Rótulo sem nenhuma letra ou número (não gera slug). */
export const INVALID_TERM_LABEL = 'invalid_term_label';
/** Correção editorial sem nome nem descrição. */
export const NOTHING_TO_CORRECT = 'nothing_to_correct';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasForbiddenTerm(value), FORBIDDEN_TERM);

/** Texto de produto (Home Concept, Home Edition): também sem enquadramento como moradia (BR-377). */
const productText = (max: number) =>
  text(max).refine((value) => !framesProductAsDwelling(value), FORBIDDEN_TERM);

const textList = z.array(productText(LIST_ITEM_MAX)).min(1).max(LIST_MAX_ITEMS);
const editionList = z.array(productText(EDITION_LIST_ITEM_MAX)).min(1).max(LIST_MAX_ITEMS);
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
  specification: productText(LONG_TEXT_MAX),
  summary: productText(SUMMARY_MAX).optional(),
  lifestyle_ids: termIds(MAX_TERMS_PER_KIND.lifestyle).optional(),
  architectural_style_ids: termIds(MAX_TERMS_PER_KIND.architectural_style).optional(),
};

/** Home Concept novo: Brand Partner + título, com a versão 1. */
export const newHomeConceptInput = z.strictObject({
  brand_partner_id: id,
  title: productText(NAME_MAX),
  ...versionContent,
});

/** Versão nova de um Home Concept existente. */
export const newVersionInput = z.strictObject({ home_concept_id: id, ...versionContent });

/** Home Concept novo (versão 1) ou versão nova — corpo de `create_home_concept_version`. */
export const createHomeConceptVersionInput = z.union([newHomeConceptInput, newVersionInput]);

export const approveHomeConceptVersionInput = z.strictObject({
  home_concept_version_id: id,
  approval_refs: z
    .array(text(REF_MAX))
    .min(1)
    .max(APPROVAL_REFS_MAX)
    .refine((refs) => new Set(refs).size === refs.length, DUPLICATE_ITEM),
});

export const registerInvestorAuthorizationInput = z
  .strictObject({
    home_concept_id: id,
    // W7 (D-W3-1): CPF/CNPJ do Investor, normalizado pelo módulo identity; só resolve a party, nunca é gravado.
    investor_document: partyDocumentInput,
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

/**
 * Definição material e textos editoriais da Home Edition (BR-031): em preparação, a mesma forma serve à criação e à
 * edição; depois da finalização, a definição material não muda mais (BR-036).
 */
const homeEditionContent = {
  name: productText(NAME_MAX),
  description: productText(LONG_TEXT_MAX),
  typology: productText(TYPOLOGY_MAX),
  spatial_configuration: productText(SPATIAL_CONFIGURATION_MAX),
  projected_area_m2: count(PROJECTED_AREA_MAX_M2),
  suites: count(SUITES_MAX),
  guests_max: count(GUESTS_MAX),
  rooms: editionList.optional(),
  amenities: editionList.optional(),
  characteristics: editionList.optional(),
};

export const createHomeEditionInput = z.strictObject({
  home_concept_id: id,
  ...homeEditionContent,
});

export const updateHomeEditionDraftInput = z.strictObject({
  home_edition_id: id,
  ...homeEditionContent,
});

export const finalizeHomeEditionInput = z.strictObject({ home_edition_id: id });

export const publishHomeEditionInput = z.strictObject({ home_edition_id: id });

export const withdrawHomeEditionInput = z.strictObject({
  home_edition_id: id,
  withdrawal_basis: text(REF_MAX),
});

export const correctHomeEditionEditorialInput = z
  .strictObject({
    home_edition_id: id,
    name: productText(NAME_MAX).optional(),
    description: productText(LONG_TEXT_MAX).optional(),
    correction_basis: text(REF_MAX),
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: NOTHING_TO_CORRECT,
    path: ['name'],
  });

export const registerSecondHomeInput = z.strictObject({
  home_edition_id: id,
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

const mediaContent = {
  image: z.base64().min(4).max(COVER_BASE64_MAX),
  alt: text(ALT_MAX),
  credit: text(CREDIT_MAX).optional(),
  crop_x: cropStep,
  crop_y: cropStep,
};

export const uploadHomeConceptCoverInput = z.strictObject({
  home_concept_id: id,
  ...mediaContent,
});

export const approveHomeConceptMediaInput = z.strictObject({ home_concept_media_id: id });

export const withdrawHomeConceptMediaInput = z.strictObject({
  home_concept_media_id: id,
  withdrawal_basis: text(REF_MAX),
});

export const uploadHomeEditionMediaInput = z.strictObject({
  home_edition_id: id,
  kind: z.enum(HOME_EDITION_MEDIA_KINDS),
  ...mediaContent,
});

export const approveHomeEditionMediaInput = z.strictObject({ home_edition_media_id: id });

export const withdrawHomeEditionMediaInput = z.strictObject({
  home_edition_media_id: id,
  withdrawal_basis: text(REF_MAX),
});

export const setHomeConceptCurationInput = z.strictObject({
  home_concept_id: id,
  rank: count(RANK_MAX).nullable(),
  featured: z.boolean(),
});

export const registerHomeEditionProjectedInvestmentInput = z.strictObject({
  home_edition_id: id,
  amount_minor: z.int().min(1).max(MAX_AMOUNT_MINOR),
  currency: z.enum(PROJECTED_INVESTMENT_CURRENCIES),
  valid_from: instant.optional(),
});

export const endHomeEditionProjectedInvestmentInput = z.strictObject({
  home_edition_projected_investment_id: id,
});

export type RegisterBrandPartnerInput = z.infer<typeof registerBrandPartnerInput>;
export type AuthorizeBrandExposureInput = z.infer<typeof authorizeBrandExposureInput>;
export type TerminateBrandPartnerInput = z.infer<typeof terminateBrandPartnerInput>;
export type CreateHomeConceptVersionInput = z.infer<typeof createHomeConceptVersionInput>;
export type ApproveHomeConceptVersionInput = z.infer<typeof approveHomeConceptVersionInput>;
export type RegisterInvestorAuthorizationInput = z.infer<typeof registerInvestorAuthorizationInput>;
export type RevokeInvestorAuthorizationInput = z.infer<typeof revokeInvestorAuthorizationInput>;
export type CreateHomeEditionInput = z.infer<typeof createHomeEditionInput>;
export type UpdateHomeEditionDraftInput = z.infer<typeof updateHomeEditionDraftInput>;
export type FinalizeHomeEditionInput = z.infer<typeof finalizeHomeEditionInput>;
export type PublishHomeEditionInput = z.infer<typeof publishHomeEditionInput>;
export type WithdrawHomeEditionInput = z.infer<typeof withdrawHomeEditionInput>;
export type CorrectHomeEditionEditorialInput = z.infer<typeof correctHomeEditionEditorialInput>;
export type RegisterSecondHomeInput = z.infer<typeof registerSecondHomeInput>;
export type CreateCatalogTermInput = z.infer<typeof createCatalogTermInput>;
export type UpdateCatalogTermInput = z.infer<typeof updateCatalogTermInput>;
export type UploadHomeConceptCoverInput = z.infer<typeof uploadHomeConceptCoverInput>;
export type ApproveHomeConceptMediaInput = z.infer<typeof approveHomeConceptMediaInput>;
export type WithdrawHomeConceptMediaInput = z.infer<typeof withdrawHomeConceptMediaInput>;
export type UploadHomeEditionMediaInput = z.infer<typeof uploadHomeEditionMediaInput>;
export type ApproveHomeEditionMediaInput = z.infer<typeof approveHomeEditionMediaInput>;
export type WithdrawHomeEditionMediaInput = z.infer<typeof withdrawHomeEditionMediaInput>;
export type SetHomeConceptCurationInput = z.infer<typeof setHomeConceptCurationInput>;
export type RegisterHomeEditionProjectedInvestmentInput = z.infer<
  typeof registerHomeEditionProjectedInvestmentInput
>;
export type EndHomeEditionProjectedInvestmentInput = z.infer<
  typeof endHomeEditionProjectedInvestmentInput
>;
