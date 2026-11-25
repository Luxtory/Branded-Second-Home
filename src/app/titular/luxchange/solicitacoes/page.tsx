import type { Metadata } from 'next';
import { requestMessages } from '@/features/luxchange/presentation/i18n/request-pt-br';
import { TitularRequestsPage } from '@/features/luxchange/presentation/request-pages';

export const metadata: Metadata = {
  title: requestMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page() {
  return <TitularRequestsPage />;
}
