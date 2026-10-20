import { supportsFeatured } from '../domain/collection';
import { isFiltered, type CollectionQuery } from './collection-query';
import type {
  PublicCollectionEntry,
  PublicCollectionHomeEdition,
  PublicTerm,
} from './collection-views';

/**
 * Descoberta da Coleção (spec catalog §13.12, §17.8): busca, filtros, grupos e ordenação sobre a leitura pública, no
 * servidor e sem estado — funções puras. Pessoas, suítes, área e média projetada valem pelas Home Editions públicas do
 * Home Concept (são atributos da Home Edition, BR-031). O catálogo é curado (dezenas de Home Concepts); se crescer, a
 * mesma interface passa a SQL.
 */
type Entry = PublicCollectionEntry;
type HomeEdition = PublicCollectionHomeEdition;

const COMBINING_MARKS = /\p{M}/gu;

/** Comparação sem acento e sem diferenciar maiúsculas ("São Paulo" = "sao paulo"). */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

/** Busca livre: cada palavra aparece no Home Concept, num lifestyle, num estilo, numa Home Edition ou na Brand Partner. */
function matchesText(entry: Entry, text: string): boolean {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    [
      entry.title,
      entry.brandName,
      ...entry.lifestyles.map((term) => term.label),
      ...entry.styles.map((term) => term.label),
      ...entry.homeEditions.flatMap((homeEdition) => [homeEdition.name, homeEdition.typology]),
    ].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

const hasAnyTerm = (terms: readonly PublicTerm[], slugs: readonly string[]) =>
  slugs.length === 0 || terms.some((term) => slugs.includes(term.slug));

/** Filtros do próprio Home Concept (versão vigente, marca), independentes das Home Editions. */
function homeConceptMatches(entry: Entry, query: CollectionQuery): boolean {
  return (
    matchesText(entry, query.text) &&
    hasAnyTerm(entry.lifestyles, query.lifestyles) &&
    hasAnyTerm(entry.styles, query.styles) &&
    (query.brand === null || entry.brandPartnerId === query.brand)
  );
}

/** Filtros que só uma Home Edition atende: pessoas, suítes, área e faixa da média projetada vigente. */
function homeEditionMatches(homeEdition: HomeEdition, query: CollectionQuery): boolean {
  if (query.guests !== null && homeEdition.guestsMax < query.guests) return false;
  if (query.suites !== null && homeEdition.suites < query.suites) return false;
  if (query.areaMin !== null && homeEdition.projectedAreaM2 < query.areaMin) return false;
  if (query.areaMax !== null && homeEdition.projectedAreaM2 > query.areaMax) return false;
  const range = query.value;
  if (range === null) return true;
  const value = homeEdition.projectedInvestment?.amountMinor;
  return (
    value !== undefined &&
    (range.min === null || value >= range.min) &&
    (range.max === null || value <= range.max)
  );
}

/** Esses filtros só consideram Home Concepts com Home Edition publicada (são atributos dela). */
const needsHomeEdition = (query: CollectionQuery) =>
  query.withHomeEdition ||
  query.guests !== null ||
  query.suites !== null ||
  query.areaMin !== null ||
  query.areaMax !== null ||
  query.value !== null;

/** No card, as Home Editions que atendem à busca vêm primeiro; entre si, a ordem não muda. */
function matchingHomeEditionsFirst(entry: Entry, query: CollectionQuery): Entry {
  const matches = (homeEdition: HomeEdition) => homeEditionMatches(homeEdition, query);
  const homeEditions = [
    ...entry.homeEditions.filter(matches),
    ...entry.homeEditions.filter((homeEdition) => !matches(homeEdition)),
  ];
  return homeEditions.every((homeEdition, index) => homeEdition === entry.homeEditions[index])
    ? entry
    : { ...entry, homeEditions };
}

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

export interface CollectionGroups {
  /** "Com Home Edition" — Home Concepts com ao menos uma Home Edition publicada. */
  readonly withHomeEdition: readonly Entry[];
  /** "Ainda sem Home Edition". */
  readonly withoutHomeEdition: readonly Entry[];
}

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
        homeConceptMatches(entry, query) &&
        (!needsHomeEdition(query) ||
          entry.homeEditions.some((homeEdition) => homeEditionMatches(homeEdition, query))),
    )
    .map((entry) => matchingHomeEditionsFirst(entry, query));
  return {
    filtered,
    featuredId,
    groups: {
      withHomeEdition: leading(
        eligible.filter((entry) => entry.homeEditions.length > 0),
        featuredId,
      ),
      withoutHomeEdition: leading(
        eligible.filter((entry) => entry.homeEditions.length === 0),
        featuredId,
      ),
    },
    total: eligible.length,
  };
}

export interface ValueFacet {
  /** Menor e maior média projetada vigente publicadas — sugestões de De/Até. */
  readonly min: bigint;
  readonly max: bigint;
}

export interface CollectionFacets {
  readonly lifestyles: readonly PublicTerm[];
  readonly styles: readonly PublicTerm[];
  /** "Para pelo menos N pessoas", com os valores reais das Home Editions. */
  readonly guests: readonly number[];
  readonly value: ValueFacet | null;
  readonly suites: readonly number[];
  readonly area: { readonly min: number; readonly max: number } | null;
  readonly brands: readonly { readonly id: string; readonly name: string }[];
  /** "Só com Home Edition": só quando há Home Concepts com e sem Home Edition. */
  readonly withHomeEdition: boolean;
}

/** Um filtro só aparece com 2+ valores reais (spec §13.12): com menos, não há escolha. */
const MIN_OPTIONS = 2;
const offered = <T>(options: readonly T[]): readonly T[] =>
  options.length >= MIN_OPTIONS ? options : [];

const byLabel = (a: PublicTerm, b: PublicTerm) => a.label.localeCompare(b.label, 'pt-BR');

function distinctTerms(terms: readonly PublicTerm[]): PublicTerm[] {
  return [...new Map(terms.map((term) => [term.slug, term])).values()].sort(byLabel);
}

const distinctNumbers = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b);

function valueFacet(homeEditions: readonly HomeEdition[]): ValueFacet | null {
  const amounts = homeEditions.flatMap((homeEdition) =>
    homeEdition.projectedInvestment === null ? [] : [homeEdition.projectedInvestment.amountMinor],
  );
  if (amounts.length === 0) return null;
  const min = amounts.reduce((low, amount) => (amount < low ? amount : low));
  const max = amounts.reduce((high, amount) => (amount > high ? amount : high));
  // A faixa só é escolha com valores diferentes.
  return min === max ? null : { min, max };
}

/** Opções reais de cada filtro, tiradas do catálogo publicado (nenhuma opção sem resultado). */
export function collectionFacets(entries: readonly Entry[]): CollectionFacets {
  const homeEditions = entries.flatMap((entry) => entry.homeEditions);
  const areas = distinctNumbers(homeEditions.map((homeEdition) => homeEdition.projectedAreaM2));
  const brands = new Map(entries.map((entry) => [entry.brandPartnerId, entry.brandName]));
  const withHomeEditions = entries.filter((entry) => entry.homeEditions.length > 0).length;
  return {
    lifestyles: offered(distinctTerms(entries.flatMap((entry) => entry.lifestyles))),
    styles: offered(distinctTerms(entries.flatMap((entry) => entry.styles))),
    guests: offered(distinctNumbers(homeEditions.map((homeEdition) => homeEdition.guestsMax))),
    value: valueFacet(homeEditions),
    suites: offered(distinctNumbers(homeEditions.map((homeEdition) => homeEdition.suites))),
    area: areas.length >= MIN_OPTIONS ? { min: areas[0] ?? 0, max: areas.at(-1) ?? 0 } : null,
    brands: offered(
      [...brands]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    ),
    withHomeEdition: withHomeEditions > 0 && withHomeEditions < entries.length,
  };
}
