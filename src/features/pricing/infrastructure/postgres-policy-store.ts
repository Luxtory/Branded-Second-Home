import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import type { PolicyStore } from '../application/publish-policy';
import type { PolicyConfig, PolicyMechanism } from '../domain/commercial-policy';
import type { PolicyVersion } from '../domain/policy-vigency';

type Reader = Pick<DatabaseTransaction, 'selectFrom'>;

export interface PolicyVersionRecord extends PolicyVersion {
  readonly authority: string;
  readonly authorizationRef: string;
  readonly createdAt: Date;
}

const COLUMNS = [
  'id',
  'mechanism',
  'config',
  'effective_from',
  'effective_to',
  'authority',
  'authorization_ref',
  'created_at',
] as const;

const toRecord = (row: {
  id: string;
  mechanism: string;
  config: unknown;
  effective_from: Date | string;
  effective_to: Date | string | null;
  authority: string;
  authorization_ref: string;
  created_at: Date | string;
}): PolicyVersionRecord => ({
  id: row.id,
  mechanism: row.mechanism as PolicyMechanism,
  config: row.config as PolicyConfig,
  effectiveFrom: new Date(row.effective_from),
  effectiveTo: row.effective_to === null ? null : new Date(row.effective_to),
  authority: row.authority,
  authorizationRef: row.authorization_ref,
  createdAt: new Date(row.created_at),
});

export const policyLockKey = (mechanism: PolicyMechanism) => `app.commercial_policy:${mechanism}`;

/** Escrita de versões de política por SQL direto do servidor; o CHECK e o gatilho do banco decidem (ADR-0034 §3). */
export function createPostgresPolicyStore(): PolicyStore<DatabaseTransaction> {
  return {
    async lockMechanism(tx, mechanism) {
      await lockAdvisoryKeys(tx, [policyLockKey(mechanism)]);
    },
    async latest(tx, mechanism) {
      const row = await tx
        .selectFrom('app.commercial_policy')
        .select(COLUMNS)
        .where('mechanism', '=', mechanism)
        .orderBy('effective_from', 'desc')
        .limit(1)
        .executeTakeFirst();
      return row === undefined ? null : toRecord(row);
    },
    async insert(tx, draft) {
      const row = await tx
        .insertInto('app.commercial_policy')
        .values({
          id: draft.id,
          mechanism: draft.mechanism,
          schema_version: 1,
          config: JSON.stringify(draft.config),
          // Sem início informado, o gatilho carimba o instante da gravação (NOT NULL é conferido depois dele).
          effective_from: draft.effectiveFrom ?? sql<Date>`NULL`,
          effective_to: draft.effectiveTo,
          authority: draft.authority,
          authorization_ref: draft.authorizationRef,
          created_at: sql<Date>`now()`,
          created_by: draft.createdBy,
          operation_id: draft.operationId,
        })
        .returning('effective_from')
        .executeTakeFirstOrThrow();
      return new Date(row.effective_from);
    },
  };
}

/** Histórico completo de um mecanismo, para o Admin, em ordem de início. */
export async function policyHistory(
  db: Reader,
  mechanism: PolicyMechanism,
): Promise<readonly PolicyVersionRecord[]> {
  const rows = await db
    .selectFrom('app.commercial_policy')
    .select(COLUMNS)
    .where('mechanism', '=', mechanism)
    .orderBy('effective_from')
    .execute();
  return rows.map(toRecord);
}
