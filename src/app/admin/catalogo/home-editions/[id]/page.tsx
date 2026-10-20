import type { Metadata } from 'next';
import { HomeEditionPage } from '@/features/catalog/presentation/home-edition-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';
import { statusKey } from '@/features/catalog/presentation/paths';

export const metadata: Metadata = {
  title: messages.metadata.homeEdition,
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
  return <HomeEditionPage id={id} status={statusKey(query.status)} />;
}
