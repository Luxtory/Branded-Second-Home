import type { Metadata } from 'next';
import { ConceptPage } from '@/features/catalog/presentation/concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';
import { statusKey } from '@/features/catalog/presentation/paths';

export const metadata: Metadata = {
  title: messages.metadata.concept,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ConceptPage id={id} status={statusKey(query.status)} />;
}
