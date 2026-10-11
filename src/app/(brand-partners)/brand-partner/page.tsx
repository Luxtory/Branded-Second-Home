import { notFound } from 'next/navigation';
import { BrandPartnersHomePage } from '@/features/catalog/presentation/brand-partners/home-page';
import { brandPartnersMetadata } from '@/features/catalog/presentation/brand-partners/metadata';
import { isBrandPartnersSiteOpen } from '@/features/platform';

// O layout do grupo renderiza em paralelo com a página e com os metadados: sem o portão aqui também, o 404 fechado
// levaria a copy e os metadados da BP1 no payload (spec catalog §14.1).
export default function BrandPartnersHomeRoute() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return <BrandPartnersHomePage />;
}

export function generateMetadata() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return brandPartnersMetadata('home');
}
