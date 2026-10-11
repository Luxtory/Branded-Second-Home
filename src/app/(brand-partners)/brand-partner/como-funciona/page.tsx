import { notFound } from 'next/navigation';
import { BrandPartnersHowItWorksPage } from '@/features/catalog/presentation/brand-partners/how-it-works-page';
import { brandPartnersMetadata } from '@/features/catalog/presentation/brand-partners/metadata';
import { isBrandPartnersSiteOpen } from '@/features/platform';

// Mesmo portão da Home, na página e nos metadados (o layout sozinho não impede o render paralelo).
export default function BrandPartnersHowItWorksRoute() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return <BrandPartnersHowItWorksPage />;
}

export function generateMetadata() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return brandPartnersMetadata('howItWorks');
}
