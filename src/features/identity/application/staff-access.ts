import type { Clock } from '@/features/platform';
import type { VerifiedSession } from '../domain/session';
import type { StaffRole, StaffRoleRecord } from '../domain/staff';
import type { StaffDirectory } from './ports';

/** Acesso à superfície Admin (`02` §2): exige sessão AAL2 (TECH-050) e ao menos um papel de staff ativo. */
export type StaffAccess =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'mfa_required' }
  | { readonly kind: 'forbidden' }
  | {
      readonly kind: 'granted';
      readonly userId: string;
      readonly roles: readonly StaffRole[];
      /** Registros ativos de `staff_role`: a base (`authorization_ref`) do papel exercido numa leitura. */
      readonly records: readonly StaffRoleRecord[];
    };

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
  const records = roles.flatMap((role) => active.find((record) => record.role === role) ?? []);
  return { kind: 'granted', userId: session.userId, roles, records };
}

/** Papel exercido explicitamente numa tela (ADR-0008, sem hierarquia): o registro ativo desse papel, se houver. */
export function exercisedRole(
  access: Extract<StaffAccess, { kind: 'granted' }>,
  role: StaffRole,
): { readonly role: StaffRole; readonly authorizationRef: string } | null {
  const record = access.records.find((candidate) => candidate.role === role);
  return record === undefined ? null : { role, authorizationRef: `staff_role:${record.id}` };
}
