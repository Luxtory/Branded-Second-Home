import type { Metadata } from 'next';
import { initialDrawMessages } from '@/features/ownership/presentation/i18n/initial-draw-pt-br';
import { TitularInitialDrawPage } from '@/features/ownership/presentation/initial-draw-titular';

export const metadata: Metadata = {
  title: initialDrawMessages.metadataTitle,
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ drawId: string }> }) {
  const { drawId } = await params;
  return <TitularInitialDrawPage drawId={drawId} />;
}
