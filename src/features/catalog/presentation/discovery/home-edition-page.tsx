import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Evidence } from '@/design-system/react';
import { publicId, type PublicHomeEdition } from '../../application/public-views';
import { mainImage } from '../../application/public-media';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { formatMoney } from '../money';
import { HeadlineText } from './headline';
import { MediaImage, Registered } from './home-edition-parts';
import { ActionLink, Eyebrow, Paragraphs } from './parts';
import { discoveryPaths } from './paths';
import { Qualification } from './qualification';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';

const { homeEdition: copy, actions } = text;
const OPENING_SIZES = '(min-width: 64rem) 55vw, 100vw';
const GALLERY_SIZES = '(min-width: 64rem) 30vw, (min-width: 48rem) 46vw, 100vw';

/** Uma leitura por requisição, compartilhada entre a página e a metadata. */
export const loadPublicHomeEdition = cache(async (homeConceptId: string, homeEditionId: string) => {
  const [conceptId, editionId] = [publicId(homeConceptId), publicId(homeEditionId)];
  if (conceptId === null || editionId === null) return { status: 'ok', value: null } as const;
  return readPublicCatalog((tx) => reader.homeEdition(tx, conceptId, editionId));
});

/** Abertura: caminho, "Home Edition", nome, crédito do Home Concept e da marca, e a imagem principal se houver. */
function Opening({ homeEdition }: { readonly homeEdition: PublicHomeEdition }) {
  const main = mainImage(homeEdition.media);
  const heading = (
    <div className="lx-pause lx-pause--start">
      <nav aria-label={copy.breadcrumb}>
        <p className="lx-compact">
          <a className="lx-link" href={discoveryPaths.collection}>
            {text.site.collection}
          </a>
          {' › '}
          <a className="lx-link" href={discoveryPaths.homeConcept(homeEdition.homeConceptId)}>
            {homeEdition.homeConceptTitle}
          </a>
        </p>
      </nav>
      <Eyebrow>{copy.eyebrow}</Eyebrow>
      <h1 id="home-edition" className="lx-statement">
        {homeEdition.name}
      </h1>
      <p className="lx-body">
        {copy.credit} {homeEdition.homeConceptTitle}, {copy.brandCredit} {homeEdition.brandName}
      </p>
    </div>
  );
  return (
    <section className="lx-section" data-surface="blue" aria-labelledby="home-edition">
      <div className="lx-container">
        {main === null ? (
          heading
        ) : (
          <div className="lx-columns lx-columns--5-7">
            {heading}
            <MediaImage
              media={main}
              owner="homeEdition"
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

/** Lista registrada (ambientes, amenidades, características), só quando existe. */
function RegisteredList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="lx-stack">
      <h3 className="lx-display-s">{title}</h3>
      <ul className="lx-editorial-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Configuração: tipologia, área, suítes e capacidade; os espaços e as listas registradas (BR-031, BR-036). */
function Configuration({ homeEdition }: { readonly homeEdition: PublicHomeEdition }) {
  const c = copy.configuration;
  return (
    <section className="lx-section" data-surface="sand" aria-labelledby="configuracao">
      <div className="lx-container lx-stack">
        <div className="lx-section-head">
          <h2 id="configuracao" className="lx-headline">
            {c.title}
          </h2>
        </div>
        <Evidence
          inline
          items={[
            { label: c.typology, value: homeEdition.typology },
            { label: c.area, value: text.collection.card.area(homeEdition.projectedAreaM2) },
            { label: c.suites, value: String(homeEdition.suites) },
            { label: c.guests, value: c.guestsValue(homeEdition.guestsMax) },
          ]}
        />
        <div className="lx-stack">
          <h3 className="lx-display-s">{c.spaces}</h3>
          <Registered value={homeEdition.spatialConfiguration} />
        </div>
        <RegisteredList title={c.rooms} items={homeEdition.rooms} />
        <RegisteredList title={c.amenities} items={homeEdition.amenities} />
        <RegisteredList title={c.characteristics} items={homeEdition.characteristics} />
      </div>
    </section>
  );
}

function Gallery({ homeEdition }: { readonly homeEdition: PublicHomeEdition }) {
  const images = homeEdition.media.filter((item) => item.kind !== 'floor_plan');
  const plans = homeEdition.media.filter((item) => item.kind === 'floor_plan');
  if (images.length === 0 && plans.length === 0) return null;
  const grid = (items: typeof images, plan: boolean) => (
    <ul className="lx-home-edition-gallery">
      {items.map((item) => (
        <li className="lx-home-edition-gallery__item" key={item.mediaId}>
          <MediaImage
            media={item}
            owner="homeEdition"
            className={
              plan
                ? 'lx-home-edition-gallery__media lx-home-edition-gallery__media--plan'
                : 'lx-home-edition-gallery__media'
            }
            sizes={GALLERY_SIZES}
          />
          {item.credit === null ? null : (
            <p className="lx-home-edition-gallery__credit">{item.credit}</p>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="lx-section" data-surface="white" aria-labelledby="galeria">
      <div className="lx-container lx-stack">
        <div className="lx-section-head">
          <h2 id="galeria" className="lx-headline">
            {copy.gallery.title}
          </h2>
        </div>
        {images.length === 0 ? null : grid(images, false)}
        {plans.length === 0 ? null : (
          <>
            <h3 className="lx-display-s">{copy.gallery.plans}</h3>
            {grid(plans, true)}
          </>
        )}
      </div>
    </section>
  );
}

/** Média projetada vigente com o rótulo e a explicação obrigatória (BR-034, REQ-100, REQ-101, L10). */
function ProjectedInvestment({ homeEdition }: { readonly homeEdition: PublicHomeEdition }) {
  const value = homeEdition.projectedInvestment;
  if (value === null) return null;
  return (
    <section className="lx-section" data-surface="white" aria-labelledby="media-projetada">
      <div className="lx-container lx-pause lx-pause--start">
        <h2 id="media-projetada" className="lx-headline">
          {copy.projected.title}
        </h2>
        <p className="lx-statement">{formatMoney(value.amountMinor, value.currency)}</p>
        <Paragraphs lines={copy.projected.text} />
      </div>
    </section>
  );
}

/**
 * Home Edition `/colecao/[homeConceptId]/home-editions/[homeEditionId]` (spec catalog §17.8, D-B2C-27): Most Aware,
 * PUSH + prova necessária. Só o registrado e aprovado (§17.7); sem localização, modalidade, condições, disponibilidade,
 * prazo nem preço (BR-031, BR-032, L10). Sem formulário até a W6 (D-B2C-10). De outro Home Concept → 404.
 */
export async function HomeEditionPage({
  homeConceptId,
  homeEditionId,
}: {
  readonly homeConceptId: string;
  readonly homeEditionId: string;
}) {
  const result = await loadPublicHomeEdition(homeConceptId, homeEditionId);
  if (result.status === 'unavailable') {
    return (
      <DiscoverySite current="collection">
        <section
          className="lx-section"
          data-surface="white"
          aria-labelledby="home-edition-indisponivel"
        >
          <div className="lx-container lx-pause lx-pause--start">
            <h1 id="home-edition-indisponivel" className="lx-headline">
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
  const homeEdition = result.value;
  if (homeEdition === null) notFound();

  return (
    <DiscoverySite current="collection">
      <Opening homeEdition={homeEdition} />

      <section className="lx-section" data-surface="white" aria-labelledby="apresentacao">
        <div className="lx-container">
          <div className="lx-section-head">
            <h2 id="apresentacao" className="lx-headline">
              {copy.presentation}
            </h2>
          </div>
          <div className="lx-stack">
            <Registered value={homeEdition.description} />
          </div>
        </div>
      </section>

      <Configuration homeEdition={homeEdition} />
      <Gallery homeEdition={homeEdition} />
      <ProjectedInvestment homeEdition={homeEdition} />

      <section className="lx-section" data-surface="deep" aria-labelledby="da-home-edition">
        <div className="lx-container lx-pause">
          <h2 id="da-home-edition" className="lx-headline">
            <HeadlineText headline={copy.toSecondHome.title} />
          </h2>
          <Paragraphs lines={copy.toSecondHome.text} className="lx-subheadline" />
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
