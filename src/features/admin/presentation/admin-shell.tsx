import type { ReactNode } from 'react';
import { AppShell, type AppNavItem } from '@/design-system/react';
import { SignOutButton, type StaffRole } from '@/features/identity';
import { messages } from './i18n/pt-br';

/** Seções do Admin com tela. Cada wave acrescenta a sua quando a tela existir — nunca link para tela futura. */
const SECTIONS = [{ id: 'home', href: '/admin', label: messages.nav.home }] as const;

export type AdminSection = (typeof SECTIONS)[number]['id'];

// Direção visual em avaliação no checkpoint 1 da W2B (ADR-0009): navegação em `night` com o logo Warm Sand.
const NAV_GROUND = 'night';

export function roleNames(roles: readonly StaffRole[]): string {
  return roles.map((role) => messages.roles[role]).join(' · ');
}

function Account({ roles }: { readonly roles: readonly StaffRole[] }) {
  return (
    <>
      <div>
        <p className="lx-marker">
          <span>{messages.shell.rolesLabel}</span>
        </p>
        <p className="lx-body">{roleNames(roles)}</p>
      </div>
      <SignOutButton />
    </>
  );
}

/** Admin no App Shell do DS: os itens e a conta são montados aqui; o shell não conhece papéis nem regras. */
export function AdminShell({
  roles,
  current,
  children,
}: {
  readonly roles: readonly StaffRole[];
  readonly current: AdminSection;
  readonly children: ReactNode;
}) {
  const navItems: AppNavItem[] = SECTIONS.map((section) => ({
    href: section.href,
    label: section.label,
    current: section.id === current,
  }));
  return (
    <AppShell
      navGround={NAV_GROUND}
      homeHref="/admin"
      labels={messages.shell}
      navItems={navItems}
      account={<Account roles={roles} />}
    >
      {children}
    </AppShell>
  );
}
