import type { ReactNode } from 'react';
import { AppShell, type AppNavItem } from '@/design-system/react';
import { SignOutButton, type StaffRole } from '@/features/identity';
import { messages } from './i18n/pt-br';

/**
 * Seções do Admin com tela. Cada wave acrescenta a sua quando a tela existir — nunca link para tela futura. `roles`: os
 * papéis exercidos que a seção aceita (sem hierarquia, ADR-0008); sem nenhum deles o item não aparece.
 */
const SECTIONS: readonly {
  readonly id:
    | 'home'
    | 'catalog'
    | 'interests'
    | 'parties'
    | 'bookings'
    | 'prl'
    | 'parameters'
    | 'policies'
    | 'finance';
  readonly href: string;
  readonly label: string;
  readonly roles?: readonly StaffRole[];
}[] = [
  { id: 'home', href: '/admin', label: messages.nav.home },
  { id: 'catalog', href: '/admin/catalogo', label: messages.nav.catalog, roles: ['admin'] },
  { id: 'interests', href: '/admin/interesses', label: messages.nav.interests, roles: ['admin'] },
  {
    id: 'parties',
    href: '/admin/pessoas-e-empresas',
    label: messages.nav.parties,
    roles: ['admin'],
  },
  // W13 E4b: reservas de uso próprio (spec booking §10.15).
  { id: 'bookings', href: '/admin/reservas', label: messages.nav.bookings, roles: ['admin'] },
  // W16: PRL — publicação inicial por Admin ou Super Admin, alteração só pelo Super Admin (spec pricing §5).
  { id: 'prl', href: '/admin/prl', label: messages.nav.prl, roles: ['admin', 'super_admin'] },
  // W16: parâmetros econômicos globais, `set_parameter` do Admin (spec admin §14).
  { id: 'parameters', href: '/admin/parametros', label: messages.nav.parameters, roles: ['admin'] },
  // W18: políticas comerciais, `publish_policy` do Admin (spec pricing §5 "Políticas comerciais").
  { id: 'policies', href: '/admin/politicas', label: messages.nav.policies, roles: ['admin'] },
  // W19: apuração por categoria e conciliação de pagamentos, só leitura (spec billing §4.4).
  { id: 'finance', href: '/admin/financeiro', label: messages.nav.finance, roles: ['admin'] },
];

export type AdminSection = (typeof SECTIONS)[number]['id'];

/** Seções que os papéis ativos alcançam (a página revalida o acesso no servidor). */
export function availableSections(roles: readonly StaffRole[]) {
  return SECTIONS.filter(
    (section) => section.roles === undefined || section.roles.some((role) => roles.includes(role)),
  );
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
