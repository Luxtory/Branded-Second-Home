import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isBrandPartnersSiteOpen } from '@/features/platform';

/**
 * Portão da jornada Brand Partners (BP1, spec catalog §14.1), independente do site B2C (`PUBLIC_SITE`): fechada em
 * Production até o go-live (`BRAND_PARTNERS_SITE=open`) → 404 da plataforma.
 */
export default function BrandPartnersLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!isBrandPartnersSiteOpen()) notFound();
  return children;
}
