import type { DatabaseTransaction } from '@/features/platform';
import type { CatalogStore } from '../application/ports';
import {
  toBrandPartner,
  toConcept,
  toConceptVersion,
  toEdition,
  toInvestorAuthorization,
} from './rows';

/**
 * Persistência do catálogo como `luxtory_app`, na transação do command (ADR-0006; RLS só para o papel). Travas
 * (ADR-0010 §8): `share` → `FOR SHARE` (verificar um uso; vários ao mesmo tempo); `exclusive` → `FOR NO KEY UPDATE`
 * (mudar o estado ou serializar versões sem bloquear as FKs que referenciam a linha).
 */
export const postgresCatalogStore: CatalogStore<DatabaseTransaction> = {
  async brandPartner(tx, id, lock) {
    let query = tx.selectFrom('app.brand_partner').selectAll().where('id', '=', id);
    query = lock === 'share' ? query.forShare() : query.forNoKeyUpdate();
    const row = await query.executeTakeFirst();
    return row === undefined ? null : toBrandPartner(row);
  },

  async concept(tx, id) {
    const row = await tx
      .selectFrom('app.concept')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toConcept(row);
  },

  async conceptVersion(tx, id) {
    const row = await tx
      .selectFrom('app.concept_version')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toConceptVersion(row);
  },

  async latestVersionNumber(tx, conceptId) {
    const row = await tx
      .selectFrom('app.concept_version')
      .select((eb) => eb.fn.max('version').as('latest'))
      .where('concept_id', '=', conceptId)
      .executeTakeFirst();
    return row?.latest ?? null;
  },

  async currentApprovedVersion(tx, conceptId) {
    const row = await tx
      .selectFrom('app.concept_version')
      .selectAll()
      .where('concept_id', '=', conceptId)
      .where('state', '=', 'approved')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row === undefined ? null : toConceptVersion(row);
  },

  async edition(tx, id) {
    const row = await tx
      .selectFrom('app.edition')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toEdition(row);
  },

  async investorAuthorization(tx, id, lock) {
    let query = tx.selectFrom('app.investor_authorization').selectAll().where('id', '=', id);
    query = lock === 'share' ? query.forShare() : query.forNoKeyUpdate();
    const row = await query.executeTakeFirst();
    return row === undefined ? null : toInvestorAuthorization(row);
  },

  async insertBrandPartner(tx, partner) {
    await tx
      .insertInto('app.brand_partner')
      .values({
        id: partner.id,
        brand_name: partner.brandName,
        exposure_authorization_ref: partner.exposureAuthorizationRef,
        exposure_authorized_at: partner.exposureAuthorizedAt,
        operation_id: partner.operationId,
        created_at: partner.createdAt,
      })
      .execute();
  },

  async recordExposure(tx, id, ref, at) {
    const row = await tx
      .updateTable('app.brand_partner')
      .set({ exposure_authorization_ref: ref, exposure_authorized_at: at })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toBrandPartner(row);
  },

  async recordTermination(tx, id, termination) {
    const row = await tx
      .updateTable('app.brand_partner')
      .set({
        terminated_effective_at: termination.effectiveAt,
        termination_basis: termination.basis,
        termination_registered_at: termination.registeredAt,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toBrandPartner(row);
  },

  async insertConcept(tx, concept) {
    await tx
      .insertInto('app.concept')
      .values({
        id: concept.id,
        brand_partner_id: concept.brandPartnerId,
        title: concept.title,
        operation_id: concept.operationId,
        created_at: concept.createdAt,
      })
      .execute();
  },

  async insertConceptVersion(tx, version) {
    await tx
      .insertInto('app.concept_version')
      .values({
        id: version.id,
        concept_id: version.conceptId,
        version: version.version,
        essential_elements: [...version.essentialElements],
        preservation_premises: [...version.preservationPremises],
        specification: version.specification,
        state: version.state,
        operation_id: version.operationId,
        created_at: version.createdAt,
      })
      .execute();
  },

  async approveConceptVersion(tx, id, approval) {
    const row = await tx
      .updateTable('app.concept_version')
      .set({
        state: 'approved',
        approval_refs: [...approval.approvalRefs],
        approved_at: approval.approvedAt,
        approved_by_user_id: approval.approvedByUserId,
        approved_role: approval.approvedRole,
        approval_operation_id: approval.approvalOperationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toConceptVersion(row);
  },

  async insertInvestorAuthorization(tx, authorization) {
    await tx
      .insertInto('app.investor_authorization')
      .values({
        id: authorization.id,
        concept_id: authorization.conceptId,
        instrument_ref: authorization.instrumentRef,
        valid_from: authorization.validFrom,
        valid_until: authorization.validUntil,
        registered_by_user_id: authorization.registeredByUserId,
        registered_role: authorization.registeredRole,
        operation_id: authorization.operationId,
        created_at: authorization.createdAt,
      })
      .execute();
  },

  async revokeInvestorAuthorization(tx, id, revocation) {
    const row = await tx
      .updateTable('app.investor_authorization')
      .set({ revoked_at: revocation.at, revocation_basis: revocation.basis })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toInvestorAuthorization(row);
  },

  async insertEdition(tx, edition) {
    await tx
      .insertInto('app.edition')
      .values({
        id: edition.id,
        concept_id: edition.conceptId,
        region: edition.region,
        modality: edition.modality,
        commercial_conditions: edition.commercialConditions,
        operation_id: edition.operationId,
        created_at: edition.createdAt,
      })
      .execute();
  },

  async insertResidence(tx, residence) {
    await tx
      .insertInto('app.residence')
      .values({
        id: residence.id,
        edition_id: residence.editionId,
        concept_id: residence.conceptId,
        concept_version_id: residence.conceptVersionId,
        commercially_approved_at: residence.commerciallyApprovedAt,
        label: residence.label,
        timezone: residence.timezone,
        investor_authorization_id: residence.investorAuthorizationId,
        operation_id: residence.operationId,
      })
      .execute();
  },
};
