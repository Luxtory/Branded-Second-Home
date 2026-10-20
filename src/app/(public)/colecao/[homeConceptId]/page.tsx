import type { Metadata } from 'next';
import { HomeConceptPage } from '@/features/catalog/presentation/discovery/home-concept-page';
import { homeConceptMetadata } from '@/features/catalog/presentation/discovery/metadata';

interface Props {
  readonly params: Promise<{ homeConceptId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return homeConceptMetadata((await params).homeConceptId);
}

export default async function Page({ params }: Props) {
  return <HomeConceptPage homeConceptId={(await params).homeConceptId} />;
}
