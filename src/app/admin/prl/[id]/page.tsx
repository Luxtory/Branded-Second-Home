import type { Metadata } from 'next';
import { prlMessages } from '@/features/pricing/presentation/i18n/prl-pt-br';
import { AdminPrlDetailPage } from '@/features/pricing/presentation/prl-detail-page';

export const metadata: Metadata = {
  title: prlMessages.metadataTitle,
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
  return <AdminPrlDetailPage secondHomeId={id} searchParams={await searchParams} />;
}
