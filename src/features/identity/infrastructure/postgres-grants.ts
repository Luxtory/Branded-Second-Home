import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';
import type { GrantDirectory, GrantWriter } from '../application/ports';
import { partyExists } from './postgres-parties';

/** Grants vigentes da party que listam o command (`app.authorization_grant`, REQ-014). */
export function createPostgresGrantDirectory(database: () => Database): GrantDirectory {
  return {
    async activeGrants(partyId, command, at) {
      const rows = await database()
        .selectFrom('app.authorization_grant')
        .select(['id', 'grantee_party_id', 'commands', 'scope_type', 'scope_id', 'valid_from'])
        .select(['valid_until', 'revoked_at'])
        .where('grantee_party_id', '=', partyId)
        .where('revoked_at', 'is', null)
        .where('valid_from', '<=', at)
        .where('valid_until', '>', at)
        .where(sql<boolean>`commands @> ARRAY[${command}]::text[]`)
        .execute();
      return rows.map((row) => ({
        id: row.id,
        granteePartyId: row.grantee_party_id,
        commands: row.commands,
        scope: { type: row.scope_type, id: row.scope_id },
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        revokedAt: row.revoked_at,
      }));
    },
  };
}

/** Insere o grant na transação do command, como `luxtory_app` (FK validada para `party` desde a W7). */
export const postgresGrantWriter: GrantWriter<DatabaseTransaction> = {
  partyExists,
  async insert(tx, grant) {
    await tx
      .insertInto('app.authorization_grant')
      .values({
        id: grant.id,
        grantee_party_id: grant.granteePartyId,
        commands: [...grant.commands],
        scope_type: grant.scope.type,
        scope_id: grant.scope.id,
        valid_from: grant.validFrom,
        valid_until: grant.validUntil,
        basis: grant.basis,
        granted_by_user_id: grant.grantedByUserId,
        granted_role: grant.grantedRole,
        operation_id: grant.operationId,
        created_at: grant.createdAt,
      })
      .execute();
  },
};
