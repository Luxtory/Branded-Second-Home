import type { Metadata } from 'next';
import { adminBookingMessages } from '@/features/booking/presentation/i18n/own-use-admin-pt-br';
import { AdminBookingActPage } from '@/features/booking/presentation/own-use-admin-pages';

export const metadata: Metadata = {
  title: adminBookingMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ bookingId: string; acao: string }>;
}) {
  const { bookingId, acao } = await params;
  return <AdminBookingActPage bookingId={bookingId} slug={acao} />;
}
