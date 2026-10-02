import { Collection, ConceptCredit, Scene, type Ground } from '@/design-system/react';
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

/** Ao lado (ou abaixo) do Frame: a marca e, quando houver, cada Edition (região · modalidade), uma por linha. */
function CardDetails({ card }: { readonly card: PublicConceptCard }) {
  return (
    <>
      <ConceptCredit lead={collection.credit} brandName={card.brandName} />
      {card.editions.length === 0 ? null : (
        <ul className="lx-rows" aria-label={collection.editionsLabel}>
          {card.editions.map((edition) => (
            <li className="lx-body" key={edition.id}>
              {edition.region} · <ModalityText value={edition.modality} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** As regiões das Editions, sem repetição: o Scene Marker do Frame (metadado real); sem Edition, sem marker. */
const regionsOf = (card: PublicConceptCard) => [
  ...new Set(card.editions.map((edition) => edition.region)),
];

/**
 * Um grupo da Coleção; grupo vazio não aparece (spec catalog §13.4). Com Edition, cada Concept ganha uma linha
 * inteira (`feature`); sem Edition, a sequência compacta.
 */
function Group({
  id,
  ground,
  copy,
  cards,
  variant,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly copy: { readonly title: string; readonly text: string; readonly listLabel: string };
  readonly cards: readonly PublicConceptCard[];
  readonly variant: 'feature' | 'compact';
}) {
  if (cards.length === 0) return null;
  return (
    <Scene titleId={id} ground={ground} chapter>
      <div className="lx-place-full lx-group-head">
        <h2 id={id} className="lx-display-xl">
          {copy.title}
        </h2>
        <p className="lx-lead">{nb(copy.text)}</p>
      </div>
      <div className="lx-place-full">
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
    </Scene>
  );
}

/**
 * Coleção `/colecao` (spec catalog §13.4): Discovery de produto, não marketplace. Primeiro os Concepts com Edition (há
 * oferta), depois os sem Edition — nenhum Concept nos dois grupos (REQ-022). Ordem de registro dentro de cada grupo.
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
      <Scene titleId="colecao" ground="night" chapter>
        <h1 id="colecao" className="lx-place-wide lx-display-2xl">
          {collection.header.title}
        </h1>
        <div className="lx-place-offset lx-scene__body">
          <p className="lx-lead">{nb(collection.header.text)}</p>
          {status === null ? null : <StatusNote message={status} action={howItWorksLink} />}
        </div>
      </Scene>
      {groups === null ? null : (
        <>
          <Group
            id={discoveryPaths.editionsAnchor}
            ground="paper"
            copy={collection.editions}
            cards={groups.withEditions}
            variant="feature"
          />
          <Group
            id={discoveryPaths.conceptsAnchor}
            ground="wash"
            copy={collection.concepts}
            cards={groups.withoutEditions}
            variant="compact"
          />
        </>
      )}
    </DiscoverySite>
  );
}
