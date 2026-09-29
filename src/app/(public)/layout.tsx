import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isPublicSiteOpen } from '@/features/platform';

/** Portão do site público (D-W4-05, ADR-0012): fechado em Production até o go-live → 404 da plataforma. */
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!isPublicSiteOpen()) notFound();
  return children;
}
