import type { Database } from '@/features/platform';
import type { StaffDirectory } from '../application/ports';
import { isStaffRole, type StaffRoleRecord } from '../domain/staff';

/** `app.staff_role` lido como `luxtory_app` (ADR-0008): papéis ativos concedidos até o instante `at`. */
export function createPostgresStaffDirectory(database: () => Database): StaffDirectory {
  return {
    async activeRoles(userId, at) {
      const rows = await database()
        .selectFrom('app.staff_role')
        .select(['id', 'role'])
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .where('granted_at', '<=', at)
        .orderBy('role')
        .execute();
      return rows.flatMap((row): StaffRoleRecord[] =>
        isStaffRole(row.role) ? [{ id: row.id, role: row.role }] : [],
      );
    },
  };
}
