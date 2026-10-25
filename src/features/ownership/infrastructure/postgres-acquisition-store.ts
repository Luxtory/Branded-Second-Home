import { sql } from 'kysely';
import {
  CommandRejection,
  violatedConstraint,
  type DatabaseTransaction,
} from '@/features/platform';
import type { AcquisitionStore } from '../application/acquisition-ports';

export const postgresAcquisitionStore: AcquisitionStore<DatabaseTransaction> = {
  async configuration(tx, id) {
    const row = await tx
      .selectFrom('app.second_home_configuration')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          id: row.id,
          participationBps: row.participation_bps,
          alta: row.alta,
          media: row.media,
          luxtoryAlta: row.luxtory_alta,
          luxtoryMedia: row.luxtory_media,
        };
  },
  async institution(tx) {
    return (
      (await tx.selectFrom('app.luxtory_legal_identity').select('party_id').executeTakeFirst())
        ?.party_id ?? null
    );
  },
  async acquisition(tx, home) {
    const row = await tx
      .selectFrom('app.acquisition as a')
      .leftJoin('app.second_home_operation_start as s', 's.acquisition_id', 'a.id')
      .select([
        'a.id',
        'a.modality',
        sql<string>`a.operation_start_date::text`.as('date'),
        's.id as started',
      ])
      .where('a.second_home_id', '=', home)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          id: row.id,
          modality: row.modality,
          operationStartDate: row.date,
          operationStarted: row.started !== null,
        };
  },
  async allocation(tx, id) {
    const row = await tx
      .selectFrom('app.second_home_initial_allocation')
      .select([
        'id',
        'second_home_id',
        'configuration_id',
        'luxtory_alta',
        'luxtory_media',
        sql<string>`operation_start_date::text`.as('date'),
      ])
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const grants = await tx
      .selectFrom('app.initial_allocation_grant')
      .select(['position', 'alta', 'media'])
      .where('initial_allocation_id', '=', id)
      .orderBy('position')
      .execute();
    return {
      id: row.id,
      secondHomeId: row.second_home_id,
      configurationId: row.configuration_id,
      operationStartDate: row.date,
      luxtoryCapacity: { alta: row.luxtory_alta, media: row.luxtory_media },
      grants,
    };
  },
  async nextAllocationVersion(tx, home) {
    const row = await tx
      .selectFrom('app.second_home_initial_allocation')
      .select((eb) => eb.fn.max('version').as('version'))
      .where('second_home_id', '=', home)
      .executeTakeFirst();
    return (row?.version ?? 0) + 1;
  },
  async insertAllocation(tx, input, id, version, at, operationId) {
    await tx
      .insertInto('app.second_home_initial_allocation')
      .values({
        id,
        second_home_id: input.second_home_id,
        configuration_id: input.configuration_id,
        operation_start_date: input.operation_start_date,
        version,
        luxtory_alta: input.luxtory_capacity.alta,
        luxtory_media: input.luxtory_capacity.media,
        basis_ref: input.basis_ref,
        validated_at: at,
        operation_id: operationId,
      })
      .execute();
    await tx
      .insertInto('app.initial_allocation_grant')
      .values(
        input.grants.map((g) => ({
          initial_allocation_id: id,
          position: g.position,
          alta: g.alta,
          media: g.media,
          operation_id: operationId,
        })),
      )
      .execute();
  },
  async insertSpe(tx, r) {
    try {
      await tx
        .insertInto('app.spe')
        .values({
          id: r.id,
          second_home_id: r.secondHomeId,
          acquisition_id: r.acquisitionId,
          party_id: r.partyId,
          legal_form: 'sa_fechada',
          operation_id: r.operationId,
        })
        .execute();
    } catch (error) {
      // Cross-home races are resolved by the unique constraint; expose only a functional conflict.
      if (violatedConstraint(error) === 'spe_party_id_key')
        throw new CommandRejection('ERR_STATE_TRANSITION');
      throw error;
    }
  },
  async insertStake(tx, r) {
    await tx
      .insertInto('app.stake')
      .values({
        id: r.id,
        second_home_id: r.secondHomeId,
        acquisition_id: r.acquisitionId,
        spe_id: r.speId,
        allocation_position: r.position,
        participation_bps: r.participationBps,
        operation_id: r.operationId,
      })
      .execute();
  },
  async insertHolding(tx, r) {
    await tx
      .insertInto('app.holding')
      .values({
        id: r.id,
        second_home_id: r.secondHomeId,
        acquisition_id: r.acquisitionId,
        party_id: r.partyId,
        role: r.role,
        stake_id: r.stakeId,
        participation_bps: r.participationBps,
        valid_from: r.validFrom,
        valid_until: null,
        operation_id: r.operationId,
      })
      .execute();
  },
  async insertGrant(tx, r) {
    await tx
      .insertInto('app.use_right_ledger')
      .values({
        id: r.id,
        second_home_id: r.secondHomeId,
        acquisition_id: r.acquisitionId,
        stake_id: r.stakeId,
        exercise_year: r.exerciseYear,
        bucket: r.bucket,
        movement: 'grant',
        source: r.source,
        initial_allocation_id: r.initialAllocationId,
        quantity: r.quantity,
        operation_id: r.operationId,
        created_at: r.createdAt,
      })
      .execute();
  },
  async administration(tx, id) {
    const row = await tx
      .selectFrom('app.second_home_administration as a')
      .leftJoin('app.second_home_administration as s', 's.replaces_id', 'a.id')
      .select([
        'a.id',
        'a.second_home_id',
        sql<string>`a.valid_from::text`.as('date'),
        's.id as successor',
      ])
      .where('a.id', '=', id)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          id: row.id,
          secondHomeId: row.second_home_id,
          validFrom: row.date,
          replaced: row.successor !== null,
        };
  },
  async insertAdministration(tx, c, r) {
    await tx
      .insertInto('app.second_home_administration')
      .values({
        id: r.id,
        second_home_id: r.secondHomeId,
        provider_party_id: c.provider_party_id,
        professional: c.professional,
        scope: c.scope,
        valid_from: c.valid_from,
        valid_until: c.valid_until ?? null,
        replaces_id: c.replaces_id ?? null,
        basis_ref: r.basisRef,
        operation_id: r.operationId,
        created_at: r.at,
      })
      .execute();
  },
  async hasProfessionalCoverage(tx, home, from) {
    const result = await sql<{
      covered: boolean;
    }>`SELECT app.has_professional_administration_coverage(${home}::uuid, ${from}::date) AS covered`.execute(
      tx,
    );
    return result.rows[0]?.covered === true;
  },
};
