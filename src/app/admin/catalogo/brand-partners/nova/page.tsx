import type { Metadata } from 'next';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.newBrandPartner,
  robots: { index: false, follow: false },
};

export { NewBrandPartnerPage as default } from '@/features/catalog/presentation/brand-partner-pages';
