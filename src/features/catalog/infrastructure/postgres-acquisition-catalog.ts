import { sql } from 'kysely';
import { CommandRejection, type DatabaseTransaction } from '@/features/platform';
import type { AcquisitionCatalog } from '../application/acquisition-port';
import { found, requireState } from '../application/command-support';
import { authorizationCovers, isBrandInUse } from '../domain/catalog';
import { postgresCatalogStore } from './postgres-catalog-store';

async function root(tx: DatabaseTransaction, id: string) {
  const row = await tx
    .selectFrom('app.second_home')
    .select([
      'id',
      'timezone',
      'home_edition_id',
      'home_concept_id',
      'home_concept_version_id',
      'investor_authorization_id',
    ])
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw new CommandRejection('ERR_NOT_FOUND');
  return row;
}
export const postgresAcquisitionCatalog: AcquisitionCatalog<DatabaseTransaction> = {
  async lockRoot(tx, id) {
    // Exact same canonical UUID key as the SQL aggregate triggers; no UPDATE grant on catalog's root.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('app.second_home:' || ${id.toLowerCase()}::text, 0))`.execute(
      tx,
    );
    return root(tx, id);
  },
  async lockForFormalization(tx, id, clock) {
    const origin = await root(tx, id);
    const concept = found(await postgresCatalogStore.homeConcept(tx, origin.home_concept_id));
    const partner = found(
      await postgresCatalogStore.brandPartner(tx, concept.brandPartnerId, 'share'),
    );
    const investor =
      origin.investor_authorization_id === null
        ? null
        : found(
            await postgresCatalogStore.investorAuthorization(
              tx,
              origin.investor_authorization_id,
              'share',
            ),
          );
    const locked = await this.lockRoot(tx, id);
    const now = clock.now();
    requireState(isBrandInUse(partner, now));
    if (investor !== null) requireState(authorizationCovers(investor, concept.id, now));
    const version = await tx
      .selectFrom('app.home_concept_version')
      .select(['state', 'home_concept_id'])
      .where('id', '=', origin.home_concept_version_id)
      .executeTakeFirst();
    const edition = found(await postgresCatalogStore.homeEdition(tx, origin.home_edition_id));
    requireState(
      version?.state === 'approved' &&
        version.home_concept_id === origin.home_concept_id &&
        edition.homeConceptId === origin.home_concept_id &&
        edition.materialState === 'finalized',
    );
    return { id: locked.id, timezone: locked.timezone, validatedAt: now };
  },
  async recordFormalization(tx, fact) {
    await tx
      .insertInto('app.acquisition')
      .values({
        id: fact.id,
        second_home_id: fact.secondHomeId,
        modality: fact.modality,
        location: fact.location,
        configuration_id: fact.configurationId,
        operation_start_date: fact.operationStartDate,
        initial_allocation_id: fact.initialAllocationId,
        basis_ref: fact.basisRef,
        formalized_at: fact.formalizedAt,
        operation_id: fact.operationId,
      })
      .execute();
  },
  async recordOperationStart(tx, fact) {
    await tx
      .insertInto('app.second_home_operation_start')
      .values({
        id: fact.id,
        second_home_id: fact.secondHomeId,
        acquisition_id: fact.acquisitionId,
        effective_start_date: fact.effectiveStartDate,
        operation_start_registered_at: fact.registeredAt,
        basis_ref: fact.basisRef,
        operation_id: fact.operationId,
      })
      .execute();
  },
};
