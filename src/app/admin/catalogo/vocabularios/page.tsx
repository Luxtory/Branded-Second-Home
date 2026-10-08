import type { Metadata } from 'next';
import { VocabularyPage } from '@/features/catalog/presentation/collection-pages';
import { statusKey } from '@/features/catalog/presentation/paths';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.vocabulary,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return <VocabularyPage status={statusKey(query.status)} />;
}
