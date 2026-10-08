import type { Metadata } from 'next';
import { MediaPage } from '@/features/catalog/presentation/collection-pages';
import { statusKey } from '@/features/catalog/presentation/paths';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.cover,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; mediaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, mediaId }, query] = await Promise.all([params, searchParams]);
  return <MediaPage id={id} mediaId={mediaId} status={statusKey(query.status)} />;
}
