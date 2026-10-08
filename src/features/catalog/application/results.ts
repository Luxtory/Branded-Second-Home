import type {
  BrandPartner,
  Concept,
  ConceptVersion,
  Edition,
  InvestorAuthorization,
  Residence,
} from '../domain/catalog';
import type {
  CatalogTerm,
  ConceptCuration,
  ConceptMedia,
  EditionReferenceValue,
} from '../domain/collection';

/** Respostas das operações do catálogo (schemas do OpenAPI) — também o "depois" do `audit_log`. */
const iso = (date: Date | null) => (date === null ? null : date.toISOString());

export function brandPartnerResult(partner: BrandPartner) {
  return {
    id: partner.id,
    brand_name: partner.brandName,
    exposure_authorization_ref: partner.exposureAuthorizationRef,
    exposure_authorized_at: iso(partner.exposureAuthorizedAt),
    terminated_effective_at: iso(partner.terminatedEffectiveAt),
    termination_basis: partner.terminationBasis,
    termination_registered_at: iso(partner.terminationRegisteredAt),
    operation_id: partner.operationId,
    created_at: partner.createdAt.toISOString(),
  };
}

export function conceptResult(concept: Concept) {
  return {
    id: concept.id,
    brand_partner_id: concept.brandPartnerId,
    title: concept.title,
    operation_id: concept.operationId,
    created_at: concept.createdAt.toISOString(),
  };
}

export function conceptVersionResult(version: ConceptVersion, concept: Concept) {
  return {
    id: version.id,
    concept_id: version.conceptId,
    brand_partner_id: concept.brandPartnerId,
    title: concept.title,
    version: version.version,
    state: version.state,
    essential_elements: [...version.essentialElements],
    preservation_premises: [...version.preservationPremises],
    specification: version.specification,
    summary: version.attributes.summary,
    guests_max: version.attributes.guestsMax,
    suites: version.attributes.suites,
    built_area_m2: version.attributes.builtAreaM2,
    lifestyle_ids: [...version.lifestyleIds],
    architectural_style_ids: [...version.architecturalStyleIds],
    approval_refs: version.approval === null ? null : [...version.approval.approvalRefs],
    approved_at: iso(version.approval?.approvedAt ?? null),
    approved_by_user_id: version.approval?.approvedByUserId ?? null,
    approved_role: version.approval?.approvedRole ?? null,
    operation_id: version.operationId,
    created_at: version.createdAt.toISOString(),
  };
}

export function investorAuthorizationResult(authorization: InvestorAuthorization) {
  return {
    id: authorization.id,
    concept_id: authorization.conceptId,
    instrument_ref: authorization.instrumentRef,
    valid_from: authorization.validFrom.toISOString(),
    valid_until: iso(authorization.validUntil),
    revoked_at: iso(authorization.revokedAt),
    revocation_basis: authorization.revocationBasis,
    registered_by_user_id: authorization.registeredByUserId,
    registered_role: authorization.registeredRole,
    operation_id: authorization.operationId,
    created_at: authorization.createdAt.toISOString(),
  };
}

export function editionResult(edition: Edition) {
  return {
    id: edition.id,
    concept_id: edition.conceptId,
    region: edition.region,
    modality: edition.modality,
    commercial_conditions: edition.commercialConditions,
    operation_id: edition.operationId,
    created_at: edition.createdAt.toISOString(),
  };
}

export function residenceResult(residence: Residence, conceptVersion: number) {
  return {
    id: residence.id,
    edition_id: residence.editionId,
    concept_id: residence.conceptId,
    concept_version_id: residence.conceptVersionId,
    concept_version: conceptVersion,
    commercially_approved_at: residence.commerciallyApprovedAt.toISOString(),
    label: residence.label,
    timezone: residence.timezone,
    investor_authorization_id: residence.investorAuthorizationId,
    operation_id: residence.operationId,
  };
}

export function catalogTermResult(term: CatalogTerm) {
  return {
    id: term.id,
    kind: term.kind,
    slug: term.slug,
    label: term.label,
    active: term.active,
    operation_id: term.operationId,
    created_at: term.createdAt.toISOString(),
  };
}

export function conceptMediaResult(media: ConceptMedia) {
  return {
    id: media.id,
    concept_id: media.conceptId,
    state: media.state,
    alt: media.alt,
    credit: media.credit,
    crop_x: media.cropX,
    crop_y: media.cropY,
    source_sha256: media.sourceSha256,
    renditions: media.renditions.map(({ role, width, height }) => ({ role, width, height })),
    approved_at: iso(media.approval?.at ?? null),
    approved_by_user_id: media.approval?.byUserId ?? null,
    approved_role: media.approval?.role ?? null,
    withdrawn_at: iso(media.withdrawal?.at ?? null),
    withdrawal_basis: media.withdrawal?.basis ?? null,
    operation_id: media.operationId,
    created_at: media.createdAt.toISOString(),
  };
}

export function conceptCurationResult(curation: ConceptCuration) {
  return {
    concept_id: curation.conceptId,
    rank: curation.rank,
    featured: curation.featured,
    operation_id: curation.operationId,
    updated_at: curation.updatedAt.toISOString(),
  };
}

/** `amount_minor` cabe no inteiro exato do JSON: o input limita a `MAX_AMOUNT_MINOR` (TECH-033). */
export function editionReferenceValueResult(value: EditionReferenceValue) {
  return {
    id: value.id,
    edition_id: value.editionId,
    basis: value.basis,
    amount_minor: Number(value.amountMinor),
    currency: value.currency,
    valid_from: value.validFrom.toISOString(),
    valid_until: iso(value.validUntil),
    registered_by_user_id: value.registeredByUserId,
    registered_role: value.registeredRole,
    operation_id: value.operationId,
    created_at: value.createdAt.toISOString(),
  };
}

export type BrandPartnerResult = ReturnType<typeof brandPartnerResult>;
export type ConceptVersionResult = ReturnType<typeof conceptVersionResult>;
export type InvestorAuthorizationResult = ReturnType<typeof investorAuthorizationResult>;
export type EditionResult = ReturnType<typeof editionResult>;
export type ResidenceResult = ReturnType<typeof residenceResult>;
export type CatalogTermResult = ReturnType<typeof catalogTermResult>;
export type ConceptMediaResult = ReturnType<typeof conceptMediaResult>;
export type ConceptCurationResult = ReturnType<typeof conceptCurationResult>;
export type EditionReferenceValueResult = ReturnType<typeof editionReferenceValueResult>;
