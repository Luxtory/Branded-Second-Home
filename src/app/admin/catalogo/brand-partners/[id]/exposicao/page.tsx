import type { Metadata } from 'next';
import { ExposurePage } from '@/features/catalog/presentation/brand-partner-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.exposure,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExposurePage id={id} />;
}
