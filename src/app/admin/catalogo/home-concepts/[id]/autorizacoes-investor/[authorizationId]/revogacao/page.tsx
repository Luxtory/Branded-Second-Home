import type { Metadata } from 'next';
import { RevocationPage } from '@/features/catalog/presentation/home-concept-pages';
import { messages } from '@/features/catalog/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.revocation,
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; authorizationId: string }>;
}) {
  const { id, authorizationId } = await params;
  return <RevocationPage id={id} authorizationId={authorizationId} />;
}
