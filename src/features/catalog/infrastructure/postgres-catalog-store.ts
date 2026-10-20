import type { DatabaseTransaction } from '@/features/platform';
import type { CatalogStore } from '../application/ports';
import type { HomeEditionEditorial, HomeEditionMaterial } from '../domain/catalog';
import { postgresCollectionStore } from './postgres-collection-store';
import { postgresHomeEditionMediaStore } from './postgres-home-edition-media-store';
import {
  toBrandPartner,
  toHomeConcept,
  toHomeConceptVersion,
  toHomeEdition,
  toInvestorAuthorization,
} from './rows';

type Tx = DatabaseTransaction;

/** Definição material e textos editoriais da Home Edition (BR-031), nas colunas da tabela. */
function materialColumns(content: HomeEditionMaterial & HomeEditionEditorial) {
  return {
    name: content.name,
    description: content.description,
    typology: content.typology,
    spatial_configuration: content.spatialConfiguration,
    projected_area_m2: content.projectedAreaM2,
    suites: content.suites,
    guests_max: content.guestsMax,
    rooms: content.rooms === null ? null : [...content.rooms],
    amenities: content.amenities === null ? null : [...content.amenities],
    characteristics: content.characteristics === null ? null : [...content.characteristics],
  };
}

/** Classificações da versão (ordem pela posição; o mapeador separa por vocabulário). */
function versionTerms(tx: Tx, versionId: string) {
  return tx
    .selectFrom('app.home_concept_version_term')
    .select(['term_id', 'kind', 'position'])
    .where('home_concept_version_id', '=', versionId)
    .orderBy('kind')
    .orderBy('position')
    .execute();
}

/**
 * Persistência do catálogo como `luxtory_app`, na transação do command (ADR-0006; RLS só para o papel). Travas
 * (ADR-0010 §8): `share` → `FOR SHARE` (verificar um uso; vários ao mesmo tempo); `exclusive` → `FOR NO KEY UPDATE`
 * (mudar o estado ou serializar versões sem bloquear as FKs que referenciam a linha).
 */
export const postgresCatalogStore: CatalogStore<DatabaseTransaction> = {
  ...postgresCollectionStore,
  ...postgresHomeEditionMediaStore,

  async brandPartner(tx, id, lock) {
    let query = tx.selectFrom('app.brand_partner').selectAll().where('id', '=', id);
    query = lock === 'share' ? query.forShare() : query.forNoKeyUpdate();
    const row = await query.executeTakeFirst();
    return row === undefined ? null : toBrandPartner(row);
  },

  async homeConcept(tx, id) {
    const row = await tx
      .selectFrom('app.home_concept')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toHomeConcept(row);
  },

  async homeConceptVersion(tx, id) {
    const row = await tx
      .selectFrom('app.home_concept_version')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? null : toHomeConceptVersion(row, await versionTerms(tx, row.id));
  },

  async latestVersionNumber(tx, homeConceptId) {
    const row = await tx
      .selectFrom('app.home_concept_version')
      .select((eb) => eb.fn.max('version').as('latest'))
      .where('home_concept_id', '=', homeConceptId)
      .executeTakeFirst();
    return row?.latest ?? null;
  },

  async currentApprovedVersion(tx, homeConceptId) {
    const row = await tx
      .selectFrom('app.home_concept_version')
      .selectAll()
      .where('home_concept_id', '=', homeConceptId)
      .where('state', '=', 'approved')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row === undefined ? null : toHomeConceptVersion(row, await versionTerms(tx, row.id));
  },

  async homeEdition(tx, id, lock) {
    let query = tx.selectFrom('app.home_edition').selectAll().where('id', '=', id);
    if (lock === 'share') query = query.forShare();
    if (lock === 'exclusive') query = query.forNoKeyUpdate();
    const row = await query.executeTakeFirst();
    return row === undefined ? null : toHomeEdition(row);
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

  async insertHomeConcept(tx, homeConcept) {
    await tx
      .insertInto('app.home_concept')
      .values({
        id: homeConcept.id,
        brand_partner_id: homeConcept.brandPartnerId,
        title: homeConcept.title,
        operation_id: homeConcept.operationId,
        created_at: homeConcept.createdAt,
      })
      .execute();
  },

  async insertHomeConceptVersion(tx, version) {
    await tx
      .insertInto('app.home_concept_version')
      .values({
        id: version.id,
        home_concept_id: version.homeConceptId,
        version: version.version,
        essential_elements: [...version.essentialElements],
        preservation_premises: [...version.preservationPremises],
        specification: version.specification,
        summary: version.attributes.summary,
        state: version.state,
        operation_id: version.operationId,
        created_at: version.createdAt,
      })
      .execute();
    const terms = [
      ...version.lifestyleIds.map((termId, index) => ({ termId, index, kind: 'lifestyle' })),
      ...version.architecturalStyleIds.map((termId, index) => ({
        termId,
        index,
        kind: 'architectural_style',
      })),
    ];
    if (terms.length === 0) return;
    await tx
      .insertInto('app.home_concept_version_term')
      .values(
        terms.map(({ termId, index, kind }) => ({
          home_concept_version_id: version.id,
          term_id: termId,
          kind,
          position: index + 1,
        })),
      )
      .execute();
  },

  async approveHomeConceptVersion(tx, id, approval) {
    const row = await tx
      .updateTable('app.home_concept_version')
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
    return toHomeConceptVersion(row, await versionTerms(tx, row.id));
  },

  async insertInvestorAuthorization(tx, authorization) {
    await tx
      .insertInto('app.investor_authorization')
      .values({
        id: authorization.id,
        home_concept_id: authorization.homeConceptId,
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

  async insertHomeEdition(tx, homeEdition) {
    await tx
      .insertInto('app.home_edition')
      .values({
        id: homeEdition.id,
        home_concept_id: homeEdition.homeConceptId,
        ...materialColumns(homeEdition),
        material_state: homeEdition.materialState,
        visibility: homeEdition.visibility,
        operation_id: homeEdition.operationId,
        created_at: homeEdition.createdAt,
      })
      .execute();
  },

  async updateHomeEditionDraft(tx, id, content) {
    const row = await tx
      .updateTable('app.home_edition')
      .set(materialColumns(content))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEdition(row);
  },

  async finalizeHomeEdition(tx, id, finalization) {
    const row = await tx
      .updateTable('app.home_edition')
      .set({
        material_state: 'finalized',
        finalized_at: finalization.at,
        finalized_by_user_id: finalization.byUserId,
        finalized_role: finalization.role,
        finalization_operation_id: finalization.operationId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEdition(row);
  },

  async setHomeEditionVisibility(tx, id, change) {
    const row = await tx
      .updateTable('app.home_edition')
      .set({ visibility: change.visibility, withdrawal_basis: change.withdrawalBasis })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEdition(row);
  },

  async correctHomeEditionEditorial(tx, id, editorial) {
    const row = await tx
      .updateTable('app.home_edition')
      .set({ name: editorial.name, description: editorial.description })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toHomeEdition(row);
  },

  async insertSecondHome(tx, secondHome) {
    await tx
      .insertInto('app.second_home')
      .values({
        id: secondHome.id,
        home_edition_id: secondHome.homeEditionId,
        home_concept_id: secondHome.homeConceptId,
        home_concept_version_id: secondHome.homeConceptVersionId,
        commercially_approved_at: secondHome.commerciallyApprovedAt,
        label: secondHome.label,
        timezone: secondHome.timezone,
        investor_authorization_id: secondHome.investorAuthorizationId,
        operation_id: secondHome.operationId,
      })
      .execute();
  },
};
