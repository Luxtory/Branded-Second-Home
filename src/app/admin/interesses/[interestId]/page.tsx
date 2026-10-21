import type { Metadata } from 'next';
import { messages } from '@/features/ownership/presentation/i18n/pt-br';
import { InterestRecordPage } from '@/features/ownership/presentation/interest-admin-pages';

export const metadata: Metadata = {
  title: messages.metadata.interest,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ interestId: string }> }) {
  return <InterestRecordPage interestId={(await params).interestId} />;
}
