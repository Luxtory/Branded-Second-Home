import type { Metadata } from 'next';
import { AdminPoliciesPage } from '@/features/pricing/presentation/policies-page';
import { policiesMessages } from '@/features/pricing/presentation/i18n/policies-pt-br';

export const metadata: Metadata = {
  title: policiesMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AdminPoliciesPage searchParams={await searchParams} />;
}
