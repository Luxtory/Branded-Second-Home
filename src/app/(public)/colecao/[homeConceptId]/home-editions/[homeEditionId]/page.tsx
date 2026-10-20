import type { Metadata } from 'next';
import { HomeEditionPage } from '@/features/catalog/presentation/discovery/home-edition-page';
import { homeEditionMetadata } from '@/features/catalog/presentation/discovery/metadata';

interface Props {
  readonly params: Promise<{ homeConceptId: string; homeEditionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { homeConceptId, homeEditionId } = await params;
  return homeEditionMetadata(homeConceptId, homeEditionId);
}

export default async function Page({ params }: Props) {
  const { homeConceptId, homeEditionId } = await params;
  return <HomeEditionPage homeConceptId={homeConceptId} homeEditionId={homeEditionId} />;
}
