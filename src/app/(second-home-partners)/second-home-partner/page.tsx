import { notFound } from 'next/navigation';
import { SecondHomePartnersHomePage } from '@/features/catalog/presentation/second-home-partners/home-page';
import { secondHomePartnersMetadata } from '@/features/catalog/presentation/second-home-partners/metadata';
import { isSecondHomePartnersSiteOpen } from '@/features/platform';

// O layout do grupo renderiza em paralelo com a página e com os metadados: sem o portão aqui também, o 404 fechado
// levaria a copy e os metadados da SHP1 no payload (spec catalog §18.1).
export default function SecondHomePartnersRoute() {
  if (!isSecondHomePartnersSiteOpen()) notFound();
  return <SecondHomePartnersHomePage />;
}

export function generateMetadata() {
  if (!isSecondHomePartnersSiteOpen()) notFound();
  return secondHomePartnersMetadata();
}
