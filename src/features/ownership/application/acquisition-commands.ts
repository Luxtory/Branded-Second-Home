import { CommandRejection, type CommandHandler } from '@/features/platform';
import {
  allocationFits,
  validAcquirers,
  type AcquisitionConfiguration,
  type AllocationGrant,
  type SeasonalQuantity,
} from '../domain/acquisition';
import {
  formalizeAcquisitionInput,
  initialAllocationInput,
  administrationInput,
  operationStartInput,
  type FormalizeAcquisitionInput,
  type InitialAllocationInput,
  type AdministrationInput,
  type OperationStartInput,
} from './acquisition-input';
import type { AcquisitionDependencies, AcquisitionResult } from './acquisition-ports';

function found<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_NOT_FOUND');
  return value;
}
function requireState(value: boolean) {
  if (!value) throw new CommandRejection('ERR_STATE_TRANSITION');
}
function configured<T>(value: T | null): T {
  if (value === null) throw new CommandRejection('ERR_PARAMETER_MISSING');
  return value;
}
const result = (id: string, home: string, operation: string): AcquisitionResult => ({
  id,
  second_home_id: home,
  operation_id: operation,
});
function assertCapacity<Tx>(
  deps: AcquisitionDependencies<Tx>,
  config: AcquisitionConfiguration,
  grants: readonly AllocationGrant[],
  luxtory: SeasonalQuantity,
  date: string,
  timezone: string,
  now: Date,
) {
  if (
    !allocationFits(
      config,
      grants,
      luxtory,
      deps.calendar.futureCapacity({ operationStartDate: date, timezone, now }),
    )
  )
    throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
}

export function formalizeAcquisitionHandler<Tx>(
  deps: AcquisitionDependencies<Tx>,
): CommandHandler<FormalizeAcquisitionInput, AcquisitionResult, Tx> {
  return {
    command: 'formalize_acquisition',
    input: formalizeAcquisitionInput,
    assertAvailable: deps.assertAvailable,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, actor, authorizationRef, operationId, audit, emit }) {
      await deps.assertAuthority(tx, actor, authorizationRef);
      const home = await deps.catalog.lockForFormalization(tx, input.second_home_id, deps.clock);
      requireState((await deps.store.acquisition(tx, home.id)) === null);
      // The clock is refreshed after catalog/authority/aggregate locks, never the attempt's pre-lock timestamp.
      const at = home.validatedAt;
      let config: AcquisitionConfiguration | null = null;
      let grants: readonly AllocationGrant[] = [];
      let allocationId: string | null = null;
      if (input.modality === 'co_owner') {
        const institution = configured(await deps.store.institution(tx));
        config = configured(await deps.store.configuration(tx, input.configuration_id));
        if (!validAcquirers(input.acquirer_party_ids, config.id, institution))
          throw new CommandRejection('ERR_VALIDATION');
        if (found(await deps.party(tx, input.spe_party_id)).documentType !== 'cnpj')
          throw new CommandRejection('ERR_VALIDATION');
        let luxtory: SeasonalQuantity;
        if (deps.calendar.isPartialExercise(input.operation_start_date)) {
          if (input.initial_allocation_id === undefined)
            throw new CommandRejection('ERR_PARAMETER_MISSING');
          const allocation = found(await deps.store.allocation(tx, input.initial_allocation_id));
          requireState(
            allocation.secondHomeId === home.id &&
              allocation.configurationId === config.id &&
              allocation.operationStartDate === input.operation_start_date,
          );
          allocationId = allocation.id;
          grants = allocation.grants;
          luxtory = allocation.luxtoryCapacity;
        } else {
          requireState(input.initial_allocation_id === undefined);
          grants = Array.from({ length: config.id }, (_, position) => ({
            position: position + 1,
            alta: config!.alta,
            media: config!.media,
          }));
          luxtory = { alta: config.luxtoryAlta, media: config.luxtoryMedia };
        }
        assertCapacity(
          deps,
          config,
          grants,
          luxtory,
          input.operation_start_date,
          home.timezone,
          at,
        );
      }
      for (const party of input.acquirer_party_ids) found(await deps.party(tx, party));
      const id = deps.newId();
      await deps.catalog.recordFormalization(tx, {
        id,
        secondHomeId: home.id,
        modality: input.modality,
        location: input.location,
        configurationId: config?.id ?? null,
        operationStartDate: input.operation_start_date,
        initialAllocationId: allocationId,
        basisRef: input.basis_ref,
        formalizedAt: at,
        operationId,
      });
      const reference = { secondHomeId: home.id, acquisitionId: id, operationId };
      if (input.modality === 'owner') {
        await deps.store.insertHolding(tx, {
          ...reference,
          id: deps.newId(),
          partyId: input.acquirer_party_ids[0]!,
          role: 'owner',
          stakeId: null,
          participationBps: 10000,
          validFrom: at,
        });
      } else {
        const configuration = configured(config);
        const speId = deps.newId();
        await deps.store.insertSpe(tx, { ...reference, id: speId, partyId: input.spe_party_id });
        for (const [index, partyId] of input.acquirer_party_ids.entries()) {
          const position = index + 1;
          const stakeId = deps.newId();
          await deps.store.insertStake(tx, {
            ...reference,
            id: stakeId,
            speId,
            position,
            participationBps: configuration.participationBps,
          });
          await deps.store.insertHolding(tx, {
            ...reference,
            id: deps.newId(),
            partyId,
            role: 'co_owner',
            stakeId,
            participationBps: configuration.participationBps,
            validFrom: at,
          });
          const quantities = grants.find((grant) => grant.position === position)!;
          for (const bucket of ['alta', 'media'] as const)
            await deps.store.insertGrant(tx, {
              ...reference,
              id: deps.newId(),
              stakeId,
              exerciseYear: deps.calendar.exerciseYear(input.operation_start_date),
              bucket,
              quantity: quantities[bucket],
              source: allocationId === null ? 'configuration' : 'initial_allocation',
              initialAllocationId: allocationId,
              createdAt: at,
            });
        }
        emit({
          type: 'ownership.initial_draw_scheduled',
          payload: { acquisition_id: id, second_home_id: home.id },
          dedupKey: `ownership.initial_draw_scheduled:${id}`,
        });
      }
      const response = result(id, home.id, operationId);
      audit({ objectType: 'acquisition', objectId: id, before: null, after: response });
      return response;
    },
  };
}

export function initialAllocationHandler<Tx>(
  deps: AcquisitionDependencies<Tx>,
): CommandHandler<InitialAllocationInput, AcquisitionResult, Tx> {
  return {
    command: 'register_second_home_initial_allocation',
    input: initialAllocationInput,
    assertAvailable: deps.assertAvailable,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, actor, authorizationRef, operationId, audit }) {
      await deps.assertAuthority(tx, actor, authorizationRef);
      const home = await deps.catalog.lockRoot(tx, input.second_home_id);
      requireState((await deps.store.acquisition(tx, home.id)) === null);
      const config = configured(await deps.store.configuration(tx, input.configuration_id));
      const at = deps.clock.now();
      assertCapacity(
        deps,
        config,
        input.grants,
        input.luxtory_capacity,
        input.operation_start_date,
        home.timezone,
        at,
      );
      const version = await deps.store.nextAllocationVersion(tx, home.id);
      const id = deps.newId();
      await deps.store.insertAllocation(tx, input, id, version, at, operationId);
      const response = result(id, home.id, operationId);
      audit({
        objectType: 'second_home_initial_allocation',
        objectId: id,
        before: null,
        after: { ...response, version },
      });
      return response;
    },
  };
}

export function administrationHandler<Tx>(
  deps: AcquisitionDependencies<Tx>,
): CommandHandler<AdministrationInput, AcquisitionResult, Tx> {
  return {
    command: 'register_second_home_administration',
    input: administrationInput,
    assertAvailable: deps.assertAvailable,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, actor, authorizationRef, operationId, audit }) {
      await deps.assertAuthority(tx, actor, authorizationRef);
      const home = await deps.catalog.lockRoot(tx, input.second_home_id);
      const acquisition = await deps.store.acquisition(tx, home.id);
      const at = deps.clock.now();
      let firstId: string | null = null;
      for (const coverage of input.coverages) {
        found(await deps.party(tx, coverage.provider_party_id));
        if (coverage.scope === 'full_luxtory_administration') {
          const institution = configured(await deps.store.institution(tx));
          if (coverage.provider_party_id !== institution)
            throw new CommandRejection('ERR_VALIDATION');
        }
        if (coverage.replaces_id !== undefined) {
          const previous = found(await deps.store.administration(tx, coverage.replaces_id));
          requireState(
            previous.secondHomeId === home.id &&
              !previous.replaced &&
              previous.validFrom <= coverage.valid_from,
          );
        }
        const id = deps.newId();
        firstId ??= id;
        await deps.store.insertAdministration(tx, coverage, {
          id,
          secondHomeId: home.id,
          basisRef: input.basis_ref,
          operationId,
          at,
        });
        audit({
          objectType: 'second_home_administration',
          objectId: id,
          before: null,
          after: { ...result(id, home.id, operationId), replaces_id: coverage.replaces_id ?? null },
        });
      }
      if (acquisition?.modality === 'co_owner' && acquisition.operationStarted)
        requireState(
          await deps.store.hasProfessionalCoverage(tx, home.id, acquisition.operationStartDate),
        );
      return result(firstId!, home.id, operationId);
    },
  };
}

export function operationStartHandler<Tx>(
  deps: AcquisitionDependencies<Tx>,
): CommandHandler<OperationStartInput, AcquisitionResult, Tx> {
  return {
    command: 'register_second_home_operation_start',
    input: operationStartInput,
    assertAvailable: deps.assertAvailable,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, actor, authorizationRef, operationId, audit }) {
      await deps.assertAuthority(tx, actor, authorizationRef);
      const home = await deps.catalog.lockRoot(tx, input.second_home_id);
      const acquisition = await deps.store.acquisition(tx, home.id);
      requireState(acquisition !== null);
      const fact = found(acquisition);
      const at = deps.clock.now();
      requireState(
        !fact.operationStarted &&
          input.effective_start_date === fact.operationStartDate &&
          input.effective_start_date <= deps.calendar.localDate(at, home.timezone),
      );
      if (fact.modality === 'co_owner')
        requireState(
          await deps.store.hasProfessionalCoverage(tx, home.id, fact.operationStartDate),
        );
      const id = deps.newId();
      await deps.catalog.recordOperationStart(tx, {
        id,
        secondHomeId: home.id,
        acquisitionId: fact.id,
        effectiveStartDate: input.effective_start_date,
        registeredAt: at,
        basisRef: input.basis_ref,
        operationId,
      });
      const response = result(id, home.id, operationId);
      audit({
        objectType: 'second_home_operation_start',
        objectId: id,
        before: null,
        after: response,
      });
      return response;
    },
  };
}
