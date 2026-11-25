import type { Metadata } from 'next';
import { titularMessages } from '@/features/identity/presentation/i18n/titular-pt-br';
import { TitularAreaPage } from '@/features/identity/presentation/titular-pages';
import { TitularOwnUseSection } from '@/features/booking/presentation/own-use-pages';
import { TitularInitialDrawList } from '@/features/ownership/presentation/initial-draw-titular';
import { TitularWalletSection } from '@/features/credits/presentation/wallet-page';
import { TitularLuxchangeSection } from '@/features/luxchange/presentation/deposit-pages';
import { TitularRequestsSection } from '@/features/luxchange/presentation/request-pages';

export const metadata: Metadata = {
  title: titularMessages.metadata.area,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status } = await searchParams;
  return (
    <TitularAreaPage
      activated={status === 'activated'}
      extra={(session) => (
        <>
          <TitularOwnUseSection userId={session.userId} />
          <TitularInitialDrawList userId={session.userId} />
          <TitularWalletSection session={session} />
          <TitularLuxchangeSection session={session} />
          <TitularRequestsSection session={session} />
        </>
      )}
    />
  );
}
