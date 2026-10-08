import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Icon } from '@/design-system/react';
import {
  collectionFacets,
  discoverCollection,
  type CollectionFacets,
  type CollectionGroups,
} from '../../application/collection-discovery';
import {
  activeFilters,
  collectionSearchParams,
  COLLECTION_PARAMS,
  COLLECTION_SORTS,
  EMPTY_COLLECTION_QUERY,
  parseCollectionQuery,
  type CollectionQuery,
  type SearchParams,
} from '../../application/collection-query';
import type { PublicCollectionEntry } from '../../application/collection-views';
import { postgresPublicCollectionReader as reader } from '../../infrastructure/postgres-public-collection-reader';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { ConceptCard } from './collection-card';
import { FiltersDialog, FiltersTrigger, StickyDiscovery } from './collection-client';
import {
  activeChips,
  collectionHref,
  DISCOVERY_ANCHOR,
  JOURNEY_ANCHOR,
  RESULTS_ANCHOR,
} from './collection-labels';
import {
  DiscoveryForm,
  GuestsFields,
  hasMoreFilters,
  LifestyleFields,
  MoreFields,
  RegionFields,
  StyleFields,
  ValueFields,
} from './collection-search';
import { ActionLink, ordinal } from './parts';
import { discoveryPaths } from './paths';
import { readPublicCatalog } from './read';
import { DiscoverySite } from './site';

/**
 * Coleção `/colecao` (spec catalog §13.12, D-B2C-21): discovery curatorial — Hero tipográfico com a busca como
 * protagonista, resultados em dois grupos (com e ainda sem Home Edition; com Localização, na região e "outros que
 * combinam"), a cadeia do Concept à Second Home e o fechamento. Busca, filtros e ordem no servidor; URL compartilhável.
 */
const text = discoveryMessages.collection;
const FORM_ID = DISCOVERY_ANCHOR;
const DIALOG_ID = 'filtros';
/** As primeiras imagens da página carregam já; as demais, ao se aproximar da tela. */
const EAGER_IMAGES = 2;

/** A busca como a URL a escreveria; parâmetro vazio, repetido ou fora de ordem → redireciona para a forma estável. */
function canonicalRedirect(params: SearchParams, query: CollectionQuery): string | null {
  const received = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of typeof value === 'string' ? [value] : (value ?? []))
      received.append(key, item);
  }
  const canonical = collectionSearchParams(query);
  return received.toString() === canonical.toString() ? null : collectionHref(query, null);
}

function ConceptList({
  label,
  entries,
  featuredId,
  eager,
}: {
  readonly label: string;
  readonly entries: readonly PublicCollectionEntry[];
  readonly featuredId: string | null;
  readonly eager: number;
}) {
  return (
    <ul className="lx-concept-grid" aria-label={label}>
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <ConceptCard entry={entry} featured={entry.id === featuredId} eager={index < eager} />
        </li>
      ))}
    </ul>
  );
}

function Group({
  id,
  title,
  lead,
  label,
  entries,
  featuredId,
  eager,
}: {
  readonly id: string;
  readonly title: string;
  readonly lead: string;
  readonly label: string;
  readonly entries: readonly PublicCollectionEntry[];
  readonly featuredId: string | null;
  readonly eager: number;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="lx-concept-group" id={id} aria-labelledby={`${id}-titulo`}>
      <div className="lx-concept-group__head">
        <h3 className="lx-display-s" id={`${id}-titulo`}>
          {title}
        </h3>
        <p className="lx-body">{lead}</p>
      </div>
      <ConceptList label={label} entries={entries} featuredId={featuredId} eager={eager} />
    </section>
  );
}

/** Os dois grupos: sem região, com e ainda sem Home Edition; com região, nela e "outros que combinam" (REQ-020/022). */
function Groups({
  groups,
  featuredId,
}: {
  readonly groups: CollectionGroups;
  readonly featuredId: string | null;
}) {
  const g = text.groups;
  const first = groups.kind === 'catalog' ? groups.withEdition : groups.inRegion;
  const eagerSecond = Math.max(0, EAGER_IMAGES - first.length);
  if (groups.kind === 'region') {
    return (
      <>
        <Group
          id={discoveryPaths.editionsAnchor}
          title={g.inRegion.title(groups.region)}
          lead={g.inRegion.text}
          label={g.inRegion.listLabel(groups.region)}
          entries={groups.inRegion}
          featuredId={featuredId}
          eager={EAGER_IMAGES}
        />
        <Group
          id={discoveryPaths.conceptsAnchor}
          title={g.others.title}
          lead={g.others.text(groups.region)}
          label={g.others.listLabel}
          entries={groups.others}
          featuredId={featuredId}
          eager={eagerSecond}
        />
      </>
    );
  }
  return (
    <>
      <Group
        id={discoveryPaths.editionsAnchor}
        title={g.editions.title}
        lead={g.editions.text}
        label={g.editions.listLabel}
        entries={groups.withEdition}
        featuredId={featuredId}
        eager={EAGER_IMAGES}
      />
      <Group
        id={discoveryPaths.conceptsAnchor}
        title={g.concepts.title}
        lead={g.concepts.text}
        label={g.concepts.listLabel}
        entries={groups.withoutEdition}
        featuredId={featuredId}
        eager={eagerSecond}
      />
    </>
  );
}

function SortLinks({ query }: { readonly query: CollectionQuery }) {
  return (
    <nav className="lx-sort" aria-label={text.results.sortLabel}>
      <span>{text.results.sortLabel}</span>
      {COLLECTION_SORTS.map((sort) => (
        <a
          key={sort}
          className="lx-link lx-sort__option"
          href={collectionHref({ ...query, sort })}
          aria-current={query.sort === sort ? 'true' : undefined}
        >
          {query.sort === sort ? <Icon name="check" className="lx-link__icon" /> : null}
          {text.results.sorts[sort]}
        </a>
      ))}
    </nav>
  );
}

const clearHrefOf = (query: CollectionQuery) =>
  collectionHref({ ...EMPTY_COLLECTION_QUERY, sort: query.sort });

/** Cabeçalho dos resultados: título, filtros ativos removíveis, contagem (só no status) e ordenação. */
function ResultsHead({
  query,
  facets,
  filtered,
  total,
}: {
  readonly query: CollectionQuery;
  readonly facets: CollectionFacets;
  readonly filtered: boolean;
  readonly total: number;
}) {
  const r = text.results;
  const chips = activeChips(query, facets);
  const basis = query.value === null ? null : text.facets.bases[query.value.basis].title;
  return (
    <div className="lx-results-head">
      {filtered ? null : <p className="lx-eyebrow">{r.eyebrow}</p>}
      <h2 className="lx-headline" id={`${RESULTS_ANCHOR}-titulo`}>
        {filtered ? r.filteredTitle : r.title}
      </h2>
      {chips.length === 0 ? null : (
        <ul className="lx-chips">
          {chips.map((chip) => (
            <li key={chip.key}>
              <a className="lx-chip" href={chip.href} aria-label={r.remove(chip.label)}>
                {chip.label}
                <Icon name="close" className="lx-link__icon" />
              </a>
            </li>
          ))}
          <li>
            <a className="lx-link" href={clearHrefOf(query)}>
              {r.clear}
            </a>
          </li>
        </ul>
      )}
      <p className="lx-body" role="status">
        {filtered ? r.count(total) : null}
        {basis === null ? null : ` ${text.facets.valueNote(basis)}`}
      </p>
      <SortLinks query={query} />
    </div>
  );
}

/** Grupo do diálogo com o nome que a faceta tem no desktop ("Faixa de valor", "Mais filtros"): paridade de rótulos. */
function DialogGroup({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-filters__group" aria-labelledby={id}>
      <h3 className="lx-eyebrow lx-filters__heading" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Diálogo dos filtros do celular: os mesmos campos, num formulário próprio (sem formulário aninhado). */
function MobileFilters({
  query,
  facets,
}: {
  readonly query: CollectionQuery;
  readonly facets: CollectionFacets;
}) {
  const fields = { prefix: DIALOG_ID, query, facets } as const;
  return (
    <FiltersDialog
      id={DIALOG_ID}
      title={text.search.dialogTitle}
      closeLabel={text.search.close}
      action={`${discoveryPaths.collection}#${RESULTS_ANCHOR}`}
      hidden={
        <>
          {query.text === '' ? null : (
            <input type="hidden" name={COLLECTION_PARAMS.text} value={query.text} />
          )}
          {query.sort === 'curadoria' ? null : (
            <input type="hidden" name={COLLECTION_PARAMS.sort} value={query.sort} />
          )}
        </>
      }
      footer={
        <>
          <a className="lx-button lx-button--secondary" href={clearHrefOf(query)}>
            {text.search.clear}
          </a>
          <button className="lx-button lx-button--primary" type="submit">
            {text.search.showResults}
          </button>
        </>
      }
    >
      {facets.lifestyles.length > 0 ? <LifestyleFields {...fields} /> : null}
      {facets.regions.length > 0 ? <RegionFields {...fields} /> : null}
      {facets.styles.length > 0 ? <StyleFields {...fields} /> : null}
      {facets.guests.length > 0 ? <GuestsFields {...fields} /> : null}
      {facets.values.length > 0 ? (
        <DialogGroup id={`${DIALOG_ID}-valor`} title={text.facets.value}>
          <ValueFields {...fields} />
        </DialogGroup>
      ) : null}
      {hasMoreFilters(facets) ? (
        <DialogGroup id={`${DIALOG_ID}-mais`} title={text.search.more}>
          <MoreFields {...fields} />
        </DialogGroup>
      ) : null}
    </FiltersDialog>
  );
}

const hasFacets = (facets: CollectionFacets) =>
  facets.lifestyles.length > 0 ||
  facets.regions.length > 0 ||
  facets.styles.length > 0 ||
  facets.guests.length > 0 ||
  facets.values.length > 0 ||
  hasMoreFilters(facets);

function Hero({ bar }: { readonly bar: ReactNode }) {
  const h = text.hero;
  return (
    <section className="lx-section" data-surface="blue" aria-labelledby="colecao">
      <div className="lx-container lx-stack">
        <div className="lx-pause lx-pause--start">
          <p className="lx-eyebrow">{h.eyebrow}</p>
          <h1 id="colecao" className="lx-headline">
            {h.title}
          </h1>
          <p className="lx-subheadline">{h.text}</p>
        </div>
        {bar}
        <p className="lx-discovery-hint">
          <span>{h.explanation}</span>
          <ActionLink href={`#${JOURNEY_ANCHOR}`} label={h.howItWorks} icon="arrow-down" />
        </p>
      </div>
    </section>
  );
}

function Journey() {
  const j = text.journey;
  return (
    <section
      className="lx-section"
      id={JOURNEY_ANCHOR}
      data-surface="sand"
      aria-labelledby={`${JOURNEY_ANCHOR}-titulo`}
    >
      <div className="lx-container lx-stack">
        <div className="lx-section-head">
          <p className="lx-eyebrow">{j.eyebrow}</p>
          <h2 className="lx-headline" id={`${JOURNEY_ANCHOR}-titulo`}>
            {j.title}
          </h2>
        </div>
        <ol className="lx-steps">
          {j.steps.map((step, index) => (
            <li className="lx-steps__item" key={step.title}>
              <span className="lx-ordinal" aria-hidden="true">
                {ordinal(index)}
              </span>
              <h3 className="lx-display-s">{step.title}</h3>
              <p className="lx-body">{step.text}</p>
            </li>
          ))}
        </ol>
        <p>
          <ActionLink href={discoveryPaths.howItWorks} label={j.more} />
        </p>
      </div>
    </section>
  );
}

function Closing({ refine }: { readonly refine: boolean }) {
  const c = text.closing;
  return (
    <section className="lx-section" data-surface="blue" aria-labelledby="fecho">
      <div className="lx-container lx-section-closing lx-pause">
        <h2 className="lx-headline" id="fecho">
          {c.title}
        </h2>
        <div className="lx-actions-stack">
          {refine ? (
            <ActionLink href={`#${FORM_ID}`} label={c.refine} primary icon="arrow-up" />
          ) : null}
          <ActionLink
            href={discoveryPaths.howItWorks}
            label={c.howItWorks}
            outline={refine}
            primary={!refine}
          />
        </div>
      </div>
    </section>
  );
}

/** Estado honesto sem resultados para mostrar: catálogo vazio ou leitura indisponível (nunca "não há catálogo"). */
function StatusBlock({ message }: { readonly message: string }) {
  return (
    <section
      className="lx-section lx-results"
      id={RESULTS_ANCHOR}
      data-surface="white"
      aria-label={message}
    >
      <div className="lx-container">
        <div className="lx-empty">
          <p className="lx-lead">{message}</p>
          <ActionLink href={`#${JOURNEY_ANCHOR}`} label={text.hero.howItWorks} icon="arrow-down" />
        </div>
      </div>
    </section>
  );
}

export async function CollectionPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const query = parseCollectionQuery(searchParams);
  const target = canonicalRedirect(searchParams, query);
  if (target !== null) redirect(target);
  const result = await readPublicCatalog((tx) => reader.entries(tx));
  if (result.status === 'unavailable' || result.value.length === 0) {
    const message = result.status === 'unavailable' ? text.unavailable : text.empty;
    return (
      <DiscoverySite current="collection">
        <Hero bar={null} />
        <StatusBlock message={message} />
        <Journey />
        <Closing refine={false} />
      </DiscoverySite>
    );
  }
  const entries = result.value;
  const facets = collectionFacets(entries);
  const discovery = discoverCollection(entries, query);
  const filterCount = activeFilters(query).filter((filter) => filter.kind !== 'text').length;
  const withFacets = hasFacets(facets);
  return (
    <DiscoverySite current="collection">
      <Hero
        bar={
          <DiscoveryForm
            id={FORM_ID}
            variant="hero"
            query={query}
            facets={facets}
            mobile={
              withFacets ? (
                <FiltersTrigger dialogId={DIALOG_ID} label={text.search.filters(filterCount)} />
              ) : null
            }
          />
        }
      />
      {withFacets ? <MobileFilters query={query} facets={facets} /> : null}
      <StickyDiscovery watchId={FORM_ID}>
        <DiscoveryForm
          id={`${FORM_ID}-compacta`}
          variant="compact"
          query={query}
          facets={facets}
          filterCount={filterCount}
        />
      </StickyDiscovery>
      <section
        className="lx-section lx-results"
        id={RESULTS_ANCHOR}
        data-surface="white"
        aria-labelledby={`${RESULTS_ANCHOR}-titulo`}
      >
        <div className="lx-container lx-stack">
          <ResultsHead
            query={query}
            facets={facets}
            filtered={discovery.filtered}
            total={discovery.total}
          />
          {discovery.total === 0 ? (
            <div className="lx-empty">
              <p className="lx-lead">{text.results.noResults}</p>
              <p className="lx-body">{text.results.noResultsText}</p>
              <a className="lx-button lx-button--secondary" href={clearHrefOf(query)}>
                {text.results.clear}
              </a>
            </div>
          ) : (
            <Groups groups={discovery.groups} featuredId={discovery.featuredId} />
          )}
        </div>
      </section>
      <Journey />
      <Closing refine />
    </DiscoverySite>
  );
}
