// Superfície pública de servidor do admin para parâmetros (W14, TECH-030; ADR-0030 §3; spec admin §13): o command
// `set_parameter` com as dependências de produção e as leituras de versões. Fora de `index.ts` (o shell do Admin).
import { assertTransactionalAdminAuthority } from '@/features/identity';
import type { DatabaseTransaction } from '@/features/platform';
import { createSetParameterHandler } from './application/set-parameter';
import { createPostgresParameterStore } from './infrastructure/postgres-parameter-store';

export {
  GUEST_RULES_MAX_LENGTH,
  PARAMETER_KEYS,
  successorConflict,
  versionInForce,
  type ParameterKey,
  type ParameterVersion,
  type ParameterVersionRecord,
} from './domain/parameter';
export {
  setParameterInput,
  type SetParameterInput,
  type SetParameterResult,
} from './application/set-parameter';
export { parameterHistory, parameterInForce } from './infrastructure/postgres-parameter-store';

export function createParameterHandlers() {
  return {
    setParameter: createSetParameterHandler<DatabaseTransaction>({
      store: createPostgresParameterStore(),
      assertAdmin: assertTransactionalAdminAuthority,
    }),
  };
}
