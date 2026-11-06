import type { Metadata } from 'next';
import { notificationMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularNotificationsListPage } from '@/features/booking/presentation/own-use-lifecycle-pages';

export const metadata: Metadata = {
  title: notificationMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TitularNotificationsListPage />;
}
