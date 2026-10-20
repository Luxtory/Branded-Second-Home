import type { Metadata } from 'next';
import { EndReferenceValuePage } from '@/features/catalog/presentation/collection-pages';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.referenceValue,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; valueId: string }>;
}) {
  const { id, valueId } = await params;
  return <EndReferenceValuePage id={id} valueId={valueId} />;
}
