import { Collection, ConceptCredit, Scene } from '@/design-system/react';
import { postgresPublicCatalogReader as reader } from '../../infrastructure/postgres-public-catalog-reader';
import { discoveryMessages as text } from '../i18n/discovery-pt-br';
import { discoveryPaths } from './paths';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';
import { StatusNote } from './status';
import { nb } from './no-break';

const { collection, concept, actions } = text;

const howItWorksLink = (
  <a className="lx-link lx-link--standalone" href={discoveryPaths.howItWorks}>
    {actions.howItWorks}
  </a>
);

/**
 * Coleção (brief: docs/specs/catalog.md §13.4) — os Concepts públicos (D-W4-02), na ordem de registro (D-W4-04). Cada
 * card: Frame tipográfico (P-1), regiões das Editions no marker e o crédito da marca.
 */
export async function CollectionPage() {
  const result = await readPublicCatalog((tx) => reader.collection(tx));
  let content;
  if (result.status === 'unavailable') {
    content = <StatusNote message={collection.unavailable} action={howItWorksLink} />;
  } else if (result.value.length === 0) {
    content = <StatusNote message={collection.empty} action={howItWorksLink} />;
  } else {
    content = (
      <Collection
        label={collection.listLabel}
        headingLevel={2}
        items={result.value.map((card) => ({
          id: card.id,
          href: discoveryPaths.concept(card.id),
          title: card.title,
          marker: card.regions,
          credit: <ConceptCredit lead={concept.creditLead} brandName={card.brandName} />,
        }))}
      />
    );
  }
  return (
    <DiscoverySite current="collection">
      <Scene titleId="colecao-titulo" ground="paper">
        <div className="lx-col-content lx-scene__body">
          <h1 id="colecao-titulo" className="lx-display-xl">
            {collection.title}
          </h1>
          <p className="lx-lead">{nb(collection.lead)}</p>
        </div>
        <div>{content}</div>
      </Scene>
    </DiscoverySite>
  );
}
