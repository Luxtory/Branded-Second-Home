import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';
import { RevokeDelegationPage } from '@/features/identity/presentation/party-admin-pages';

export const metadata: Metadata = {
  title: partyMessages.metadata.revoke,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; delegationId: string }>;
}) {
  const { id, delegationId } = await params;
  return <RevokeDelegationPage id={id} delegationId={delegationId} />;
}
