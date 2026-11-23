import type { Metadata } from 'next';
import { AdminFinancePage } from '@/features/billing/presentation/finance-page';
import { financeMessages } from '@/features/billing/presentation/i18n/finance-pt-br';

export const metadata: Metadata = {
  title: financeMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page() {
  return <AdminFinancePage />;
}
