import type { Metadata } from 'next';
import { EndProjectedInvestmentPage } from '@/features/catalog/presentation/home-edition-media-pages';
import { collectionMessages } from '@/features/catalog/presentation/i18n/collection-pt-br';

export const metadata: Metadata = {
  title: collectionMessages.metadata.projectedInvestment,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; investmentId: string }>;
}) {
  const { id, investmentId } = await params;
  return <EndProjectedInvestmentPage id={id} investmentId={investmentId} />;
}
