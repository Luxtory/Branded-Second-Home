import type { Metadata } from 'next';
import { loadEnv } from '@/features/platform';
import { brandPartnersMessages as text } from '../i18n/brand-partners-pt-br';
import { brandPartnersPaths } from './paths';

type Page = 'home' | 'howItWorks';

/**
 * SEO por página (spec catalog §14.1): canonical, title, description e metadados sociais com textos da copy
 * aprovada; sem imagem social nem dados estruturados (não há prova, case ou marca parceira para declarar). Fora de
 * Production — Preview, local e CI — a página não é indexável.
 */
export function brandPartnersMetadata(page: Page): Metadata {
  const { title, description } = text.metadata[page];
  const url = brandPartnersPaths[page];
  const indexable = loadEnv().VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: text.metadata.siteName,
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}
