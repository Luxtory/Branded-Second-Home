import type { Metadata } from 'next';
import { AdminGuestRulesPage } from '@/features/admin/presentation/guest-rules-page';
import { guestRulesMessages } from '@/features/admin/presentation/i18n/guest-rules-pt-br';

export const metadata: Metadata = {
  title: guestRulesMessages.metadataTitle,
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
  return <AdminGuestRulesPage secondHomeId={id} searchParams={await searchParams} />;
}
