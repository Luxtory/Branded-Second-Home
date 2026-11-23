import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SecondHomeDevelopmentPage } from '@/features/catalog/presentation/second-home-development/page';
import { secondHomeDevelopmentPaths } from '@/features/catalog/presentation/second-home-development/paths';
import { secondHomeDevelopmentMessages as text } from '@/features/catalog/presentation/i18n/second-home-development-pt-br';
import { isSecondHomeDevelopmentSiteOpen, loadEnv } from '@/features/platform';

export function generateMetadata(): Metadata {
  if (!isSecondHomeDevelopmentSiteOpen()) notFound();

  const { title, description, siteName } = text.metadata;
  const url = secondHomeDevelopmentPaths.home;
  const indexable = loadEnv().VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, siteName, url, type: 'website', locale: 'pt_BR' },
    robots: { index: indexable, follow: indexable },
  };
}

export default function SecondHomeDevelopmentRoute() {
  if (!isSecondHomeDevelopmentSiteOpen()) notFound();
  return <SecondHomeDevelopmentPage />;
}
