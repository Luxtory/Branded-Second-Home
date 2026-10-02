import type { ReactNode } from 'react';
import { HorizonDrawing, SiteShell } from '@/design-system/react';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { discoveryPaths, type DiscoverySection } from './paths';

/**
 * Casca do site público B2C: logo → Home, Coleção e Como funciona; sem CTA no cabeçalho enquanto o formulário
 * de interesse não existe (D-B2C-10); nenhum link para o Admin nem para a jornada Brand Partners (D-LX-01). A gaveta do
 * celular fecha no horizonte da Home (o mesmo desenho do Opening Frame).
 */
export function DiscoverySite({
  current,
  children,
}: {
  readonly current: DiscoverySection;
  readonly children: ReactNode;
}) {
  return (
    <SiteShell
      homeHref={discoveryPaths.home}
      labels={text.site}
      menuFooter={<HorizonDrawing />}
      navItems={[
        {
          href: discoveryPaths.collection,
          label: text.site.collection,
          current: current === 'collection',
        },
        {
          href: discoveryPaths.howItWorks,
          label: text.site.howItWorks,
          current: current === 'howItWorks',
        },
      ]}
    >
      {children}
    </SiteShell>
  );
}
