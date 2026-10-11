import { brandPartnersMetadata } from '@/features/catalog/presentation/brand-partners/metadata';

export { BrandPartnersHomePage as default } from '@/features/catalog/presentation/brand-partners/home-page';

export function generateMetadata() {
  return brandPartnersMetadata('home');
}
