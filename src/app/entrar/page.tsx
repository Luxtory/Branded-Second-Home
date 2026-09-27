import type { Metadata } from 'next';
import { messages } from '@/features/identity/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: `${messages.login.title} — Luxtory`,
  robots: { index: false, follow: false },
};

export { LoginPage as default } from '@/features/identity/presentation/login-page';
