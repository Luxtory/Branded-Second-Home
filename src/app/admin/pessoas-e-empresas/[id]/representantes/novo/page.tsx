import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';
import { InviteRepresentativePage } from '@/features/identity/presentation/party-admin-pages';

export const metadata: Metadata = {
  title: partyMessages.metadata.invite,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InviteRepresentativePage id={id} />;
}
