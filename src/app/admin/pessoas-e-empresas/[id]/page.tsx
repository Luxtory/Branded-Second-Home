import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';
import { PartyDetailPage } from '@/features/identity/presentation/party-admin-pages';
import { partyStatusOf } from '@/features/identity/presentation/party-paths';

export const metadata: Metadata = {
  title: partyMessages.metadata.party,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { status } = await searchParams;
  return <PartyDetailPage id={id} status={partyStatusOf(status)} />;
}
