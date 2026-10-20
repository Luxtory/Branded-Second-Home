import type { Selectable } from 'kysely';
import type { DatabaseTables } from '@/features/platform';
import type {
  BrandPartner,
  HomeConcept,
  HomeConceptVersion,
  HomeConceptVersionState,
  HomeEdition,
  HomeEditionMaterialState,
  HomeEditionVisibility,
  InvestorAuthorization,
  SecondHome,
  StaffRoleName,
} from '../domain/catalog';
import type {
  CatalogTerm,
  CatalogTermKind,
  HomeConceptCuration,
  HomeConceptMedia,
  CropStep,
  HomeEditionMedia,
  HomeEditionMediaKind,
  HomeEditionProjectedInvestment,
  MediaRendition,
  MediaState,
  ProjectedInvestmentCurrency,
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

export function toHomeConcept(row: Row<'app.home_concept'>): HomeConcept {
  return {
    id: row.id,
    brandPartnerId: row.brand_partner_id,
    title: row.title,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

/** Classificações da versão, na ordem da posição. */
export type VersionTermRow = Pick<
  Row<'app.home_concept_version_term'>,
  'term_id' | 'kind' | 'position'
>;

const termIdsOf = (terms: readonly VersionTermRow[], kind: CatalogTermKind) =>
  terms
    .filter((term) => term.kind === kind)
    .sort((a, b) => a.position - b.position)
    .map((term) => term.term_id);

export function toHomeConceptVersion(
  row: Row<'app.home_concept_version'>,
  terms: readonly VersionTermRow[],
): HomeConceptVersion {
  const refs = row.approval_refs;
  const at = row.approved_at;
  const by = row.approved_by_user_id;
  const role = row.approved_role;
  const operation = row.approval_operation_id;
  // O CHECK `home_concept_version_approval_check` garante que os campos da aprovação vêm todos ou nenhum.
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
    homeConceptId: row.home_concept_id,
    version: row.version,
    essentialElements: row.essential_elements,
    preservationPremises: row.preservation_premises,
    specification: row.specification,
    attributes: {
      summary: row.summary,
    },
    lifestyleIds: termIdsOf(terms, 'lifestyle'),
    architecturalStyleIds: termIdsOf(terms, 'architectural_style'),
    state: row.state as HomeConceptVersionState,
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
    homeConceptId: row.home_concept_id,
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

export function toHomeEdition(row: Row<'app.home_edition'>): HomeEdition {
  const at = row.finalized_at;
  const by = row.finalized_by_user_id;
  const role = row.finalized_role;
  const operation = row.finalization_operation_id;
  // O CHECK `home_edition_finalization_check` garante que os campos da finalização vêm todos ou nenhum.
  return {
    id: row.id,
    homeConceptId: row.home_concept_id,
    name: row.name,
    description: row.description,
    typology: row.typology,
    spatialConfiguration: row.spatial_configuration,
    projectedAreaM2: row.projected_area_m2,
    suites: row.suites,
    guestsMax: row.guests_max,
    rooms: row.rooms,
    amenities: row.amenities,
    characteristics: row.characteristics,
    materialState: row.material_state as HomeEditionMaterialState,
    finalization:
      at !== null && by !== null && role !== null && operation !== null
        ? { at, byUserId: by, role: role as StaffRoleName, operationId: operation }
        : null,
    visibility: row.visibility as HomeEditionVisibility,
    withdrawalBasis: row.withdrawal_basis,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}

export function toSecondHome(row: Row<'app.second_home'>): SecondHome {
  return {
    id: row.id,
    homeEditionId: row.home_edition_id,
    homeConceptId: row.home_concept_id,
    homeConceptVersionId: row.home_concept_version_id,
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

export type MediaFileRow = Pick<Row<'app.home_concept_media_file'>, 'role' | 'width' | 'height'>;

/** Colunas comuns da capa do Home Concept e da mídia da Home Edition (mesmo ciclo, ADR-0015). */
type MediaRow = Omit<Row<'app.home_concept_media'>, 'home_concept_id'>;

export function toHomeConceptMedia(
  row: Row<'app.home_concept_media'>,
  files: readonly MediaFileRow[],
): HomeConceptMedia {
  return { ...toMedia(row, files), homeConceptId: row.home_concept_id };
}

export function toHomeEditionMedia(
  row: Row<'app.home_edition_media'>,
  files: readonly MediaFileRow[],
): HomeEditionMedia {
  return {
    ...toMedia(row, files),
    homeEditionId: row.home_edition_id,
    kind: row.kind as HomeEditionMediaKind,
  };
}

function toMedia(
  row: MediaRow,
  files: readonly MediaFileRow[],
): Omit<HomeConceptMedia, 'homeConceptId'> {
  const approvedAt = row.approved_at;
  const approvedBy = row.approved_by_user_id;
  const approvedRole = row.approved_role;
  const approvalOperation = row.approval_operation_id;
  const withdrawnAt = row.withdrawn_at;
  const withdrawalBasis = row.withdrawal_basis;
  const withdrawalOperation = row.withdrawal_operation_id;
  // Os CHECKs `*_media_approval_check` e `*_media_withdrawal_check` garantem todos ou nenhum.
  return {
    id: row.id,
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

export function toHomeConceptCuration(row: Row<'app.home_concept_curation'>): HomeConceptCuration {
  return {
    homeConceptId: row.home_concept_id,
    rank: row.rank,
    featured: row.featured,
    operationId: row.operation_id,
    updatedAt: row.updated_at,
  };
}

export function toHomeEditionProjectedInvestment(
  row: Row<'app.home_edition_projected_investment'>,
): HomeEditionProjectedInvestment {
  return {
    id: row.id,
    homeEditionId: row.home_edition_id,
    // `bigint` chega como texto do driver; nunca passa por ponto flutuante (TECH-033).
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency as ProjectedInvestmentCurrency,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    registeredByUserId: row.registered_by_user_id,
    registeredRole: row.registered_role as StaffRoleName,
    operationId: row.operation_id,
    createdAt: row.created_at,
  };
}
