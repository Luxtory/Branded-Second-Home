// Superfície pública de servidor do pricing para as políticas comerciais (W18; TECH-032, PD-009, REQ-104; ADR-0034;
// spec pricing §5 "Políticas comerciais"): o command `publish_policy` com as dependências de produção e as leituras do
// Admin. Fora de `index.ts` (o shell do Admin).
import { assertTransactionalAdminAuthority } from '@/features/identity';
import type { DatabaseTransaction } from '@/features/platform';
import { createPublishPolicyHandler } from './application/publish-policy';
import { createPostgresPolicyStore } from './infrastructure/postgres-policy-store';

export {
  publishPolicyInput,
  type PublishPolicyInput,
  type PublishPolicyResult,
} from './application/publish-policy';
export { policyInForce, scheduledPolicies, type PolicyVersion } from './domain/policy-vigency';
export { policyHistory, type PolicyVersionRecord } from './infrastructure/postgres-policy-store';

export function createPolicyHandlers() {
  return {
    publishPolicy: createPublishPolicyHandler<DatabaseTransaction>({
      store: createPostgresPolicyStore(),
      assertAdmin: assertTransactionalAdminAuthority,
    }),
  };
}
