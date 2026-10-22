import type { Metadata } from 'next';
import { titularMessages } from '@/features/identity/presentation/i18n/titular-pt-br';

export const metadata: Metadata = {
  title: titularMessages.metadata.login,
  robots: { index: false, follow: false },
};

export { TitularLoginPage as default } from '@/features/identity/presentation/titular-pages';
