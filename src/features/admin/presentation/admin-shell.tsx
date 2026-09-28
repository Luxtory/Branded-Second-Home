import type { ReactNode } from 'react';
import { AppShell, type AppNavItem } from '@/design-system/react';
import { SignOutButton, type StaffRole } from '@/features/identity';
import { messages } from './i18n/pt-br';

/**
 * Seções do Admin com tela. Cada wave acrescenta a sua quando a tela existir — nunca link para tela futura. `role`: o
 * papel exercido que a seção exige (sem hierarquia, ADR-0008); sem ele o item não aparece.
 */
const SECTIONS: readonly {
  readonly id: 'home' | 'catalog';
  readonly href: string;
  readonly label: string;
  readonly role?: StaffRole;
}[] = [
  { id: 'home', href: '/admin', label: messages.nav.home },
  { id: 'catalog', href: '/admin/catalogo', label: messages.nav.catalog, role: 'admin' },
];

export type AdminSection = (typeof SECTIONS)[number]['id'];

/** Seções que os papéis ativos alcançam (a página revalida o acesso no servidor). */
export function availableSections(roles: readonly StaffRole[]) {
  return SECTIONS.filter((section) => section.role === undefined || roles.includes(section.role));
}

// Navegação em `night` com o logo Warm Sand (decisão visual do checkpoint 1 da W2B, ADR-0009).
const NAV_GROUND = 'night';

export function roleNames(roles: readonly StaffRole[]): string {
  return roles.map((role) => messages.roles[role]).join(' · ');
}

function Account({ roles }: { readonly roles: readonly StaffRole[] }) {
  return (
    <>
      <div>
        <p className="lx-label">{messages.shell.rolesLabel}</p>
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
  const navItems: AppNavItem[] = availableSections(roles).map((section) => ({
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
