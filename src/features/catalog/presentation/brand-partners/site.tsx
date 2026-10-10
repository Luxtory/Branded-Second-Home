import type { ReactNode } from 'react';
import { SiteShell } from '@/design-system/react';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { brandPartnersPaths, type BrandPartnersSection } from './paths';

/**
 * Casca da jornada Brand Partners (REQ-028, spec catalog §14.1): o mesmo `SiteShell` do Core, com logo, menu e rodapé
 * só para destinos B2B — Brand Partners, Como funciona e Contato. Sem Home B2C, Coleção, Concepts, login ou portal.
 * Header sólido: sem fotografia autorizada, o Hero é tipográfico.
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
        },
      ]}
    >
      {children}
    </SiteShell>
  );
}
