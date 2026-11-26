import type { Metadata } from 'next';
import { bookingsMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularBookingDetailPage } from '@/features/booking/presentation/own-use-lifecycle-pages';
import { RequestBookingCommitmentNotice } from '@/features/luxchange/presentation/request-commitments';

export const metadata: Metadata = {
  title: bookingsMessages.detailTitle,
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
  return (
    <TitularBookingDetailPage
      bookingId={bookingId}
      searchParams={await searchParams}
      notice={<RequestBookingCommitmentNotice bookingId={bookingId} />}
    />
  );
}
