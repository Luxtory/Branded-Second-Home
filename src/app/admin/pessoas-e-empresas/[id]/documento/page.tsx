import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';
import { PartyDocumentPage } from '@/features/identity/presentation/party-admin-pages';

export const metadata: Metadata = {
  title: partyMessages.metadata.document,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartyDocumentPage id={id} />;
}
