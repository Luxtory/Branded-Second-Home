import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ConceptCredit, Evidence, HorizonDrawing, Scene } from '@/design-system/react';
import {
  distinctRegions,
  publicConceptId,
  type PublicConcept,
} from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { toParagraphs } from './paragraphs';
import { ActionLink, Marker, ModalityText, Paragraphs } from './parts';
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
function Registered({ value, className }: { readonly value: string; readonly className: string }) {
  return (
    <div className={className}>
      {toParagraphs(value).map((paragraph) => (
        <p className="lx-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * Oferta: cada Edition como uma ficha — a região, a modalidade e as condições como registradas; sem Edition, sem oferta
 * comercial (BR-004, REQ-022).
 */
function Offer({ concept }: { readonly concept: PublicConcept }) {
  if (concept.editions.length === 0) {
    return (
      <div className="lx-place-full lx-coda">
        <p className="lx-display-m">{copy.offer.none}</p>
      </div>
    );
  }
  return (
    <>
      {concept.editions.map((edition, index) => (
        <article className="lx-place-full lx-qa lx-edition" key={edition.id}>
          <div className="lx-edition__head">
            <span className="lx-numeral" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="lx-display-l">{edition.region}</h3>
          </div>
          <div className="lx-qa__answer">
            <Evidence
              items={[
                { label: copy.offer.modality, value: <ModalityText value={edition.modality} /> },
              ]}
            />
            <h4 className="lx-label">{copy.offer.conditions}</h4>
            <Registered value={edition.commercialConditions} className="lx-prose" />
          </div>
        </article>
      ))}
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
      {/* Capa de monografia: o nome em escala de monumento, a região real e a marca sobre a régua do grid. */}
      <Scene titleId="concept" ground="night" chapter>
        {regions.length === 0 ? null : (
          <div className="lx-place-full">
            <Marker parts={regions} />
          </div>
        )}
        <h1 id="concept" className="lx-place-wide lx-display-2xl">
          {concept.title}
        </h1>
        <div className="lx-place-full lx-opening-row">
          <HorizonDrawing sun={false} />
          <ConceptCredit lead={copy.credit} brandName={concept.brandName} />
          {concept.editions.length === 0 ? null : (
            <ActionLink href="#editions" label={copy.offer.title} />
          )}
        </div>
      </Scene>

      {/* A especificação registrada, com o primeiro parágrafo como abertura editorial. */}
      <Scene titleId="proposta" ground="paper" chapter>
        <div className="lx-place-aside lx-sticky">
          <h2 id="proposta" className="lx-display-l">
            {copy.residence.title}
          </h2>
        </div>
        <Registered value={concept.specification} className="lx-place-main lx-prose lx-spec" />
      </Scene>

      <Scene titleId="fiel-ao-concept" ground="night" chapter>
        <h2 id="fiel-ao-concept" className="lx-place-wide lx-display-xl">
          <HeadlineText headline={copy.faithful.title} />
        </h2>
        <div className="lx-place-offset lx-prose">
          <Paragraphs lines={copy.faithful.text} className="lx-lead" />
        </div>
      </Scene>

      <Scene id="editions" titleId="editions-titulo" ground="paper" chapter>
        <div className="lx-place-full lx-group-head">
          <h2 id="editions-titulo" className="lx-display-xl">
            {copy.offer.title}
          </h2>
          {concept.editions.length === 0 ? null : <p className="lx-lead">{copy.offer.lead}</p>}
        </div>
        <Offer concept={concept} />
      </Scene>

      <Qualification titleId="para-quem">
        <div className="lx-actions-stack">
          <ActionLink primary href={discoveryPaths.collection} label={actions.otherConcepts} />
          <ActionLink href={discoveryPaths.howItWorks} label={actions.howItWorks} />
        </div>
      </Qualification>
    </DiscoverySite>
  );
}
