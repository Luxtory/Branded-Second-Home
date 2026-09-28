import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { FocusedLayout } from '@/design-system/react';
import {
  AuthUnavailable,
  exercisedRole,
  getStaffAccess,
  SignOutButton,
  type StaffRole,
} from '@/features/identity';
import { messages } from './i18n/pt-br';

export interface AdminSession {
  readonly userId: string;
  readonly roles: readonly StaffRole[];
}

/** Sessão com o papel exercido explícito (ADR-0008): a base registrada de cada leitura auditada (TECH-092). */
export interface ExercisedAdminSession extends AdminSession {
  readonly role: StaffRole;
  readonly authorizationRef: string;
}

export function AdminForbidden() {
  const text = messages.forbidden;
  return (
    <FocusedLayout brand={messages.brand}>
      <p className="lx-label">{text.marker}</p>
      <h1 className="lx-display-s">{text.title}</h1>
      <p className="lx-body">{text.body}</p>
      <SignOutButton />
    </FocusedLayout>
  );
}

type Gate<S> =
  | { readonly kind: 'granted'; readonly session: S }
  | { readonly kind: 'blocked'; readonly page: ReactElement };

/**
 * Acesso a uma página do Admin, resolvido no servidor a cada request (TECH-050): sem sessão → `/entrar`; AAL1 →
 * `/entrar/mfa`; sem papel de staff → 403; Auth ou banco indisponível → "indisponível".
 */
export async function adminGate(): Promise<Gate<AdminSession>> {
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable') return { kind: 'blocked', page: <AuthUnavailable /> };
  if (access.kind === 'forbidden') return { kind: 'blocked', page: <AdminForbidden /> };
  return { kind: 'granted', session: { userId: access.userId, roles: access.roles } };
}

/** Página que exige um papel exercido explícito (sem hierarquia entre Admin e Super Admin): sem ele → 403. */
export async function adminRoleGate(role: StaffRole): Promise<Gate<ExercisedAdminSession>> {
  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable') return { kind: 'blocked', page: <AuthUnavailable /> };
  const exercised = access.kind === 'granted' ? exercisedRole(access, role) : null;
  if (access.kind !== 'granted' || exercised === null) {
    return { kind: 'blocked', page: <AdminForbidden /> };
  }
  return { kind: 'granted', session: { userId: access.userId, roles: access.roles, ...exercised } };
}
