import type { ReactNode } from 'react';
import { Logo, logoUrl } from './logo';
import { MobileNav } from './mobile-nav';

export interface SiteNavItem {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

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

export function SiteShell({
  homeHref,
  labels,
  navItems,
  menuFooter,
  overlayHeader = false,
  retractableMenu = false,
  children,
}: {
  readonly homeHref: string;
  readonly labels: SiteShellLabels;
  readonly navItems: readonly SiteNavItem[];
  readonly menuFooter?: ReactNode;
  readonly overlayHeader?: boolean;
  readonly retractableMenu?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <>
      <a className="lx-skip-link" href={`#${MAIN_ID}`}>
        {labels.skipLink}
      </a>
      <header
        className={[
          'lx-header',
          overlayHeader ? 'lx-header--overlay' : '',
          retractableMenu ? 'lx-header--retractable' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-ground={overlayHeader ? 'night' : 'paper'}
      >
        <div className="lx-container lx-header__inner">
          <Logo ground={overlayHeader ? 'night' : 'paper'} href={homeHref} label={labels.home} />

          {retractableMenu ? null : (
            <nav className="lx-header__nav" aria-label={labels.nav}>
              <NavList items={navItems} listClass="lx-header__list" linkClass="lx-header__link" />
            </nav>
          )}

          <div className="lx-header__actions">
            <MobileNav
              ground="night"
              mainId={MAIN_ID}
              mode={retractableMenu ? 'retractable' : 'mobile'}
              labels={{
                open: labels.openMenu,
                close: labels.closeMenu,
                menu: labels.menu,
                nav: labels.nav,
              }}
              buttonClassName="lx-header__menu-button"
              trigger={
                retractableMenu ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- official logo asset is served verbatim; Next/Image would route it through the optimizer and violate the strict CSP contract. */}
                    <img
                      className="lx-menu-trigger__mark"
                      src={logoUrl('icon/warm-sand')}
                      alt=""
                      aria-hidden="true"
                    />
                  </>
                ) : undefined
              }
              logo={<Logo ground="night" href={homeHref} label={labels.home} />}
              nav={
                <NavList
                  items={navItems}
                  listClass="lx-mobile-nav__list"
                  linkClass="lx-mobile-nav__link"
                />
              }
              footer={menuFooter}
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
