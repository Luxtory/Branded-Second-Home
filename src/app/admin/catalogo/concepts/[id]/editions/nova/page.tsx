import type { Metadata } from 'next';
import { NewEditionPage } from '@/features/catalog/presentation/concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.newEdition,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewEditionPage id={id} />;
}
