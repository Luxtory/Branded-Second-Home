import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ConceptCredit, Evidence } from '@/design-system/react';
import {
  distinctRegions,
  publicConceptId,
  type PublicConcept,
} from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { toParagraphs } from './paragraphs';
import { ActionLink, Eyebrow, ModalityText, ordinal, Paragraphs } from './parts';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';

const { concept: copy, actions } = text;

/** Uma leitura por requisição, compartilhada entre a página e a metadata. */
export const loadPublicConcept = cache(async (conceptId: string) => {
  const id = publicConceptId(conceptId);
  if (id === null) return { status: 'ok', value: null } as const;
  return readPublicCatalog((tx) => reader.concept(tx, id));
});

/** Texto registrado, em parágrafos, como está (BR-013, BR-031; spec catalog §13.7). */
function Registered({ value }: { readonly value: string }) {
  return (
    <>
      {toParagraphs(value).map((paragraph) => (
        <p className="lx-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

/**
 * Oferta: cada Edition como uma linha da Numbered Editorial List — a região, a modalidade e as condições como
 * registradas; sem Edition, sem oferta comercial (BR-004, REQ-022).
 */
function Offer({ concept }: { readonly concept: PublicConcept }) {
  if (concept.editions.length === 0) {
    return <p className="lx-display-m">{copy.offer.none}</p>;
  }
  return (
    <ol className="lx-numbered">
      {concept.editions.map((edition, index) => (
        <li className="lx-numbered__item" key={edition.id}>
          <span className="lx-ordinal lx-numbered__number" aria-hidden="true">
            {ordinal(index)}
          </span>
          <h3 className="lx-display-m">{edition.region}</h3>
          <div className="lx-numbered__text lx-stack">
            <Evidence
              items={[
                { label: copy.offer.modality, value: <ModalityText value={edition.modality} /> },
              ]}
            />
            <h4 className="lx-label">{copy.offer.conditions}</h4>
            <Registered value={edition.commercialConditions} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Concept `/colecao/[conceptId]` (spec catalog §13.4, receita §13.9): Most Aware, PUSH + prova necessária. Só o
 * conteúdo público (§13.1); nenhum preço calculado (ADR-001 do `03`). "Manifestar interesse" ausente até a W6
 * (D-B2C-10); o PUSH oferece "Conheça outros Concepts" e "Entenda como funciona" (decisão do brief).
 */
export async function ConceptPage({ conceptId }: { readonly conceptId: string }) {
  const result = await loadPublicConcept(conceptId);
  if (result.status === 'unavailable') {
    return (
      <DiscoverySite current="collection">
        <section className="lx-section" data-surface="white" aria-labelledby="concept-indisponivel">
          <div className="lx-container lx-pause lx-pause--start">
            <h1 id="concept-indisponivel" className="lx-headline">
              {text.site.collection}
            </h1>
            <StatusNote
              message={copy.unavailable}
              action={<ActionLink href={discoveryPaths.collection} label={actions.collection} />}
            />
          </div>
        </section>
      </DiscoverySite>
    );
  }
  const concept = result.value;
  if (concept === null) notFound();
  const regions = distinctRegions(concept.editions);

  return (
    <DiscoverySite current="collection">
      {/* Abertura tipográfica: as regiões reais, o nome e a marca (só com autorização). */}
      <section className="lx-section" data-surface="blue" aria-labelledby="concept">
        <div className="lx-container lx-pause lx-pause--start">
          {regions.length === 0 ? null : <Eyebrow>{regions.join(' · ')}</Eyebrow>}
          <h1 id="concept" className="lx-statement">
            {concept.title}
          </h1>
          <ConceptCredit lead={copy.credit} brandName={concept.brandName} />
          {concept.editions.length === 0 ? null : (
            <ActionLink href="#editions" label={copy.offer.title} />
          )}
        </div>
      </section>

      {/* A especificação registrada, numa coluna de leitura (Editorial Split sem mídia). */}
      <section className="lx-section" data-surface="white" aria-labelledby="proposta">
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="proposta" className="lx-headline">
              {copy.residence.title}
            </h2>
          </div>
          <div className="lx-stack">
            <Registered value={concept.specification} />
          </div>
        </div>
      </section>

      <section className="lx-section" data-surface="deep" aria-labelledby="fiel-ao-concept">
        <div className="lx-container lx-pause">
          <h2 id="fiel-ao-concept" className="lx-headline">
            <HeadlineText headline={copy.faithful.title} />
          </h2>
          <Paragraphs lines={copy.faithful.text} className="lx-subheadline" />
        </div>
      </section>

      <section
        id="editions"
        className="lx-section"
        data-surface="white"
        aria-labelledby="editions-titulo"
      >
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="editions-titulo" className="lx-headline">
              {copy.offer.title}
            </h2>
            {concept.editions.length === 0 ? null : (
              <p className="lx-subheadline">{copy.offer.lead}</p>
            )}
          </div>
          <Offer concept={concept} />
        </div>
      </section>

      <Qualification titleId="para-quem">
        <div className="lx-actions-stack">
          <ActionLink primary href={discoveryPaths.collection} label={actions.otherConcepts} />
          <ActionLink outline href={discoveryPaths.howItWorks} label={actions.howItWorks} />
        </div>
      </Qualification>
    </DiscoverySite>
  );
}
