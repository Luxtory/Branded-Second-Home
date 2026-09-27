import type { ReactNode } from 'react';
import { AppShellMenu } from './app-shell-menu';
import { Logo } from './logo';

export interface AppNavItem {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

/** Textos do shell: vêm do i18n do slice que compõe (o DS não tem strings de produto). */
export interface AppShellLabels {
  readonly skipLink: string;
  readonly home: string;
  readonly nav: string;
  readonly menu: string;
  readonly openMenu: string;
  readonly closeMenu: string;
}

const MAIN_ID = 'conteudo';

function NavList({
  items,
  listClass,
  linkClass,
}: {
  readonly items: readonly AppNavItem[];
  readonly listClass: string;
  readonly linkClass: string;
}) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.href}>
          <a className={linkClass} href={item.href} aria-current={item.current ? 'page' : undefined}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Shell das superfícies de produto logadas (ADR-0009). Recebe itens de navegação e o bloco de conta por composição:
 * não conhece módulos, papéis nem regras. Abaixo do `lg`, barra superior + gaveta; a partir do `lg`, a mesma
 * `<header>` vira a navegação lateral.
 */
export function AppShell({
  navGround = 'night',
  homeHref,
  labels,
  navItems,
  account,
  children,
}: {
  readonly navGround?: 'night' | 'paper';
  readonly homeHref: string;
  readonly labels: AppShellLabels;
  readonly navItems: readonly AppNavItem[];
  readonly account: ReactNode;
  readonly children: ReactNode;
}) {
  const logo = <Logo ground={navGround} href={homeHref} label={labels.home} />;
  return (
    <div className="lx-app" data-expression="product">
      <a className="lx-skip-link" href={`#${MAIN_ID}`}>
        {labels.skipLink}
      </a>
      <header className="lx-app__bar" data-ground={navGround}>
        {logo}
        <AppShellMenu
          ground={navGround}
          mainId={MAIN_ID}
          labels={{
            open: labels.openMenu,
            close: labels.closeMenu,
            menu: labels.menu,
            nav: labels.nav,
          }}
          logo={logo}
          nav={
            <NavList
              items={navItems}
              listClass="lx-mobile-nav__list"
              linkClass="lx-mobile-nav__link"
            />
          }
          account={account}
        />
        <nav className="lx-app__nav" aria-label={labels.nav}>
          <NavList items={navItems} listClass="lx-app__nav-list" linkClass="lx-app__nav-link" />
        </nav>
        <div className="lx-app__account">{account}</div>
      </header>
      <main className="lx-app__main" id={MAIN_ID} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
