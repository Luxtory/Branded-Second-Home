import type { Metadata } from 'next';
import { EditHomeEditionPage } from '@/features/catalog/presentation/home-edition-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.editHomeEdition,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditHomeEditionPage id={id} />;
}
