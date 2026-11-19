import type { Metadata } from 'next';
import { luxtorySelectionMessages } from '@/features/calendar/presentation/i18n/luxtory-selection-pt-br';
import { AdminLuxtorySelectionPage } from '@/features/calendar/presentation/luxtory-selection-page';

export const metadata: Metadata = {
  title: luxtorySelectionMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return <AdminLuxtorySelectionPage secondHomeId={id} searchParams={await searchParams} />;
}
