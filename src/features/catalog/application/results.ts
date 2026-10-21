import type {
  BrandPartner,
  HomeConcept,
  HomeConceptVersion,
  HomeEdition,
  InvestorAuthorization,
  SecondHome,
} from '../domain/catalog';
import type {
  CatalogTerm,
  HomeConceptCuration,
  HomeConceptMedia,
  HomeEditionMedia,
  HomeEditionProjectedInvestment,
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

export function homeConceptResult(homeConcept: HomeConcept) {
  return {
    id: homeConcept.id,
    brand_partner_id: homeConcept.brandPartnerId,
    title: homeConcept.title,
    operation_id: homeConcept.operationId,
    created_at: homeConcept.createdAt.toISOString(),
  };
}

export function homeConceptVersionResult(version: HomeConceptVersion, homeConcept: HomeConcept) {
  return {
    id: version.id,
    home_concept_id: version.homeConceptId,
    brand_partner_id: homeConcept.brandPartnerId,
    title: homeConcept.title,
    version: version.version,
    state: version.state,
    essential_elements: [...version.essentialElements],
    preservation_premises: [...version.preservationPremises],
    specification: version.specification,
    summary: version.attributes.summary,
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
    home_concept_id: authorization.homeConceptId,
    party_id: authorization.partyId,
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

const list = (items: readonly string[] | null) => (items === null ? null : [...items]);

export function homeEditionResult(homeEdition: HomeEdition) {
  return {
    id: homeEdition.id,
    home_concept_id: homeEdition.homeConceptId,
    name: homeEdition.name,
    description: homeEdition.description,
    typology: homeEdition.typology,
    spatial_configuration: homeEdition.spatialConfiguration,
    projected_area_m2: homeEdition.projectedAreaM2,
    suites: homeEdition.suites,
    guests_max: homeEdition.guestsMax,
    rooms: list(homeEdition.rooms),
    amenities: list(homeEdition.amenities),
    characteristics: list(homeEdition.characteristics),
    material_state: homeEdition.materialState,
    finalized_at: iso(homeEdition.finalization?.at ?? null),
    finalized_by_user_id: homeEdition.finalization?.byUserId ?? null,
    finalized_role: homeEdition.finalization?.role ?? null,
    visibility: homeEdition.visibility,
    withdrawal_basis: homeEdition.withdrawalBasis,
    operation_id: homeEdition.operationId,
    created_at: homeEdition.createdAt.toISOString(),
  };
}

export function secondHomeResult(secondHome: SecondHome, homeConceptVersion: number) {
  return {
    id: secondHome.id,
    home_edition_id: secondHome.homeEditionId,
    home_concept_id: secondHome.homeConceptId,
    home_concept_version_id: secondHome.homeConceptVersionId,
    home_concept_version: homeConceptVersion,
    commercially_approved_at: secondHome.commerciallyApprovedAt.toISOString(),
    label: secondHome.label,
    timezone: secondHome.timezone,
    investor_authorization_id: secondHome.investorAuthorizationId,
    operation_id: secondHome.operationId,
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

/** Campos comuns da capa do Home Concept e da mídia da Home Edition (mesmo ciclo, ADR-0015). */
function mediaFields(media: Omit<HomeConceptMedia, 'id' | 'homeConceptId'>) {
  return {
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

export function homeConceptMediaResult(media: HomeConceptMedia) {
  return { id: media.id, home_concept_id: media.homeConceptId, ...mediaFields(media) };
}

export function homeEditionMediaResult(media: HomeEditionMedia) {
  return {
    id: media.id,
    home_edition_id: media.homeEditionId,
    kind: media.kind,
    ...mediaFields(media),
  };
}

export function homeConceptCurationResult(curation: HomeConceptCuration) {
  return {
    home_concept_id: curation.homeConceptId,
    rank: curation.rank,
    featured: curation.featured,
    operation_id: curation.operationId,
    updated_at: curation.updatedAt.toISOString(),
  };
}

/** `amount_minor` cabe no inteiro exato do JSON: o input limita a `MAX_AMOUNT_MINOR` (TECH-033). */
export function homeEditionProjectedInvestmentResult(value: HomeEditionProjectedInvestment) {
  return {
    id: value.id,
    home_edition_id: value.homeEditionId,
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
export type HomeConceptVersionResult = ReturnType<typeof homeConceptVersionResult>;
export type InvestorAuthorizationResult = ReturnType<typeof investorAuthorizationResult>;
export type HomeEditionResult = ReturnType<typeof homeEditionResult>;
export type SecondHomeResult = ReturnType<typeof secondHomeResult>;
export type CatalogTermResult = ReturnType<typeof catalogTermResult>;
export type HomeConceptMediaResult = ReturnType<typeof homeConceptMediaResult>;
export type HomeEditionMediaResult = ReturnType<typeof homeEditionMediaResult>;
export type HomeConceptCurationResult = ReturnType<typeof homeConceptCurationResult>;
export type HomeEditionProjectedInvestmentResult = ReturnType<
  typeof homeEditionProjectedInvestmentResult
>;
