import type { Metadata } from 'next';
import { depositMessages } from '@/features/luxchange/presentation/i18n/deposit-pt-br';
import { TitularDepositPage } from '@/features/luxchange/presentation/deposit-pages';

export const metadata: Metadata = {
  title: depositMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TitularDepositPage searchParams={await searchParams} />;
}
