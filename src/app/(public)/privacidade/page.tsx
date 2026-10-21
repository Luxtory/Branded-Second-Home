import type { Metadata } from 'next';
import { DiscoverySite } from '@/features/catalog/presentation/discovery/site';
import { privacyPageMessages } from '@/features/ownership/presentation/i18n/privacy-notice-pt-br';
import { PrivacyNoticePage } from '@/features/ownership/presentation/privacy-notice-page';

export const metadata: Metadata = { title: privacyPageMessages.metadata };

// Aviso de Privacidade da jornada da solicitação de conversa (spec ownership §14.11), na casca B2C.
export default function Page() {
  return (
    <DiscoverySite current="none">
      <PrivacyNoticePage />
    </DiscoverySite>
  );
}
