import { randomUUID } from 'node:crypto';
import { createCivilCalendar } from '@/features/calendar';
import { postgresAcquisitionCatalog } from '@/features/catalog';
import {
  assertTransactionalAdminAuthority,
  readPartyReference,
  type AdminCommand,
} from '@/features/identity';
import {
  systemClock,
  type Clock,
  type DatabaseTransaction,
  type EnvSource,
} from '@/features/platform';
import {
  formalizeAcquisitionHandler,
  initialAllocationHandler,
  administrationHandler,
  operationStartHandler,
} from '../application/acquisition-commands';
import { postgresAcquisitionStore } from '../infrastructure/postgres-acquisition-store';
import type { AcquisitionResult } from '../application/acquisition-ports';
import { assertAcquisitionWritesAvailable } from './acquisition-gate';
export interface AcquisitionHandlerOptions {
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly newId?: () => string;
}
export function createAcquisitionHandlers({
  source,
  clock = systemClock,
  newId = randomUUID,
}: AcquisitionHandlerOptions = {}) {
  const deps = {
    store: postgresAcquisitionStore,
    catalog: postgresAcquisitionCatalog,
    calendar: createCivilCalendar(),
    clock,
    newId,
    assertAvailable: () => assertAcquisitionWritesAvailable(source),
    assertAuthority: assertTransactionalAdminAuthority,
    party: readPartyReference,
  };
  return {
    formalizeAcquisition: formalizeAcquisitionHandler<DatabaseTransaction>(deps),
    initialAllocation: initialAllocationHandler<DatabaseTransaction>(deps),
    administration: administrationHandler<DatabaseTransaction>(deps),
    operationStart: operationStartHandler<DatabaseTransaction>(deps),
  };
}
/** The same gated handler is used by HTTP and the subsequent Admin Server Actions. */
export function acquisitionAdminCommand<I>(
  handler: AdminCommand<I, AcquisitionResult>['handler'],
): AdminCommand<I, AcquisitionResult> {
  return { role: 'admin', handler };
}
