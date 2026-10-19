import type { Metadata } from 'next';
import { messages } from '@/features/ownership/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.overview,
  robots: { index: false, follow: false },
};

export { InterestOverviewPage as default } from '@/features/ownership/presentation/interest-overview-page';
