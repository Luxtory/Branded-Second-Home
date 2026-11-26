import type { Metadata } from 'next';
import { requestMessages } from '@/features/luxchange/presentation/i18n/request-pt-br';
import { TitularNewRequestPage } from '@/features/luxchange/presentation/request-pages';

export const metadata: Metadata = {
  title: requestMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TitularNewRequestPage searchParams={await searchParams} />;
}
