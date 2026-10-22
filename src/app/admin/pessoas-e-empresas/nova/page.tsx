import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';

export const metadata: Metadata = {
  title: partyMessages.metadata.newParty,
  robots: { index: false, follow: false },
};

export { NewPartyPage as default } from '@/features/identity/presentation/party-admin-pages';
