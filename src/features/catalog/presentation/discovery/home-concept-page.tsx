import { notFound } from 'next/navigation';
import { cache } from 'react';
import { HomeConceptCredit } from '@/design-system/react';
import { publicId, type PublicHomeConcept } from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { HeadlineText } from './headline';
import { HomeEditionCard, MediaImage, Registered } from './home-edition-parts';
import { ActionLink, Eyebrow, Paragraphs } from './parts';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';

const { homeConcept: copy, actions } = text;
const HOME_EDITIONS_ID = 'home-editions';
const OPENING_SIZES = '(min-width: 64rem) 55vw, 100vw';

/** Uma leitura por requisição, compartilhada entre a página e a metadata. */
export const loadPublicHomeConcept = cache(async (homeConceptId: string) => {
  const id = publicId(homeConceptId);
  if (id === null) return { status: 'ok', value: null } as const;
  return readPublicCatalog((tx) => reader.homeConcept(tx, id));
});

/** Home Editions publicadas: um card por Home Edition; sem nenhuma, a frase honesta (spec §17.8). */
function HomeEditions({ homeConcept }: { readonly homeConcept: PublicHomeConcept }) {
  if (homeConcept.homeEditions.length === 0) {
    return <p className="lx-display-m">{copy.homeEditions.none}</p>;
  }
  return (
    <ul className="lx-home-edition-grid" aria-label={copy.homeEditions.title}>
      {homeConcept.homeEditions.map((homeEdition) => (
        <li key={homeEdition.id}>
          <HomeEditionCard homeConceptId={homeConcept.id} homeEdition={homeEdition} />
        </li>
      ))}
    </ul>
  );
}

/** Abertura: lifestyle principal, título, crédito da marca (só com autorização) e a capa aprovada, quando houver. */
function Opening({ homeConcept }: { readonly homeConcept: PublicHomeConcept }) {
  const heading = (
    <div className="lx-pause lx-pause--start">
      {homeConcept.lifestyle === null ? null : <Eyebrow>{homeConcept.lifestyle}</Eyebrow>}
      <h1 id="home-concept" className="lx-statement">
        {homeConcept.title}
      </h1>
      <HomeConceptCredit lead={copy.credit} brandName={homeConcept.brandName} />
      {homeConcept.homeEditions.length === 0 ? null : (
        <ActionLink
          href={`#${HOME_EDITIONS_ID}`}
          label={copy.homeEditions.title}
          icon="arrow-down"
        />
      )}
    </div>
  );
  return (
    <section className="lx-section" data-surface="blue" aria-labelledby="home-concept">
      <div className="lx-container">
        {homeConcept.cover === null ? (
          heading
        ) : (
          <div className="lx-columns lx-columns--5-7">
            {heading}
            <MediaImage
              media={homeConcept.cover}
              owner="homeConcept"
              className="lx-home-edition-opening__media"
              sizes={OPENING_SIZES}
              eager
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Home Concept `/colecao/[homeConceptId]` (spec catalog §17.8, receita §13.9): Product Aware → Most Aware, PROOF → PUSH.
 * Só o conteúdo público (§17.7); nenhum preço calculado (ADR-001 do `03`); sem região, modalidade nem condições por Home
 * Edition (BR-031). Nenhum CTA de interesse até a W6 (D-B2C-10); o PUSH oferece "Conheça outros Home Concepts" e
 * "Entenda como funciona".
 */
export async function HomeConceptPage({ homeConceptId }: { readonly homeConceptId: string }) {
  const result = await loadPublicHomeConcept(homeConceptId);
  if (result.status === 'unavailable') {
    return (
      <DiscoverySite current="collection">
        <section
          className="lx-section"
          data-surface="white"
          aria-labelledby="home-concept-indisponivel"
        >
          <div className="lx-container lx-pause lx-pause--start">
            <h1 id="home-concept-indisponivel" className="lx-headline">
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
  const homeConcept = result.value;
  if (homeConcept === null) notFound();

  return (
    <DiscoverySite current="collection">
      <Opening homeConcept={homeConcept} />

      {/* A especificação registrada, numa coluna de leitura (Editorial Split sem mídia). */}
      <section className="lx-section" data-surface="white" aria-labelledby="proposta">
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="proposta" className="lx-headline">
              {copy.secondHome.title}
            </h2>
          </div>
          <div className="lx-stack">
            <Registered value={homeConcept.specification} />
          </div>
        </div>
      </section>

      <section className="lx-section" data-surface="deep" aria-labelledby="fiel-ao-home-concept">
        <div className="lx-container lx-pause">
          <h2 id="fiel-ao-home-concept" className="lx-headline">
            <HeadlineText headline={copy.faithful.title} />
          </h2>
          <Paragraphs lines={copy.faithful.text} className="lx-subheadline" />
        </div>
      </section>

      <section
        id={HOME_EDITIONS_ID}
        className="lx-section"
        data-surface="white"
        aria-labelledby="home-editions-titulo"
      >
        <div className="lx-container lx-stack">
          <div className="lx-section-head">
            <h2 id="home-editions-titulo" className="lx-headline">
              {copy.homeEditions.title}
            </h2>
            {homeConcept.homeEditions.length === 0 ? null : (
              <p className="lx-subheadline">{copy.homeEditions.lead}</p>
            )}
          </div>
          <HomeEditions homeConcept={homeConcept} />
          {homeConcept.homeEditions.some(
            (homeEdition) => homeEdition.projectedInvestment !== null,
          ) ? (
            <p className="lx-small">{text.collection.projectedNote}</p>
          ) : null}
        </div>
      </section>

      <Qualification titleId="para-quem">
        <div className="lx-actions-stack">
          <ActionLink primary href={discoveryPaths.collection} label={actions.otherHomeConcepts} />
          <ActionLink outline href={discoveryPaths.howItWorks} label={actions.howItWorks} />
        </div>
      </Qualification>
    </DiscoverySite>
  );
}
