import type { Metadata } from 'next';
import { adminBookingMessages } from '@/features/booking/presentation/i18n/own-use-admin-pt-br';
import { AdminBookingsPage } from '@/features/booking/presentation/own-use-admin-pages';

export const metadata: Metadata = {
  title: adminBookingMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AdminBookingsPage searchParams={await searchParams} />;
}
