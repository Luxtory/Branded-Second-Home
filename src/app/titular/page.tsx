import type { Metadata } from 'next';
import { titularMessages } from '@/features/identity/presentation/i18n/titular-pt-br';
import { TitularAreaPage } from '@/features/identity/presentation/titular-pages';

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
  return <TitularAreaPage activated={status === 'activated'} />;
}
