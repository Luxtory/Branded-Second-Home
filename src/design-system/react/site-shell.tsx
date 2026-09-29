import type { ReactNode } from 'react';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';

export interface SiteNavItem {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

/** Textos da casca pública: vêm do i18n do slice que compõe (o DS não tem strings de produto). */
export interface SiteShellLabels {
  readonly skipLink: string;
  readonly home: string;
  readonly nav: string;
  readonly footerNav: string;
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
  readonly items: readonly SiteNavItem[];
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
 * Casca do site público (`lx-header`, `lx-mobile-nav`, `lx-footer`): skip link, cabeçalho fixo em `paper` com
 * navegação a partir do `lg` e gaveta `night` abaixo dele, conteúdo e rodapé `night` — que também é a navegação sem
 * JavaScript. Recebe os itens por composição; sem CTA no cabeçalho enquanto o slice não passar um.
 */
export function SiteShell({
  homeHref,
  labels,
  navItems,
  children,
}: {
  readonly homeHref: string;
  readonly labels: SiteShellLabels;
  readonly navItems: readonly SiteNavItem[];
  readonly children: ReactNode;
}) {
  return (
    <>
      <a className="lx-skip-link" href={`#${MAIN_ID}`}>
        {labels.skipLink}
      </a>
      <header className="lx-header" data-ground="paper">
        <div className="lx-container lx-header__inner">
          <Logo ground="paper" href={homeHref} label={labels.home} />
          <nav className="lx-header__nav" aria-label={labels.nav}>
            <NavList items={navItems} listClass="lx-header__list" linkClass="lx-header__link" />
          </nav>
          <div className="lx-header__actions">
            <MobileNav
              ground="night"
              mainId={MAIN_ID}
              labels={{
                open: labels.openMenu,
                close: labels.closeMenu,
                menu: labels.menu,
                nav: labels.nav,
              }}
              buttonClassName="lx-header__menu-button"
              logo={<Logo ground="night" href={homeHref} label={labels.home} />}
              nav={
                <NavList
                  items={navItems}
                  listClass="lx-mobile-nav__list"
                  linkClass="lx-mobile-nav__link"
                />
              }
            />
          </div>
        </div>
      </header>
      <main id={MAIN_ID} tabIndex={-1}>
        {children}
      </main>
      <footer className="lx-footer" data-ground="night">
        <div className="lx-container lx-grid">
          <div className="lx-col-rail">
            <Logo ground="night" href={homeHref} label={labels.home} />
          </div>
          <nav className="lx-col-content" aria-label={labels.footerNav}>
            <NavList items={navItems} listClass="lx-footer__nav-list" linkClass="lx-footer__link" />
          </nav>
        </div>
      </footer>
    </>
  );
}
