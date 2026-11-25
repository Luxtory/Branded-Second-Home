import type { Metadata } from 'next';
import { requestMessages } from '@/features/luxchange/presentation/i18n/request-pt-br';
import { TitularRequestDetailPage } from '@/features/luxchange/presentation/request-pages';

export const metadata: Metadata = {
  title: requestMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  return <TitularRequestDetailPage requestId={requestId} sent={query.enviada === '1'} />;
}
