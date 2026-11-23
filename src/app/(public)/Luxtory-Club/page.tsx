import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClubPage } from '@/features/catalog/presentation/discovery/club-page';
import { discoveryPaths } from '@/features/catalog/presentation/discovery/paths';
import { clubMessages } from '@/features/catalog/presentation/i18n/club-pt-br';
import { isPublicSiteOpen, loadEnv } from '@/features/platform';

export function generateMetadata(): Metadata {
  const env = loadEnv();
  if (!isPublicSiteOpen(env)) notFound();

  const { title, description, siteName } = clubMessages.metadata;
  const indexable = env.VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: discoveryPaths.howItWorks },
    openGraph: { title, description, siteName, locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary', title, description },
    robots: { index: indexable, follow: indexable },
  };
}

export default function ClubRoute() {
  // The route and the parent layout can render in parallel.
  if (!isPublicSiteOpen()) notFound();
  return <ClubPage />;
}
