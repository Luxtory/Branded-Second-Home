import type { Metadata } from 'next';
import { messages } from '@/features/ownership/presentation/i18n/pt-br';
import { HomeEditionInterestsPage } from '@/features/ownership/presentation/interest-admin-pages';

export const metadata: Metadata = {
  title: messages.metadata.homeEdition,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ homeEditionId: string }> }) {
  return <HomeEditionInterestsPage homeEditionId={(await params).homeEditionId} />;
}
