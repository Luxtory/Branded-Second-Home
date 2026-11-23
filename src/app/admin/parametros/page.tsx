import type { Metadata } from 'next';
import { AdminEconomicParametersPage } from '@/features/admin/presentation/economic-parameters-page';
import { economicParametersMessages } from '@/features/admin/presentation/i18n/economic-parameters-pt-br';

export const metadata: Metadata = {
  title: economicParametersMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AdminEconomicParametersPage searchParams={await searchParams} />;
}
