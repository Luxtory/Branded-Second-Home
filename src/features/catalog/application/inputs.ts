import { z } from 'zod';
import { EDITION_MODALITIES } from '../domain/catalog';
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

/** Mensagem de validação quando o valor não é um fuso IANA conhecido. */
export const INVALID_TIME_ZONE = 'invalid_time_zone';
export const DUPLICATE_ITEM = 'duplicate_item';
export const END_BEFORE_START = 'end_before_start';

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

export type RegisterBrandPartnerInput = z.infer<typeof registerBrandPartnerInput>;
export type AuthorizeBrandExposureInput = z.infer<typeof authorizeBrandExposureInput>;
export type TerminateBrandPartnerInput = z.infer<typeof terminateBrandPartnerInput>;
export type CreateConceptVersionInput = z.infer<typeof createConceptVersionInput>;
export type ApproveConceptVersionInput = z.infer<typeof approveConceptVersionInput>;
export type RegisterInvestorAuthorizationInput = z.infer<typeof registerInvestorAuthorizationInput>;
export type RevokeInvestorAuthorizationInput = z.infer<typeof revokeInvestorAuthorizationInput>;
export type CreateEditionInput = z.infer<typeof createEditionInput>;
export type RegisterResidenceInput = z.infer<typeof registerResidenceInput>;
