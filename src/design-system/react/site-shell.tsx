import type { ReactNode } from 'react';
import { Logo, logoUrl } from './logo';
import { MobileNav } from './mobile-nav';
import { SiteHeader } from './site-header';

export interface SiteNavItem {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
  /** Destino de conversão apresentado como ação (botão secundário) na barra do header; link comum no menu e no rodapé. */
  readonly action?: boolean;
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
/** Opt-in `titleRole="headline"`: the titles below the section headline take the surface's headline role. */
const TITLES_HEADLINE = 'lx-titles-headline';
/** Opt-in `typeCeiling="home-hero"`: no text of the content outgrows the Home Hero headline. */
const TYPE_CEILING = 'lx-type-ceiling';
/** Opt-in smaller italic section closings, independent of the journey's headline scale. */
const SUBTLE_CLOSINGS = 'lx-closings-subtle';

function NavList({
  items,
  listClass,
  linkClass,
  actionClass = linkClass,
}: {
  readonly items: readonly SiteNavItem[];
  readonly listClass: string;
  readonly linkClass: string;
  readonly actionClass?: string;
}) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.href}>
          <a
            className={item.action === true ? actionClass : linkClass}
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Casca do site público — primeiro consumidor do Core Design System (CP2, docs/specs/design-system.md §13): a raiz
 * `data-lx="core"` liga a geração nova; header e menu em `blue`, rodapé em `deep`. O header sobre a mídia
 * (`overlayHeader`) é transparente sobre o Cinematic Hero e fica sólido depois da rolagem. Opt-in: `navAlign="end"`
 * leva a nav para junto das ações; `menuTrigger="mark"` abre o menu pelo ícone oficial também fora do modo retrátil
 * (no retrátil, o ícone oficial é o padrão); `titleRole="headline"` dá aos títulos menores do conteúdo o papel de
 * headline da superfície, em vez da cor do corpo; `typeCeiling="home-hero"` faz do Hero da Home o teto tipográfico.
 */
export function SiteShell({
  homeHref,
  labels,
  navItems,
  menuFooter,
  overlayHeader = false,
  retractableMenu = false,
  navAlign = 'center',
  menuTrigger = retractableMenu ? 'mark' : 'icon',
  titleRole = 'body',
  typeCeiling = 'none',
  closingStyle = 'default',
  children,
}: {
  readonly homeHref: string;
  readonly labels: SiteShellLabels;
  readonly navItems: readonly SiteNavItem[];
  readonly menuFooter?: ReactNode;
  readonly overlayHeader?: boolean;
  readonly retractableMenu?: boolean;
  readonly navAlign?: 'center' | 'end';
  readonly menuTrigger?: 'icon' | 'mark';
  readonly titleRole?: 'body' | 'headline';
  readonly typeCeiling?: 'none' | 'home-hero';
  readonly closingStyle?: 'default' | 'subtle';
  readonly children: ReactNode;
}) {
  const mainClass = [
    titleRole === 'headline' ? TITLES_HEADLINE : '',
    typeCeiling === 'home-hero' ? TYPE_CEILING : '',
    closingStyle === 'subtle' ? SUBTLE_CLOSINGS : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div data-lx="core">
      <a className="lx-skip-link" href={`#${MAIN_ID}`}>
        {labels.skipLink}
      </a>
      <SiteHeader
        overlay={overlayHeader}
        retractable={retractableMenu}
        navAtEnd={navAlign === 'end'}
      >
        <div className="lx-container lx-header__inner">
          <Logo ground="night" href={homeHref} label={labels.home} />

          {retractableMenu ? null : (
            <nav className="lx-header__nav" aria-label={labels.nav}>
              <NavList
                items={navItems}
                listClass="lx-header__list"
                linkClass="lx-header__link"
                actionClass="lx-button lx-button--secondary"
              />
            </nav>
          )}

          <div className="lx-header__actions">
            <MobileNav
              ground="night"
              surface="blue"
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
                menuTrigger === 'mark' ? (
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
      </SiteHeader>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        {...(mainClass === '' ? {} : { className: mainClass })}
      >
        {children}
      </main>
      <footer className="lx-footer" data-surface="deep">
        <div className="lx-container lx-grid">
          <div className="lx-col-rail">
            <Logo ground="night" href={homeHref} label={labels.home} />
          </div>
          <nav className="lx-col-content" aria-label={labels.footerNav}>
            <NavList items={navItems} listClass="lx-footer__nav-list" linkClass="lx-footer__link" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
