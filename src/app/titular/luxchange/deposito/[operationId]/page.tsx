import type { Metadata } from 'next';
import { depositMessages } from '@/features/luxchange/presentation/i18n/deposit-pt-br';
import { TitularDepositResultPage } from '@/features/luxchange/presentation/deposit-pages';

export const metadata: Metadata = {
  title: depositMessages.resultMetadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await params;
  return <TitularDepositResultPage operationId={operationId} />;
}
