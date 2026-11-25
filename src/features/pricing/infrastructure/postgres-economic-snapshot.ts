import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { EconomicParameterKey, EconomicTerms } from '../application/economic-terms';

/**
 * Persistência do snapshot (TECH-031; ADR-0033 §4, ADR-0036 §4): um por operação, na transação do efeito econômico, com
 * o instante de resolução dos termos, a FK de cada versão de parâmetro usada e a FK da versão do PRL de cada noite. O
 * banco confere que o instante pertence à transação e que cada versão é a vigente nele (parâmetro global; PRL da noite).
 */
export async function recordEconomicSnapshot(
  tx: DatabaseTransaction,
  operationId: string,
  terms: EconomicTerms,
): Promise<void> {
  await sql`INSERT INTO app.economic_snapshot (operation_id, resolved_at)
            VALUES (${operationId}::uuid, ${terms.resolvedAt}::timestamptz)`.execute(tx);
  const entries = Object.entries(terms.parameters) as [
    EconomicParameterKey,
    { parameterId: string },
  ][];
  for (const [key, parameter] of entries)
    await sql`INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
              VALUES (${operationId}::uuid, ${key}, ${parameter.parameterId}::uuid)`.execute(tx);
  for (const night of terms.nights)
    await sql`INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
              VALUES (${operationId}::uuid, ${terms.secondHomeId}::uuid, ${night.stayDate}::date,
                      ${night.prlId}::uuid)`.execute(tx);
}

/**
 * Vínculo persistente da política aceita com a operação (W21; obrigação da W18, ADR-0037 §1): a versão resolvida nos
 * termos, gravada no snapshot da mesma operação. O banco confere que é a vigente no instante da resolução e que só o
 * envio de Request a grava. Termos sem política → erro de programação do consumidor.
 */
export async function recordAcceptedPolicy(
  tx: DatabaseTransaction,
  operationId: string,
  terms: EconomicTerms,
): Promise<void> {
  if (terms.policy === null) throw new MissingAcceptedPolicyError();
  await sql`INSERT INTO app.economic_snapshot_policy (operation_id, policy_id)
            VALUES (${operationId}::uuid, ${terms.policy.policyId}::uuid)`.execute(tx);
}

export class MissingAcceptedPolicyError extends Error {
  constructor() {
    super(
      'The accepted policy is recorded only from terms resolved with a policy (W21, ADR-0037 §1)',
    );
    this.name = 'MissingAcceptedPolicyError';
  }
}

/** Gravador do snapshot como porta dos módulos consumidores. */
export const postgresEconomicSnapshotRecorder = {
  record: recordEconomicSnapshot,
} as const;
