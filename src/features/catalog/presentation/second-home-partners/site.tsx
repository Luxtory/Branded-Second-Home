import type { ReactNode } from 'react';
import { SiteShell } from '@/design-system/react';
import { secondHomePartnersMessages as text } from '../i18n/second-home-partners-pt-br';
import { secondHomePartnersPaths } from './paths';

const anchor = (section: string) => `${secondHomePartnersPaths.home}#${section}`;

/**
 * Casca da jornada Second Home Partners (REQ-105, spec catalog §20.1): o mesmo `SiteShell` do Core, com logo, menu e
 * rodapé só para a própria página — Benefícios, Como funciona, Perguntas e a ação Conversar. Sem links para B2C, Brand
 * Partners ou Sobre (`D-LX-13`). Header sólido (Hero tipográfico); títulos no papel de headline da superfície (Warm Sand
 * em Deep e Blue) e o Hero da página como teto tipográfico, como no B2B.
 */
export function SecondHomePartnersSite({ children }: { readonly children: ReactNode }) {
  return (
    <SiteShell
      homeHref={secondHomePartnersPaths.home}
      labels={text.site}
      overlayHeader={false}
      navAlign="end"
      menuTrigger="mark"
      titleRole="headline"
      typeCeiling="home-hero"
      navItems={[
        { href: anchor('beneficios'), label: text.site.benefits, current: false },
        { href: anchor('como-funciona'), label: text.site.howItWorks, current: false },
        { href: anchor('perguntas'), label: text.site.questions, current: false },
        {
          href: anchor(secondHomePartnersPaths.conversationAnchor),
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
