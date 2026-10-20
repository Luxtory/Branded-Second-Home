import type { Metadata } from 'next';
import { NewVersionPage } from '@/features/catalog/presentation/home-concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.newVersion,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewVersionPage id={id} />;
}
