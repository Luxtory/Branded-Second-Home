import type { Metadata } from 'next';
import { HomeConceptPage } from '@/features/catalog/presentation/home-concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';
import { statusKey } from '@/features/catalog/presentation/paths';

export const metadata: Metadata = {
  title: messages.metadata.homeConcept,
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
  return <HomeConceptPage id={id} status={statusKey(query.status)} />;
}
