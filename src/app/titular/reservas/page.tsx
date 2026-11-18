import type { Metadata } from 'next';
import { bookingsMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularBookingListPage } from '@/features/booking/presentation/own-use-lifecycle-pages';

export const metadata: Metadata = {
  title: bookingsMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TitularBookingListPage />;
}
