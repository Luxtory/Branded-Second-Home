import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isSecondHomePartnersSiteOpen } from '@/features/platform';

/**
 * Portão da jornada Second Home Partners (SHP1, spec catalog §18.1), independente do site B2C (`PUBLIC_SITE`) e do
 * portão Brand Partners: fechada em Production até o go-live (`SECOND_HOME_PARTNERS_SITE=open`) → 404 da plataforma.
 */
export default function SecondHomePartnersLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!isSecondHomePartnersSiteOpen()) notFound();
  return children;
}
