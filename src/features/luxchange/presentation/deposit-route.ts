import { createTitularCommandRoute, type TitularCommandRouteOptions } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import { withRoute } from '@/features/platform';
import type { DepositCapacityInput, DepositCapacityResult } from '../application/deposit-capacity';
import { createDepositHandler } from './deposit-handler';

const HTTP_CREATED = 201;
/** Corpo efetivo até 64 KiB: 366 noites cabem com folga (STRIDE T-2008). */
const MAX_BODY_BYTES = 65_536;

type Injected = Pick<
  TitularCommandRouteOptions<DepositCapacityInput, DepositCapacityResult>,
  'source' | 'clock' | 'database' | 'afterCommit'
>;

/**
 * `POST /v1/luxchange/deposits` (W20; OpenAPI `depositCapacity`, tag `luxchange`): adaptador mínimo sobre o mesmo
 * handler da Server Action da tela — sessão do Titular, mesma origem, `Idempotency-Key`, `party_id` representada.
 */
export function createDepositRoute(dependencies: Injected = {}) {
  return createTitularCommandRoute({
    ...dependencies,
    handler: createDepositHandler,
    holdings: (database) => createHoldingDirectory(database),
    successStatus: HTTP_CREATED,
    maxBodyBytes: MAX_BODY_BYTES,
  });
}

export const depositCapacity = withRoute(createDepositRoute());
