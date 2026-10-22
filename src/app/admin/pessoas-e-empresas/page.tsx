import type { Metadata } from 'next';
import { partyMessages } from '@/features/identity/presentation/i18n/parties-pt-br';

export const metadata: Metadata = {
  title: partyMessages.metadata.list,
  robots: { index: false, follow: false },
};

export { PartiesPage as default } from '@/features/identity/presentation/party-admin-pages';
