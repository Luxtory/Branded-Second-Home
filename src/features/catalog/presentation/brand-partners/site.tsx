import type { ReactNode } from 'react';
import { SiteShell } from '@/design-system/react';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { brandPartnersPaths, type BrandPartnersSection } from './paths';

/**
 * Casca da jornada Brand Partners (REQ-028, spec catalog §14.1, §14.9): o mesmo `SiteShell` do Core, com logo, menu e
 * rodapé só para destinos B2B — Brand Partners, Como funciona e Contato. Sem Home B2C, Coleção, Concepts, login ou
 * portal. BP1.1 (D4): header sobre a fotografia do Hero; do `lg` em diante, nav visível no fim da barra com Contato
 * como ação; abaixo, o menu Core pelo ícone oficial.
 */
export function BrandPartnersSite({
  current,
  children,
}: {
  readonly current: BrandPartnersSection;
  readonly children: ReactNode;
}) {
  return (
    <SiteShell
      homeHref={brandPartnersPaths.home}
      labels={text.site}
      overlayHeader
      navAlign="end"
      menuTrigger="mark"
      navItems={[
        {
          href: brandPartnersPaths.home,
          label: text.site.brandPartners,
          current: current === 'home',
        },
        {
          href: brandPartnersPaths.howItWorks,
          label: text.site.howItWorks,
          current: current === 'howItWorks',
        },
        {
          href: brandPartnersPaths.conversation,
          label: text.site.contact,
          current: false,
          action: true,
        },
      ]}
    >
      {children}
    </SiteShell>
  );
}
