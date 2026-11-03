import type { Metadata } from 'next';
import { notificationMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularNotificationsPage } from '@/features/booking/presentation/own-use-pages';

export const metadata: Metadata = {
  title: notificationMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TitularNotificationsPage />;
}
