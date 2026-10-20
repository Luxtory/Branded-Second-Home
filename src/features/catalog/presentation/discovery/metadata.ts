import type { Metadata } from 'next';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { loadPublicHomeConcept } from './home-concept-page';
import { loadPublicHomeEdition } from './home-edition-page';

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

/** Home Concept: só o título — resumir a especificação arriscaria mudar o sentido (docs/specs/catalog.md §13.4). */
export async function homeConceptMetadata(homeConceptId: string): Promise<Metadata> {
  const result = await loadPublicHomeConcept(homeConceptId);
  if (result.status !== 'ok' || result.value === null) return { title: metadata.notFound };
  const title = `${result.value.title}${metadata.homeConceptSuffix}`;
  return { title, openGraph: { title, locale: 'pt_BR', type: 'website' } };
}

/** Home Edition: o nome e o título do Home Concept (spec catalog §17.8); não pública ou inexistente → "não encontrada". */
export async function homeEditionMetadata(
  homeConceptId: string,
  homeEditionId: string,
): Promise<Metadata> {
  const result = await loadPublicHomeEdition(homeConceptId, homeEditionId);
  if (result.status !== 'ok' || result.value === null) return { title: metadata.notFound };
  const title = metadata.homeEdition(result.value.name, result.value.homeConceptTitle);
  return { title, openGraph: { title, locale: 'pt_BR', type: 'website' } };
}
