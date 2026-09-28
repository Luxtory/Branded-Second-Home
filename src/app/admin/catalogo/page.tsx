import type { Metadata } from 'next';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.catalog,
  robots: { index: false, follow: false },
};

export { BrandPartnersPage as default } from '@/features/catalog/presentation/brand-partner-pages';
