import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { messages } from '@/features/platform/presentation/i18n/pt-br';
import '@/design-system/styles/index.css';

export const metadata: Metadata = {
  title: messages.site.name,
  icons: { icon: { url: '/favicon.ico', type: 'image/svg+xml' } },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // CSP com nonce (ADR-0012): toda página HTML é renderizada por requisição — uma página estática não teria o nonce
  // nos scripts do Next.js e a política os bloquearia.
  await connection();
  return (
    <html lang="pt-BR">
      <body data-ground="paper">{children}</body>
    </html>
  );
}
