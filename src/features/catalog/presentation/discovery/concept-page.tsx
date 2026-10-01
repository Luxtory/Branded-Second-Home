import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ConceptCredit, Evidence, Scene, TypographicFrame } from '@/design-system/react';
import {
  distinctRegions,
  publicConceptId,
  type PublicConcept,
} from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { toParagraphs } from './paragraphs';
import { ActionLink, ModalityText, Paragraphs } from './parts';
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
    <div className="lx-prose">
      {toParagraphs(value).map((paragraph) => (
        <p className="lx-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** Oferta: cada Edition como registrada; sem Edition, sem oferta comercial (BR-004, REQ-022). */
function Offer({ concept }: { readonly concept: PublicConcept }) {
  if (concept.editions.length === 0) return <p className="lx-lead">{copy.offer.none}</p>;
  return (
    <>
      <p className="lx-lead">{copy.offer.lead}</p>
      <ul className="lx-blocks">
        {concept.editions.map((edition) => (
          <li className="lx-blocks__item" key={edition.id}>
            <h3 className="lx-display-s">{edition.region}</h3>
            <Evidence
              inline
              items={[
                { label: copy.offer.modality, value: <ModalityText value={edition.modality} /> },
              ]}
            />
            <h4 className="lx-label">{copy.offer.conditions}</h4>
            <Registered value={edition.commercialConditions} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Concept `/colecao/[conceptId]` (spec catalog §13.4): Most Aware, PUSH + prova necessária. Só o conteúdo público
 * (§13.1); nenhum preço calculado (ADR-001 do `03`). "Manifestar interesse" ausente até a W6 (D-B2C-10); o PUSH oferece
 * "Conheça outros Concepts" e "Entenda como funciona" (decisão do brief).
 */
export async function ConceptPage({ conceptId }: { readonly conceptId: string }) {
  const result = await loadPublicConcept(conceptId);
  if (result.status === 'unavailable') {
    return (
      <DiscoverySite current="collection">
        <Scene titleId="concept-indisponivel" ground="paper">
          <div className="lx-col-content lx-scene__body">
            <h1 id="concept-indisponivel" className="lx-display-l">
              {text.site.collection}
            </h1>
            <StatusNote
              message={copy.unavailable}
              action={<ActionLink href={discoveryPaths.collection} label={actions.collection} />}
            />
          </div>
        </Scene>
      </DiscoverySite>
    );
  }
  const concept = result.value;
  if (concept === null) notFound();
  const regions = distinctRegions(concept.editions);

  return (
    <DiscoverySite current="collection">
      <Scene
        titleId="concept"
        ground="night"
        variant="opening"
        backdrop={<TypographicFrame kind="establishing" scrim />}
      >
        <div className="lx-col-content lx-scene__body">
          {regions.length === 0 ? null : (
            <p className="lx-marker">
              {regions.map((region) => (
                <span key={region}>{region}</span>
              ))}
            </p>
          )}
          <h1 id="concept" className="lx-display-xl">
            {concept.title}
          </h1>
          <ConceptCredit lead={copy.credit} brandName={concept.brandName} />
        </div>
      </Scene>

      <Scene titleId="proposta" ground="paper">
        <div className="lx-col-text lx-scene__body">
          <h2 id="proposta" className="lx-display-m">
            {copy.residence.title}
          </h2>
          <Registered value={concept.specification} />
        </div>
      </Scene>

      <Scene titleId="fiel-ao-concept" ground="night" variant="statement">
        <div className="lx-col-text lx-scene__body">
          <h2 id="fiel-ao-concept" className="lx-display-l">
            <HeadlineText headline={copy.faithful.title} />
          </h2>
          <Paragraphs lines={copy.faithful.text} />
        </div>
      </Scene>

      <Scene titleId="editions" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h2 id="editions" className="lx-display-l">
            {copy.offer.title}
          </h2>
          <Offer concept={concept} />
        </div>
      </Scene>

      <Qualification titleId="para-quem">
        <div className="lx-scene__actions">
          <ActionLink primary href={discoveryPaths.collection} label={actions.otherConcepts} />
          <ActionLink href={discoveryPaths.howItWorks} label={actions.howItWorks} />
        </div>
      </Qualification>
    </DiscoverySite>
  );
}
