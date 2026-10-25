import { createAdminCommandRoute, type AdminCommandDependencies } from '@/features/identity';
import {
  withRoute,
  type CommandHandler,
  type DatabaseTransaction,
  type LogPort,
} from '@/features/platform';
import type { AcquisitionResult } from '../application/acquisition-ports';
import {
  acquisitionAdminCommand,
  createAcquisitionHandlers,
  type AcquisitionHandlerOptions,
} from './acquisition-handlers';

export interface AcquisitionRouteDependencies
  extends AdminCommandDependencies, AcquisitionHandlerOptions {
  readonly afterCommit?: (log: LogPort) => void;
}
/** Public auxiliary bodies cannot contain the path id. The trusted path joins validated input and its idempotency hash. */
function withHomePath(body: unknown, params: Readonly<Record<string, string>>): unknown {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.hasOwn(body, 'second_home_id')
  )
    return null;
  return { ...body, second_home_id: params.id };
}
export function createAcquisitionRoutes(options: AcquisitionRouteDependencies = {}) {
  const handlers = createAcquisitionHandlers(options);
  const route = <I>(
    handler: CommandHandler<I, AcquisitionResult, DatabaseTransaction>,
    auxiliary = false,
  ) =>
    createAdminCommandRoute({
      ...options,
      command: () => acquisitionAdminCommand(handler),
      successStatus: 201,
      maxBodyBytes: 32768,
      ...(auxiliary ? { input: withHomePath } : {}),
    });
  return {
    formalizeAcquisition: route(handlers.formalizeAcquisition),
    initialAllocation: route(handlers.initialAllocation, true),
    administration: route(handlers.administration, true),
    operationStart: route(handlers.operationStart, true),
  };
}
const routes = createAcquisitionRoutes();
export const formalizeAcquisition = withRoute(routes.formalizeAcquisition);
export const initialAllocation = withRoute(routes.initialAllocation);
export const administration = withRoute(routes.administration);
export const operationStart = withRoute(routes.operationStart);
