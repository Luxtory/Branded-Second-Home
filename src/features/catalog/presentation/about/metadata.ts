import type { Metadata } from 'next';
import { loadEnv } from '@/features/platform';
import { aboutMessages } from '../i18n/about-pt-br';
import { brandPartnersMessages } from '../i18n/brand-partners-pt-br';
import { aboutContext, type AboutJourney } from './context';

/** Same canonical convention as Brand Partners; each route guards metadata before calling this builder. */
export function aboutMetadata(journey: AboutJourney): Metadata {
  const { eyebrow: title, lead: description } = aboutMessages.content.hero;
  const url = aboutContext(journey).about;
  const indexable = loadEnv().VERCEL_ENV === 'production';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: brandPartnersMessages.metadata.siteName,
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
    robots: { index: indexable, follow: indexable },
  };
}
