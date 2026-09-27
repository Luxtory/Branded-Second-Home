import type { Clock } from '@/features/platform';
import type { VerifiedSession } from '../domain/session';
import type { StaffRole } from '../domain/staff';
import type { StaffDirectory } from './ports';

/** Acesso à superfície Admin (`02` §2): exige sessão AAL2 (TECH-050) e ao menos um papel de staff ativo. */
export type StaffAccess =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'mfa_required' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'granted'; readonly userId: string; readonly roles: readonly StaffRole[] };

export async function resolveStaffAccess(
  session: VerifiedSession | null,
  staff: StaffDirectory,
  clock: Clock,
): Promise<StaffAccess> {
  if (session === null) return { kind: 'anonymous' };
  // O segundo fator vem antes de revelar se a conta tem papel de staff.
  if (session.assurance !== 'aal2') return { kind: 'mfa_required' };
  const active = await staff.activeRoles(session.userId, clock.now());
  if (active.length === 0) return { kind: 'forbidden' };
  const roles = [...new Set(active.map((record) => record.role))].sort();
  return { kind: 'granted', userId: session.userId, roles };
}
