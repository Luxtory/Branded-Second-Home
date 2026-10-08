import type { Selectable } from 'kysely';
import type { DatabaseTables } from '@/features/platform';
import type {
  BrandPartner,
  Concept,
  ConceptVersion,
  ConceptVersionState,
  Edition,
  EditionModality,
  InvestorAuthorization,
  Residence,
  StaffRoleName,
} from '../domain/catalog';
import type {
  CatalogTerm,
  CatalogTermKind,
  ConceptCuration,
  ConceptMedia,
  CropStep,
  EditionReferenceValue,
  MediaRendition,
  MediaState,
  ReferenceValueBasis,
  ReferenceValueCurrency,
} from '../domain/collection';

/** Linhas do schema `app` → objetos do domínio. Os CHECKs do banco garantem os valores dos enums. */
type Row<T extends keyof DatabaseTables> = Selectable<DatabaseTables[T]>;

export function toBrandPartner(row: Row<'app.brand_partner'>): BrandPartner {
  return {
    id: row.id,
    brandName: row.brand_name,
    exposureAuthorizationRef: row.exposure_authorization_ref,
    exposureAuthorizedAt: row.exposure_authorized_at,
    terminatedEffectiveAt: row.terminated_effective_at,
    terminationBasis: row.termination_basis,
    terminationRegisteredAt: row.termination_registered_at,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export function toConcept(row: Row<'app.concept'>): Concept {
  return {
    id: row.id,
    brandPartnerId: row.brand_partner_id,
    title: row.title,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

/** Classificações da versão, na ordem da posição. */
export type VersionTermRow = Pick<Row<'app.concept_version_term'>, 'term_id' | 'kind' | 'position'>;

const termIdsOf = (terms: readonly VersionTermRow[], kind: CatalogTermKind) =>
  terms
    .filter((term) => term.kind === kind)
    .sort((a, b) => a.position - b.position)
    .map((term) => term.term_id);

export function toConceptVersion(
  row: Row<'app.concept_version'>,
  terms: readonly VersionTermRow[],
): ConceptVersion {
  const refs = row.approval_refs;
  const at = row.approved_at;
  const by = row.approved_by_user_id;
  const role = row.approved_role;
  const operation = row.approval_operation_id;
  // O CHECK `concept_version_approval_check` garante que os campos da aprovação vêm todos ou nenhum.
  const approval =
    refs !== null && at !== null && by !== null && role !== null && operation !== null
      ? {
          approvalRefs: refs,
          approvedAt: at,
          approvedByUserId: by,
          approvedRole: role as StaffRoleName,
          approvalOperationId: operation,
        }
      : null;
  return {
    id: row.id,
    conceptId: row.concept_id,
    version: row.version,
    essentialElements: row.essential_elements,
    preservationPremises: row.preservation_premises,
    specification: row.specification,
    attributes: {
      summary: row.summary,
      guestsMax: row.guests_max,
      suites: row.suites,
      builtAreaM2: row.built_area_m2,
    },
    lifestyleIds: termIdsOf(terms, 'lifestyle'),
    architecturalStyleIds: termIdsOf(terms, 'architectural_style'),
    state: row.state as ConceptVersionState,
    approval,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export function toInvestorAuthorization(
  row: Row<'app.investor_authorization'>,
): InvestorAuthorization {
  return {
    id: row.id,
    conceptId: row.concept_id,
    instrumentRef: row.instrument_ref,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    registeredByUserId: row.registered_by_user_id,
    registeredRole: row.registered_role as StaffRoleName,
    operationId: row.operation_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revocationBasis: row.revocation_basis,
  };
}

export function toEdition(row: Row<'app.edition'>): Edition {
  return {
    id: row.id,
    conceptId: row.concept_id,
    region: row.region,
    modality: row.modality as EditionModality,
    commercialConditions: row.commercial_conditions,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export function toResidence(row: Row<'app.residence'>): Residence {
  return {
    id: row.id,
    editionId: row.edition_id,
    conceptId: row.concept_id,
    conceptVersionId: row.concept_version_id,
    commerciallyApprovedAt: row.commercially_approved_at,
    label: row.label,
    timezone: row.timezone,
    investorAuthorizationId: row.investor_authorization_id,
    operationId: row.operation_id,
  };
}

export function toCatalogTerm(row: Row<'app.catalog_term'>): CatalogTerm {
  return {
    id: row.id,
    kind: row.kind as CatalogTermKind,
    slug: row.slug,
    label: row.label,
    active: row.active,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export type MediaFileRow = Pick<Row<'app.concept_media_file'>, 'role' | 'width' | 'height'>;

export function toConceptMedia(
  row: Row<'app.concept_media'>,
  files: readonly MediaFileRow[],
): ConceptMedia {
  const approvedAt = row.approved_at;
  const approvedBy = row.approved_by_user_id;
  const approvedRole = row.approved_role;
  const approvalOperation = row.approval_operation_id;
  const withdrawnAt = row.withdrawn_at;
  const withdrawalBasis = row.withdrawal_basis;
  const withdrawalOperation = row.withdrawal_operation_id;
  // Os CHECKs `concept_media_approval_check` e `concept_media_withdrawal_check` garantem todos ou nenhum.
  return {
    id: row.id,
    conceptId: row.concept_id,
    state: row.state as MediaState,
    alt: row.alt,
    credit: row.credit,
    cropX: row.crop_x as CropStep,
    cropY: row.crop_y as CropStep,
    sourceSha256: row.source_sha256,
    renditions: files.map((file): MediaRendition => ({
      role: file.role as MediaRendition['role'],
      width: file.width,
      height: file.height,
    })),
    approval:
      approvedAt !== null &&
      approvedBy !== null &&
      approvedRole !== null &&
      approvalOperation !== null
        ? {
            at: approvedAt,
            byUserId: approvedBy,
            role: approvedRole as StaffRoleName,
            operationId: approvalOperation,
          }
        : null,
    withdrawal:
      withdrawnAt !== null && withdrawalBasis !== null && withdrawalOperation !== null
        ? { at: withdrawnAt, basis: withdrawalBasis, operationId: withdrawalOperation }
        : null,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export function toConceptCuration(row: Row<'app.concept_curation'>): ConceptCuration {
  return {
    conceptId: row.concept_id,
    rank: row.rank,
    featured: row.featured,
    operationId: row.operation_id,
    updatedAt: row.updated_at,
  };
}

export function toEditionReferenceValue(
  row: Row<'app.edition_reference_value'>,
): EditionReferenceValue {
  return {
    id: row.id,
    editionId: row.edition_id,
    basis: row.basis as ReferenceValueBasis,
    // `bigint` chega como texto do driver; nunca passa por ponto flutuante (TECH-033).
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency as ReferenceValueCurrency,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    registeredByUserId: row.registered_by_user_id,
    registeredRole: row.registered_role as StaffRoleName,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}
