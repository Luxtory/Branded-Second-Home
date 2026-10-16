import { notFound } from 'next/navigation';
import { isBrandPartnersSiteOpen } from '@/features/platform';
import { AboutContent } from '@/features/catalog/presentation/about/content';
import { aboutMetadata } from '@/features/catalog/presentation/about/metadata';
import { BrandPartnersSite } from '@/features/catalog/presentation/brand-partners/site';

export default function BrandPartnersAboutRoute() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return (
    <BrandPartnersSite current="about">
      <AboutContent journey="brandPartners" />
    </BrandPartnersSite>
  );
}

export function generateMetadata() {
  if (!isBrandPartnersSiteOpen()) notFound();
  return aboutMetadata('brandPartners');
}
