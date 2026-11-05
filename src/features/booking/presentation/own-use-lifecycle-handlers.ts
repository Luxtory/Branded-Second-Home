import {
  createCorrectUseRightHandler,
  createPostgresOwnUseReversal,
} from '@/features/calendar/booking';
import { assertTransactionalAdminAuthority } from '@/features/identity';
import {
  createForfeitedCapacityRecovery,
  createOwnUseLifecycleInventory,
  createRecoverFutureCapacityHandler,
} from '@/features/inventory';
import type { DatabaseTransaction } from '@/features/platform';
import { createCancelOwnUseBookingHandler } from '../application/cancel-own-use-booking';
import { createDeclareNoShowHandler } from '../application/declare-no-show';
import {
  createOpenExceptionHandler,
  createResolveExceptionHandler,
} from '../application/own-use-exceptions';
import { createCoOwnerInvalidation } from '../application/own-use-invalidation';
import type { LifecycleDependencies } from '../application/own-use-lifecycle-ports';
import { createRecoveryPreparation } from '../application/own-use-recovery';
import { createRequestBookingAuthorizationHandler } from '../application/request-booking-authorization';
import { createPostgresBookingLifecycleStore } from '../infrastructure/postgres-booking-lifecycle-store';

/**
 * Os seis commands do ciclo da reserva e a solicitação de autorização (W13 E2), com as dependências de produção. O
 * booking monta também `correct_use_right` (definido no calendar) e `recover_future_capacity` (definido no inventory)
 * com as portas da reserva — a direção de dependência booking → calendar/inventory já existente (spec booking §10.12,
 * D3). As Server Actions que os expõem são da E4.
 */
export function createOwnUseLifecycleHandlers(
  overrides: Partial<LifecycleDependencies<DatabaseTransaction>> = {},
) {
  const reversal = createPostgresOwnUseReversal();
  const deps: LifecycleDependencies<DatabaseTransaction> = {
    store: createPostgresBookingLifecycleStore(),
    inventory: createOwnUseLifecycleInventory(),
    reversal,
    assertAdmin: assertTransactionalAdminAuthority,
    ...overrides,
  };
  return {
    cancelOwnUseBooking: createCancelOwnUseBookingHandler(deps),
    declareNoShow: createDeclareNoShowHandler(deps),
    openException: createOpenExceptionHandler(deps),
    resolveException: createResolveExceptionHandler(deps),
    correctUseRight: createCorrectUseRightHandler({
      invalidation: createCoOwnerInvalidation(deps),
      reversal: deps.reversal,
    }),
    recoverFutureCapacity: createRecoverFutureCapacityHandler({
      booking: createRecoveryPreparation(deps),
      custody: createForfeitedCapacityRecovery(),
    }),
    requestBookingAuthorization: createRequestBookingAuthorizationHandler(deps),
  };
}

export type OwnUseLifecycleHandlers = ReturnType<typeof createOwnUseLifecycleHandlers>;
