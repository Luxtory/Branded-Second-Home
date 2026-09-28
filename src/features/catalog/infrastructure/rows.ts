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

export function toConceptVersion(row: Row<'app.concept_version'>): ConceptVersion {
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
