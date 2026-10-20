import type { Metadata } from 'next';
import { HomeEditionMediaPage } from '@/features/catalog/presentation/home-edition-media-pages';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';
import { statusKey } from '@/features/catalog/presentation/paths';

export const metadata: Metadata = {
  title: collectionMessages.metadata.homeEditionMedia,
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
  return <HomeEditionMediaPage id={id} mediaId={mediaId} status={statusKey(query.status)} />;
}
