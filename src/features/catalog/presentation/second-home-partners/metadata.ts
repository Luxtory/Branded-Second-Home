import type { Metadata } from 'next';
import { loadEnv } from '@/features/platform';
import { secondHomePartnersMessages as text } from '../i18n/second-home-partners-pt-br';
import { secondHomePartnersPaths } from './paths';

/**
 * SEO da página (spec catalog §20.1, `D-SHP-05`): canonical, title, description e metadados sociais da copy aprovada;
 * sem imagem social nem dados estruturados (não há prova, case ou parceiro para declarar). Fora de Production — Preview,
 * local e CI — a página não é indexável; fechada, o portão responde 404 antes de qualquer metadado.
 */
export function secondHomePartnersMetadata(): Metadata {
  const { title, description, siteName } = text.metadata;
  const url = secondHomePartnersPaths.home;
  const indexable = loadEnv().VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName, locale: 'pt_BR', type: 'website' },
    twitter: { card: 'summary', title, description },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}
