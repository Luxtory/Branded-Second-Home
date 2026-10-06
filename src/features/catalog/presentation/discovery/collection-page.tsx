import { Collection, ConceptCredit } from '@/design-system/react';
import { groupCollection, type PublicConceptCard } from '../../application/public-views';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { nb } from './no-break';
import { ActionLink, ModalityText } from './parts';
import { discoveryPaths } from './paths';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';

const { collection, actions } = text;

const howItWorksLink = <ActionLink href={discoveryPaths.howItWorks} label={actions.howItWorks} />;

/** Abaixo do nome: a marca e, quando houver, cada Edition (região · modalidade), uma por linha. */
function CardDetails({ card }: { readonly card: PublicConceptCard }) {
  return (
    <>
      <ConceptCredit lead={collection.credit} brandName={card.brandName} />
      {card.editions.length === 0 ? null : (
        <ul className="lx-comparison__list" aria-label={collection.editionsLabel}>
          {card.editions.map((edition) => (
            <li className="lx-compact" key={edition.id}>
              {edition.region} · <ModalityText value={edition.modality} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** As regiões das Editions, sem repetição (metadado real); sem Edition, sem eyebrow. */
const regionsOf = (card: PublicConceptCard) => [
  ...new Set(card.editions.map((edition) => edition.region)),
];

/**
 * Um grupo da Coleção; grupo vazio não aparece (spec catalog §13.4). Com Edition, dois Concepts por linha (`feature`);
 * sem Edition, a sequência compacta.
 */
function Group({
  id,
  surface,
  copy,
  cards,
  variant,
}: {
  readonly id: string;
  readonly surface: 'sand' | 'white';
  readonly copy: { readonly title: string; readonly text: string; readonly listLabel: string };
  readonly cards: readonly PublicConceptCard[];
  readonly variant: 'feature' | 'compact';
}) {
  if (cards.length === 0) return null;
  return (
    <section className="lx-section" data-surface={surface} aria-labelledby={id}>
      <div className="lx-container">
        <div className="lx-section-head">
          <h2 id={id} className="lx-headline">
            {copy.title}
          </h2>
          <p className="lx-subheadline">{nb(copy.text)}</p>
        </div>
        <Collection
          label={copy.listLabel}
          variant={variant}
          items={cards.map((card) => ({
            id: card.id,
            href: discoveryPaths.concept(card.id),
            title: card.title,
            marker: regionsOf(card),
            details: <CardDetails card={card} />,
            cue: actions.viewConcept,
          }))}
        />
      </div>
    </section>
  );
}

/**
 * Coleção `/colecao` (spec catalog §13.4, receita §13.9): Discovery de produto, não marketplace. Primeiro os Concepts
 * com Edition (há oferta), depois os sem Edition — nenhum Concept nos dois grupos (REQ-022). Ordem de registro dentro
 * de cada grupo.
 */
export async function CollectionPage() {
  const result = await readPublicCatalog((tx) => reader.collection(tx));
  const groups = result.status === 'ok' ? groupCollection(result.value) : null;
  const status =
    result.status === 'unavailable'
      ? collection.unavailable
      : result.value.length === 0
        ? collection.empty
        : null;
  return (
    <DiscoverySite current="collection">
      <section className="lx-section" data-surface="blue" aria-labelledby="colecao">
        <div className="lx-container">
          <div className="lx-pause lx-pause--start">
            <h1 id="colecao" className="lx-statement">
              {collection.header.title}
            </h1>
            <p className="lx-subheadline">{nb(collection.header.text)}</p>
            {status === null ? null : <StatusNote message={status} action={howItWorksLink} />}
          </div>
        </div>
      </section>
      {groups === null ? null : (
        <>
          <Group
            id={discoveryPaths.editionsAnchor}
            surface="sand"
            copy={collection.editions}
            cards={groups.withEditions}
            variant="feature"
          />
          <Group
            id={discoveryPaths.conceptsAnchor}
            surface="white"
            copy={collection.concepts}
            cards={groups.withoutEditions}
            variant="compact"
          />
        </>
      )}
    </DiscoverySite>
  );
}
