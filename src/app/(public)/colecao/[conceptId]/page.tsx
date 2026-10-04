import type { Metadata } from 'next';
import { ConceptPage } from '@/features/catalog/presentation/discovery/concept-page';
import { conceptMetadata } from '@/features/catalog/presentation/discovery/metadata';

interface Props {
  readonly params: Promise<{ conceptId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return conceptMetadata((await params).conceptId);
}

export default async function Page({ params }: Props) {
  return <ConceptPage conceptId={(await params).conceptId} />;
}
