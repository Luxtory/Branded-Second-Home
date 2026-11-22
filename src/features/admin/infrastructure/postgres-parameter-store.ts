import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import type { ParameterStore } from '../application/set-parameter';
import type { ParameterKey, ParameterVersion, ParameterVersionRecord } from '../domain/parameter';

type Reader = Pick<DatabaseTransaction, 'selectFrom'>;

const toVersion = (row: {
  id: string;
  key: string;
  second_home_id: string | null;
  value: string;
  currency: string | null;
  effective_from: Date | string;
  effective_to: Date | string | null;
  effective_until: Date | string | null;
}): ParameterVersion => ({
  id: row.id,
  key: row.key as ParameterKey,
  secondHomeId: row.second_home_id,
  value: row.value,
  currency: row.currency === 'BRL' ? 'BRL' : null,
  effectiveFrom: new Date(row.effective_from),
  effectiveTo: row.effective_to === null ? null : new Date(row.effective_to),
  effectiveUntil: row.effective_until === null ? null : new Date(row.effective_until),
});

/** Escrita de versões de parâmetro por SQL direto do servidor; o gatilho do banco decide (ADR-0030 §3). */
export function createPostgresParameterStore(): ParameterStore<DatabaseTransaction> {
  return {
    async secondHomeExists(tx, secondHomeId) {
      const row = await tx
        .selectFrom('app.second_home')
        .select('id')
        .where('id', '=', secondHomeId)
        .executeTakeFirst();
      return row !== undefined;
    },
    async lockScope(tx, key, secondHomeId) {
      await lockAdvisoryKeys(tx, [
        `app.parameter:${key}:${secondHomeId?.toLowerCase() ?? 'global'}`,
      ]);
    },
    async latest(tx, key, secondHomeId) {
      const row = await tx
        .selectFrom('app.parameter_version')
        .select([
          'id',
          'key',
          'second_home_id',
          'value',
          'currency',
          'effective_from',
          'effective_to',
          'effective_until',
        ])
        .where('key', '=', key)
        .where((eb) =>
          secondHomeId === null
            ? eb('second_home_id', 'is', null)
            : eb('second_home_id', '=', secondHomeId),
        )
        .orderBy('effective_from', 'desc')
        .limit(1)
        .executeTakeFirst();
      return row === undefined ? null : toVersion(row as Parameters<typeof toVersion>[0]);
    },
    async insert(tx, draft) {
      const row = await tx
        .insertInto('app.parameter')
        .values({
          id: draft.id,
          key: draft.key,
          second_home_id: draft.secondHomeId,
          value: draft.value,
          currency: draft.currency,
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

/** Histórico completo de um escopo, para o Admin, em ordem de início (fim efetivo derivado). */
export async function parameterHistory(
  db: Reader,
  key: ParameterKey,
  secondHomeId: string | null,
): Promise<readonly ParameterVersionRecord[]> {
  const rows = await db
    .selectFrom('app.parameter_version')
    .select([
      'id',
      'key',
      'second_home_id',
      'value',
      'currency',
      'effective_from',
      'effective_to',
      'effective_until',
      'authority',
      'authorization_ref',
      'created_at',
    ])
    .where('key', '=', key)
    .where((eb) =>
      secondHomeId === null
        ? eb('second_home_id', 'is', null)
        : eb('second_home_id', '=', secondHomeId),
    )
    .orderBy('effective_from')
    .execute();
  return rows.map((row) => ({
    ...toVersion(row as Parameters<typeof toVersion>[0]),
    authority: row.authority ?? '',
    authorizationRef: row.authorization_ref ?? '',
    createdAt: new Date(row.created_at as Date | string),
  }));
}

/** Versão vigente no instante (`app.parameter_at`); `null` = parâmetro ausente (ERR_PARAMETER_MISSING). */
export async function parameterInForce(
  db: Reader,
  key: ParameterKey,
  secondHomeId: string | null,
  at: Date,
): Promise<ParameterVersion | null> {
  const row = await db
    .selectFrom(
      sql<{
        id: string;
        key: string;
        second_home_id: string | null;
        value: string;
        currency: string | null;
        effective_from: Date;
        effective_to: Date | null;
      }>`app.parameter_at(${key}, ${secondHomeId}::uuid, ${at.toISOString()}::timestamptz)`.as('p'),
    )
    .selectAll()
    .executeTakeFirst();
  return row === undefined ? null : toVersion({ ...row, effective_until: null });
}
