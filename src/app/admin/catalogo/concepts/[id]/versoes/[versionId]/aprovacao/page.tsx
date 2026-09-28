import type { Metadata } from 'next';
import { ApprovalPage } from '@/features/catalog/presentation/concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.approval,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = await params;
  return <ApprovalPage id={id} versionId={versionId} />;
}
