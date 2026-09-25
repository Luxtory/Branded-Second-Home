import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { messages } from '@/features/platform/presentation/i18n/pt-br';
import '@/design-system/styles/index.css';

export const metadata: Metadata = {
  title: messages.site.name,
  icons: { icon: { url: '/favicon.ico', type: 'image/svg+xml' } },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body data-ground="paper">{children}</body>
    </html>
  );
}
