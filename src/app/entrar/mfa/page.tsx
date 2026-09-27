import type { Metadata } from 'next';
import { messages } from '@/features/identity/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: `${messages.mfa.title} — Luxtory`,
  robots: { index: false, follow: false },
};

export { MfaPage as default } from '@/features/identity/presentation/mfa-page';
