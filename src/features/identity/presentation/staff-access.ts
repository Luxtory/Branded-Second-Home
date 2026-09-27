import { getDatabase, systemClock } from '@/features/platform';
import { resolveStaffAccess, type StaffAccess } from '../application/staff-access';
import { createPostgresStaffDirectory } from '../infrastructure/postgres-staff-directory';
import { withAuth } from './server-auth';

export type AdminAccess = StaffAccess | { readonly kind: 'unavailable' };

/**
 * Acesso do request atual à superfície Admin, resolvido no servidor a cada request (papéis relidos do banco). Auth
 * ou banco indisponível no ambiente (Preview, ADR-0007) → `unavailable`.
 */
export async function getStaffAccess(): Promise<AdminAccess> {
  const access = await withAuth(false, async (gateway) =>
    resolveStaffAccess(
      await gateway.session(),
      createPostgresStaffDirectory(() => getDatabase()),
      systemClock,
    ),
  );
  return access === 'unavailable' ? { kind: 'unavailable' } : access;
}
