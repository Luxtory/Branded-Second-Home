import type { Metadata } from 'next';
import { messages } from '@/features/admin/presentation/i18n/pt-br';

export const metadata: Metadata = {
  title: messages.metadata.title,
  robots: { index: false, follow: false },
};

export { AdminHomePage as default } from '@/features/admin/presentation/admin-home-page';
