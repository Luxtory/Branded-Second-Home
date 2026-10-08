import type { EditionModality } from '../domain/catalog';
import { supportsFeatured, type ReferenceValueBasis } from '../domain/collection';
import { isFiltered, type CollectionQuery, type OfferedModality } from './collection-query';
import type {
  PublicCollectionEdition,
  PublicCollectionEntry,
  PublicTerm,
} from './collection-views';

/**
 * Descoberta da Coleção (spec catalog §13.12): busca, filtros, grupos e ordenação sobre a leitura pública, no servidor e
 * sem estado — funções puras. O catálogo é curado (dezenas de Concepts); se crescer, a mesma interface passa a SQL.
 */
type Entry = PublicCollectionEntry;

const COMBINING_MARKS = /\p{M}/gu;

/** Comparação sem acento e sem diferenciar maiúsculas ("São Paulo" = "sao paulo"). */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

const sameRegion = (a: string, b: string) => normalizeText(a) === normalizeText(b);

const OFFERS: Readonly<Record<OfferedModality, readonly EditionModality[]>> = {
  owner: ['owner', 'owner_and_co_owner'],
  co_owner: ['co_owner', 'owner_and_co_owner'],
};

/** Busca livre: cada palavra aparece no Concept, num lifestyle, num estilo, numa região ou na Brand Partner. */
function matchesText(entry: Entry, text: string): boolean {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    [
      entry.title,
      entry.brandName,
      ...entry.lifestyles.map((term) => term.label),
      ...entry.styles.map((term) => term.label),
      ...entry.editions.map((edition) => edition.region),
    ].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

const hasAnyTerm = (terms: readonly PublicTerm[], slugs: readonly string[]) =>
  slugs.length === 0 || terms.some((term) => slugs.includes(term.slug));

const atLeast = (value: number | null, minimum: number | null) =>
  minimum === null || (value !== null && value >= minimum);

function withinArea(entry: Entry, query: CollectionQuery): boolean {
  if (query.areaMin === null && query.areaMax === null) return true;
  const area = entry.builtAreaM2;
  return (
    area !== null &&
    (query.areaMin === null || area >= query.areaMin) &&
    (query.areaMax === null || area <= query.areaMax)
  );
}

/** Filtros do próprio Concept (versão vigente, marca), independentes das Editions. */
function conceptMatches(entry: Entry, query: CollectionQuery): boolean {
  return (
    matchesText(entry, query.text) &&
    hasAnyTerm(entry.lifestyles, query.lifestyles) &&
    hasAnyTerm(entry.styles, query.styles) &&
    atLeast(entry.guestsMax, query.guests) &&
    atLeast(entry.suites, query.suites) &&
    withinArea(entry, query) &&
    (query.brand === null || entry.brandPartnerId === query.brand)
  );
}

/** Filtros que só uma Edition atende: modalidade disponível e faixa de valor vigente na base escolhida. */
function editionMatches(edition: PublicCollectionEdition, query: CollectionQuery): boolean {
  if (query.modality !== null && !OFFERS[query.modality].includes(edition.modality)) return false;
  const range = query.value;
  if (range === null) return true;
  const value = edition.values.find((candidate) => candidate.basis === range.basis);
  return (
    value !== undefined &&
    (range.min === null || value.amountMinor >= range.min) &&
    (range.max === null || value.amountMinor <= range.max)
  );
}

/**
 * No card, as Editions que atendem à busca (região, modalidade, faixa de valor) vêm primeiro — no grupo "Com Home
 * Edition em [região]" a da região abre o card; entre si, a ordem não muda.
 */
function matchingEditionsFirst(entry: Entry, query: CollectionQuery): Entry {
  const region = query.region;
  const matches = (edition: PublicCollectionEdition) =>
    (region === null || sameRegion(edition.region, region)) && editionMatches(edition, query);
  const editions = [
    ...entry.editions.filter(matches),
    ...entry.editions.filter((edition) => !matches(edition)),
  ];
  return editions.every((edition, index) => edition === entry.editions[index])
    ? entry
    : { ...entry, editions };
}

/** Faixa de valor e modalidade só consideram Concepts com Home Edition (REQ-020: sem Edition, sem oferta nem valor). */
const needsEdition = (query: CollectionQuery) =>
  query.withEdition || query.modality !== null || query.value !== null;

function curatedOrder(a: Entry, b: Entry): number {
  if (a.rank !== b.rank) {
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  }
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

const recentOrder = (a: Entry, b: Entry) =>
  b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);

export type CollectionGroups =
  | {
      readonly kind: 'catalog';
      readonly withEdition: readonly Entry[];
      readonly withoutEdition: readonly Entry[];
    }
  | {
      readonly kind: 'region';
      readonly region: string;
      /** "Com Home Edition em [região]". */
      readonly inRegion: readonly Entry[];
      /** "Outros Home Concepts que combinam com suas escolhas" — ainda sem Edition na região. */
      readonly others: readonly Entry[];
    };

export interface CollectionResult {
  readonly filtered: boolean;
  /** Destaque editorial: só sem filtro, na ordem de curadoria e com capa aprovada; abre o seu grupo. */
  readonly featuredId: string | null;
  readonly groups: CollectionGroups;
  readonly total: number;
}

/** O destaque vai para o início do seu grupo; o resto mantém a ordem. */
const leading = (entries: readonly Entry[], id: string | null) =>
  id === null
    ? entries
    : [
        ...entries.filter((entry) => entry.id === id),
        ...entries.filter((entry) => entry.id !== id),
      ];

export function discoverCollection(
  entries: readonly Entry[],
  query: CollectionQuery,
): CollectionResult {
  const filtered = isFiltered(query);
  const ordered = [...entries].sort(query.sort === 'recentes' ? recentOrder : curatedOrder);
  const featured =
    !filtered && query.sort === 'curadoria'
      ? (ordered.find(
          (entry) => entry.featured && entry.cover !== null && supportsFeatured(entry.cover.widths),
        ) ?? null)
      : null;
  const featuredId = featured?.id ?? null;
  const eligible = ordered
    .filter(
      (entry) =>
        conceptMatches(entry, query) &&
        (!needsEdition(query) || entry.editions.some((edition) => editionMatches(edition, query))),
    )
    .map((entry) => matchingEditionsFirst(entry, query));
  const region = query.region;
  if (region === null) {
    const withEdition = eligible.filter((entry) => entry.editions.length > 0);
    const withoutEdition = eligible.filter((entry) => entry.editions.length === 0);
    return {
      filtered,
      featuredId,
      groups: {
        kind: 'catalog',
        withEdition: leading(withEdition, featuredId),
        withoutEdition: leading(withoutEdition, featuredId),
      },
      total: eligible.length,
    };
  }
  const inRegion = eligible.filter((entry) =>
    entry.editions.some(
      (edition) => sameRegion(edition.region, region) && editionMatches(edition, query),
    ),
  );
  const others = eligible.filter(
    (entry) => !entry.editions.some((edition) => sameRegion(edition.region, region)),
  );
  return {
    filtered,
    featuredId,
    groups: { kind: 'region', region, inRegion, others },
    total: inRegion.length + others.length,
  };
}

export interface ValueFacet {
  readonly basis: ReferenceValueBasis;
  /** Menor e maior valor vigente publicados na base — sugestões de De/Até. */
  readonly min: bigint;
  readonly max: bigint;
}

export interface CollectionFacets {
  readonly lifestyles: readonly PublicTerm[];
  readonly styles: readonly PublicTerm[];
  readonly regions: readonly string[];
  /** "Para pelo menos N pessoas", com os valores reais. */
  readonly guests: readonly number[];
  readonly values: readonly ValueFacet[];
  readonly suites: readonly number[];
  readonly area: { readonly min: number; readonly max: number } | null;
  readonly modalities: readonly OfferedModality[];
  readonly brands: readonly { readonly id: string; readonly name: string }[];
  /** "Só com Home Edition": só quando há Concepts com e sem Edition. */
  readonly withEdition: boolean;
}

/** Um filtro só aparece com 2+ valores reais (spec §13.12): com menos, não há escolha. */
const MIN_OPTIONS = 2;
const offered = <T>(options: readonly T[]): readonly T[] =>
  options.length >= MIN_OPTIONS ? options : [];

const byLabel = (a: PublicTerm, b: PublicTerm) => a.label.localeCompare(b.label, 'pt-BR');

function distinctTerms(terms: readonly PublicTerm[]): PublicTerm[] {
  return [...new Map(terms.map((term) => [term.slug, term])).values()].sort(byLabel);
}

const distinctNumbers = (values: readonly (number | null)[]) =>
  [...new Set(values.filter((value): value is number => value !== null))].sort((a, b) => a - b);

function distinctRegions(entries: readonly Entry[]): string[] {
  const regions = new Map<string, string>();
  for (const edition of entries.flatMap((entry) => entry.editions)) {
    const key = normalizeText(edition.region);
    if (!regions.has(key)) regions.set(key, edition.region);
  }
  return [...regions.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function valueFacets(entries: readonly Entry[]): ValueFacet[] {
  const facets: ValueFacet[] = [];
  for (const basis of ['owner', 'acao'] as const) {
    const amounts = entries
      .flatMap((entry) => entry.editions)
      .flatMap((edition) => edition.values)
      .filter((value) => value.basis === basis)
      .map((value) => value.amountMinor);
    if (amounts.length === 0) continue;
    const min = amounts.reduce((low, amount) => (amount < low ? amount : low));
    const max = amounts.reduce((high, amount) => (amount > high ? amount : high));
    facets.push({ basis, min, max });
  }
  return facets;
}

function modalitiesOffered(entries: readonly Entry[]): OfferedModality[] {
  const modalities = entries.flatMap((entry) => entry.editions.map((edition) => edition.modality));
  return (['owner', 'co_owner'] as const).filter((option) =>
    modalities.some((modality) => OFFERS[option].includes(modality)),
  );
}

/** Opções reais de cada filtro, tiradas do catálogo publicado (nenhuma opção sem resultado). */
export function collectionFacets(entries: readonly Entry[]): CollectionFacets {
  const areas = distinctNumbers(entries.map((entry) => entry.builtAreaM2));
  const values = valueFacets(entries);
  const brands = new Map(entries.map((entry) => [entry.brandPartnerId, entry.brandName]));
  const withEditions = entries.filter((entry) => entry.editions.length > 0).length;
  return {
    lifestyles: offered(distinctTerms(entries.flatMap((entry) => entry.lifestyles))),
    styles: offered(distinctTerms(entries.flatMap((entry) => entry.styles))),
    regions: offered(distinctRegions(entries)),
    guests: offered(distinctNumbers(entries.map((entry) => entry.guestsMax))),
    // A faixa de valor exige 2+ valores vigentes publicados, em qualquer base.
    values: values.length > 1 || values.some((facet) => facet.min !== facet.max) ? values : [],
    suites: offered(distinctNumbers(entries.map((entry) => entry.suites))),
    area: areas.length >= MIN_OPTIONS ? { min: areas[0] ?? 0, max: areas.at(-1) ?? 0 } : null,
    modalities: offered(modalitiesOffered(entries)),
    brands: offered(
      [...brands]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    ),
    withEdition: withEditions > 0 && withEditions < entries.length,
  };
}
