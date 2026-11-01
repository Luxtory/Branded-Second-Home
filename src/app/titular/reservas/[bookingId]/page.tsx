import type { Metadata } from 'next';
import { bookingsMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularBookingPage } from '@/features/booking/presentation/own-use-pages';

export const metadata: Metadata = {
  title: bookingsMessages.detailTitle,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return <TitularBookingPage bookingId={bookingId} />;
}
