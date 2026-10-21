import type { Metadata } from 'next';
import { messages } from '@/features/ownership/presentation/i18n/pt-br';
import { InterestContactPage } from '@/features/ownership/presentation/interest-admin-pages';

export const metadata: Metadata = {
  title: messages.metadata.contact,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ interestId: string }> }) {
  return <InterestContactPage interestId={(await params).interestId} />;
}
