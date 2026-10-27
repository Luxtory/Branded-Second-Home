import { sql } from 'kysely';
import type { ExercisedAdminSession } from '@/features/admin';
import { readAcquisitionOrigin } from '@/features/catalog';
import { getDatabase, recordAdminRead, systemClock, type Database } from '@/features/platform';

interface AcquisitionAdminReadOptions {
  readonly db?: Database;
  readonly registeredOperationId?: string | null;
}

/** Minimal audited operational projection. Civil dates stay ISO strings, independent of the process timezone. */
export function readAcquisitionAdmin(
  session: ExercisedAdminSession,
  id: string,
  options: AcquisitionAdminReadOptions = {},
) {
  const db = options.db ?? getDatabase();
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      await recordAdminRead(tx, {
        actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
        objectType: 'second_home_acquisition',
        objectId: id,
        authorizationRef: session.authorizationRef,
        at: systemClock.now(),
      });
      const origin = await readAcquisitionOrigin(tx, id);
      if (origin === undefined) return null;
      // An untrusted URL flag is never proof that a critical command committed.
      const receipt =
        options.registeredOperationId == null
          ? undefined
          : await tx
              .selectFrom('app.operation')
              .select('id')
              .where('id', '=', options.registeredOperationId)
              .where('second_home_id', '=', id)
              .where('state', '=', 'committed')
              .where('command', 'in', [
                'formalize_acquisition',
                'register_second_home_initial_allocation',
                'register_second_home_administration',
                'register_second_home_operation_start',
              ])
              .executeTakeFirst();
      const acquisition = await tx
        .selectFrom('app.acquisition')
        .select([
          'id',
          'location',
          'modality',
          'configuration_id',
          'initial_allocation_id',
          'basis_ref',
          sql<string>`operation_start_date::text`.as('date'),
        ])
        .where('second_home_id', '=', id)
        .executeTakeFirst();
      const configurations = await tx
        .selectFrom('app.second_home_configuration')
        .select([
          'id',
          'participation_bps',
          'alta',
          'media',
          'annual_days',
          'luxtory_alta',
          'luxtory_media',
        ])
        .orderBy('id', 'desc')
        .execute();
      const allocations = await tx
        .selectFrom('app.second_home_initial_allocation')
        .select([
          'id',
          'version',
          'configuration_id',
          'basis_ref',
          'luxtory_alta',
          'luxtory_media',
          sql<string>`operation_start_date::text`.as('date'),
        ])
        .where('second_home_id', '=', id)
        .orderBy('version', 'desc')
        .execute();
      const grants =
        allocations.length === 0
          ? []
          : await tx
              .selectFrom('app.initial_allocation_grant')
              .select(['initial_allocation_id', 'position', 'alta', 'media'])
              .where(
                'initial_allocation_id',
                'in',
                allocations.map((a) => a.id),
              )
              .orderBy('position')
              .execute();
      const coverages = await tx
        .selectFrom('app.second_home_administration')
        .select([
          'id',
          'provider_party_id',
          'professional',
          'scope',
          'basis_ref',
          'replaces_id',
          sql<string>`valid_from::text`.as('from'),
          sql<string | null>`valid_until::text`.as('until'),
        ])
        .where('second_home_id', '=', id)
        .orderBy('valid_from')
        .execute();
      const holdings = await tx
        .selectFrom('app.holding')
        .select(['id', 'party_id', 'role', 'participation_bps', 'stake_id'])
        .where('second_home_id', '=', id)
        .execute();
      const spe = await tx
        .selectFrom('app.spe')
        .select(['id', 'party_id', 'legal_form'])
        .where('second_home_id', '=', id)
        .executeTakeFirst();
      const ledger = await tx
        .selectFrom('app.use_right_ledger as l')
        .innerJoin('app.stake as s', 's.id', 'l.stake_id')
        .select([
          'l.id',
          'l.exercise_year',
          'l.bucket',
          'l.quantity',
          'l.source',
          's.allocation_position',
        ])
        .where('l.second_home_id', '=', id)
        .orderBy('s.allocation_position')
        .orderBy('l.bucket')
        .execute();
      const started = await tx
        .selectFrom('app.second_home_operation_start')
        .select(['id', 'basis_ref', sql<string>`effective_start_date::text`.as('date')])
        .where('second_home_id', '=', id)
        .executeTakeFirst();
      return {
        registrationConfirmed: receipt !== undefined,
        origin,
        acquisition: acquisition ?? null,
        configurations,
        allocations,
        grants,
        coverages,
        holdings,
        spe: spe ?? null,
        ledger,
        started: started ?? null,
      };
    });
}
export type AcquisitionAdminView = NonNullable<Awaited<ReturnType<typeof readAcquisitionAdmin>>>;
