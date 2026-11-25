import type { Metadata } from 'next';
import { calendarMessages } from '@/features/booking/presentation/i18n/own-use-pt-br';
import { TitularOwnUseCalendarPage } from '@/features/booking/presentation/own-use-pages';
import { RequestHoldingCommitmentsNotice } from '@/features/luxchange/presentation/request-commitments';

export const metadata: Metadata = {
  title: calendarMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ holdingId: string }> }) {
  const { holdingId } = await params;
  return (
    <TitularOwnUseCalendarPage
      holdingId={holdingId}
      notice={<RequestHoldingCommitmentsNotice holdingId={holdingId} />}
    />
  );
}
