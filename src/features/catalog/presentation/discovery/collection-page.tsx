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

/** Abaixo do Frame: a marca e, quando houver, cada Edition (região · modalidade). Sem condições: só no Concept. */
function CardDetails({ card }: { readonly card: PublicConceptCard }) {
  return (
    <>
      <ConceptCredit lead={collection.credit} brandName={card.brandName} />
      {card.editions.length === 0 ? null : (
        <ul className="lx-prose" aria-label={collection.editionsLabel}>
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

/** Um grupo da Coleção; grupo vazio não aparece (spec catalog §13.4). */
function Group({
  id,
  ground,
  copy,
  cards,
}: {
  readonly id: string;
  readonly ground: Ground;
  readonly copy: { readonly title: string; readonly text: string; readonly listLabel: string };
  readonly cards: readonly PublicConceptCard[];
}) {
  if (cards.length === 0) return null;
  return (
    <Scene titleId={id} ground={ground}>
      <div className="lx-col-content lx-scene__body">
        <h2 id={id} className="lx-display-l">
          {copy.title}
        </h2>
        <p className="lx-lead">{nb(copy.text)}</p>
      </div>
      <div>
        <Collection
          label={copy.listLabel}
          items={cards.map((card) => ({
            id: card.id,
            href: discoveryPaths.concept(card.id),
            title: card.title,
            marker: [],
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
      <Scene titleId="colecao" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h1 id="colecao" className="lx-display-xl">
            {collection.header.title}
          </h1>
          <p className="lx-lead">{collection.header.text}</p>
          {status === null ? null : <StatusNote message={status} action={howItWorksLink} />}
        </div>
      </Scene>
      {groups === null ? null : (
        <>
          <Group
            id={discoveryPaths.editionsAnchor}
            ground="wash"
            copy={collection.editions}
            cards={groups.withEditions}
          />
          <Group
            id={discoveryPaths.conceptsAnchor}
            ground={groups.withEditions.length > 0 ? 'paper' : 'wash'}
            copy={collection.concepts}
            cards={groups.withoutEditions}
          />
        </>
      )}
    </DiscoverySite>
  );
}
