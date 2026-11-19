import type { Metadata } from 'next';
import { TitularGuestNominationPage } from '@/features/booking/presentation/guest-nomination-page';
import { guestNominationMessages } from '@/features/booking/presentation/i18n/guest-nomination-pt-br';

export const metadata: Metadata = {
  title: guestNominationMessages.metadataTitle,
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
  return <TitularGuestNominationPage bookingId={bookingId} searchParams={await searchParams} />;
}
