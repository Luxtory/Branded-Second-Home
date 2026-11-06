import type { Metadata } from 'next';
import { adminBookingMessages } from '@/features/booking/presentation/i18n/own-use-admin-pt-br';
import { AdminBookingPage } from '@/features/booking/presentation/own-use-admin-pages';

export const metadata: Metadata = {
  title: adminBookingMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookingId } = await params;
  return <AdminBookingPage bookingId={bookingId} searchParams={await searchParams} />;
}
