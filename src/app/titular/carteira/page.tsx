import type { Metadata } from 'next';
import { walletMessages } from '@/features/credits/presentation/i18n/wallet-pt-br';
import { TitularWalletPage } from '@/features/credits/presentation/wallet-page';

export const metadata: Metadata = {
  title: walletMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TitularWalletPage searchParams={await searchParams} />;
}
