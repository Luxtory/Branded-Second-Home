import { brandPartnersMetadata } from '@/features/catalog/presentation/brand-partners/metadata';

export { BrandPartnersHowItWorksPage as default } from '@/features/catalog/presentation/brand-partners/how-it-works-page';

export function generateMetadata() {
  return brandPartnersMetadata('howItWorks');
}
