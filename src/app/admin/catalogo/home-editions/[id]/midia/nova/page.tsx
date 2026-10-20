import type { Metadata } from 'next';
import { NewHomeEditionMediaPage } from '@/features/catalog/presentation/home-edition-media-pages';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.homeEditionMedia,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewHomeEditionMediaPage id={id} />;
}
