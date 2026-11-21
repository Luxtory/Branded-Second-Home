import type { Metadata } from 'next';
import { prlMessages } from '@/features/pricing/presentation/i18n/prl-pt-br';
import { AdminPrlListPage } from '@/features/pricing/presentation/prl-list-page';

export const metadata: Metadata = {
  title: prlMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminPrlListPage />;
}
