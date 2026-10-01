import type { Metadata } from 'next';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { loadPublicConcept } from './concept-page';

const { metadata } = text;

const page = (entry: { readonly title: string; readonly description: string }): Metadata => ({
  title: entry.title,
  description: entry.description,
  openGraph: {
    title: entry.title,
    description: entry.description,
    locale: 'pt_BR',
    type: 'website',
  },
});

export const homeMetadata = page(metadata.home);
export const howItWorksMetadata = page(metadata.howItWorks);
export const collectionMetadata = page(metadata.collection);
export const notFoundMetadata: Metadata = { title: metadata.notFound };

/** Concept: só o título — resumir a especificação arriscaria mudar o sentido (docs/specs/catalog.md §13.4). */
export async function conceptMetadata(conceptId: string): Promise<Metadata> {
  const result = await loadPublicConcept(conceptId);
  if (result.status !== 'ok' || result.value === null) return { title: metadata.notFound };
  const title = `${result.value.title}${metadata.conceptSuffix}`;
  return { title, openGraph: { title, locale: 'pt_BR', type: 'website' } };
}
