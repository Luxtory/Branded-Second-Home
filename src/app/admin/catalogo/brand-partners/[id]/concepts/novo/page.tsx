import type { Metadata } from 'next';
import { NewConceptPage } from '@/features/catalog/presentation/concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.newConcept,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewConceptPage brandPartnerId={id} />;
}
