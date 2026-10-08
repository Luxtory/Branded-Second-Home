import type { Metadata } from 'next';
import { CurationPage } from '@/features/catalog/presentation/collection-pages';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.curation,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CurationPage id={id} />;
}
