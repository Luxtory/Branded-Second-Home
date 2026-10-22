import type { Metadata } from 'next';
import { titularMessages } from '@/features/identity/presentation/i18n/titular-pt-br';
import { TitularRepresentationPage } from '@/features/identity/presentation/titular-pages';

export const metadata: Metadata = {
  title: titularMessages.metadata.representation,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  return <TitularRepresentationPage partyId={partyId} />;
}
