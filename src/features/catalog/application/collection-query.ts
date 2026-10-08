import { z } from 'zod';
import type { ReferenceValueBasis } from '../domain/collection';

/**
 * Busca da Coleção vinda da URL (formulário GET, spec catalog §13.12): leniente — valor inválido é ignorado, nunca erro
 * —, com limites que mantêm o trabalho por requisição pequeno. Nomes dos parâmetros em pt-BR, estáveis (URLs
 * compartilháveis).
 */
export const COLLECTION_PARAMS = {
  text: 'q',
  lifestyle: 'lifestyle',
  style: 'estilo',
  region: 'regiao',
  guests: 'pessoas',
  basis: 'base',
  valueMin: 'valor-de',
  valueMax: 'valor-ate',
  suites: 'suites',
  areaMin: 'area-de',
  areaMax: 'area-ate',
  modality: 'modalidade',
  withEdition: 'com-edition',
  brand: 'marca',
  sort: 'ordem',
} as const;

export const COLLECTION_SORTS = ['curadoria', 'recentes'] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

/** Modalidade disponível escolhida na busca: Owner ou Co-Owner (uma Edition "Owner e Co-Owner" atende às duas). */
export type OfferedModality = 'owner' | 'co_owner';

export interface ValueRange {
  /** Base escolhida primeiro (Owner = a Second Home inteira; Co-Owner = uma Ação). */
  readonly basis: ReferenceValueBasis;
  /** Em unidades menores; `null` = sem limite. */
  readonly min: bigint | null;
  readonly max: bigint | null;
}

export interface CollectionQuery {
  readonly text: string;
  readonly lifestyles: readonly string[];
  readonly styles: readonly string[];
  readonly region: string | null;
  readonly guests: number | null;
  readonly value: ValueRange | null;
  readonly suites: number | null;
  readonly areaMin: number | null;
  readonly areaMax: number | null;
  readonly modality: OfferedModality | null;
  readonly withEdition: boolean;
  readonly brand: string | null;
  readonly sort: CollectionSort;
}

export type SearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const TEXT_MAX = 100;
const REGION_MAX = 200;
const MULTI_MAX = 10;
const SMALL_COUNT_MAX = 1000;
const AREA_MAX = 100_000;
/** Reais inteiros na URL (até 13 dígitos = R$ 9,9 trilhões, abaixo do maior valor aceito). */
const REAIS_DIGITS = /^\d{1,13}$/;
const MINOR_PER_UNIT = 100n;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_BASIS: Readonly<Record<string, ReferenceValueBasis>> = {
  owner: 'owner',
  'co-owner': 'acao',
};
const URL_MODALITY: Readonly<Record<string, OfferedModality>> = {
  owner: 'owner',
  'co-owner': 'co_owner',
};

const brandId = z.uuid();

function all(params: SearchParams, name: string): readonly string[] {
  const value = params[name];
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : value;
}

const first = (params: SearchParams, name: string): string | null => all(params, name)[0] ?? null;

function trimmed(params: SearchParams, name: string, max: number): string | null {
  const value = first(params, name)?.trim().replace(/\s+/g, ' ') ?? '';
  return value === '' ? null : value.slice(0, max);
}

function slugs(params: SearchParams, name: string): readonly string[] {
  const valid = all(params, name).filter((value) => SLUG.test(value));
  return [...new Set(valid)].slice(0, MULTI_MAX);
}

function positive(params: SearchParams, name: string, max: number): number | null {
  const raw = first(params, name);
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : null;
}

/** Reais inteiros ("4800000", "4.800.000") → unidades menores, sem ponto flutuante (TECH-033). */
function reaisToMinor(params: SearchParams, name: string): bigint | null {
  const raw = first(params, name)?.replace(/[.\s]/g, '') ?? '';
  return REAIS_DIGITS.test(raw) ? BigInt(raw) * MINOR_PER_UNIT : null;
}

function valueRange(params: SearchParams): ValueRange | null {
  const basis = URL_BASIS[first(params, COLLECTION_PARAMS.basis) ?? ''];
  if (basis === undefined) return null;
  const min = reaisToMinor(params, COLLECTION_PARAMS.valueMin);
  const max = reaisToMinor(params, COLLECTION_PARAMS.valueMax);
  // De/Até invertidos: a intenção é a faixa entre os dois.
  return min !== null && max !== null && min > max
    ? { basis, min: max, max: min }
    : { basis, min, max };
}

export function parseCollectionQuery(params: SearchParams): CollectionQuery {
  const brand = brandId.safeParse(first(params, COLLECTION_PARAMS.brand));
  const sort = first(params, COLLECTION_PARAMS.sort);
  return {
    text: trimmed(params, COLLECTION_PARAMS.text, TEXT_MAX) ?? '',
    lifestyles: slugs(params, COLLECTION_PARAMS.lifestyle),
    styles: slugs(params, COLLECTION_PARAMS.style),
    region: trimmed(params, COLLECTION_PARAMS.region, REGION_MAX),
    guests: positive(params, COLLECTION_PARAMS.guests, SMALL_COUNT_MAX),
    value: valueRange(params),
    suites: positive(params, COLLECTION_PARAMS.suites, SMALL_COUNT_MAX),
    areaMin: positive(params, COLLECTION_PARAMS.areaMin, AREA_MAX),
    areaMax: positive(params, COLLECTION_PARAMS.areaMax, AREA_MAX),
    modality: URL_MODALITY[first(params, COLLECTION_PARAMS.modality) ?? ''] ?? null,
    withEdition: first(params, COLLECTION_PARAMS.withEdition) === '1',
    brand: brand.success ? brand.data : null,
    sort: COLLECTION_SORTS.find((candidate) => candidate === sort) ?? 'curadoria',
  };
}

/** Algum filtro ou busca ativo (a ordenação não conta): muda o título da seção e desliga o destaque. */
export function isFiltered(query: CollectionQuery): boolean {
  return (
    query.text !== '' ||
    query.lifestyles.length > 0 ||
    query.styles.length > 0 ||
    query.region !== null ||
    query.guests !== null ||
    query.value !== null ||
    query.suites !== null ||
    query.areaMin !== null ||
    query.areaMax !== null ||
    query.modality !== null ||
    query.withEdition ||
    query.brand !== null
  );
}

/** Busca vazia: a Coleção sem filtro, na ordem de curadoria. */
export const EMPTY_COLLECTION_QUERY: CollectionQuery = parseCollectionQuery({});

const URL_OF_BASIS: Readonly<Record<ReferenceValueBasis, string>> = {
  owner: 'owner',
  acao: 'co-owner',
};
const URL_OF_MODALITY: Readonly<Record<OfferedModality, string>> = {
  owner: 'owner',
  co_owner: 'co-owner',
};

/** Reais inteiros da URL a partir de unidades menores (os centavos não existem no filtro). */
const reais = (minor: bigint) => (minor / MINOR_PER_UNIT).toString();

/** O inverso de `parseCollectionQuery`: a URL estável de uma busca (links de chips, ordenação e "Limpar filtros"). */
export function collectionSearchParams(query: CollectionQuery): URLSearchParams {
  const params = new URLSearchParams();
  const P = COLLECTION_PARAMS;
  if (query.text !== '') params.set(P.text, query.text);
  for (const slug of query.lifestyles) params.append(P.lifestyle, slug);
  for (const slug of query.styles) params.append(P.style, slug);
  if (query.region !== null) params.set(P.region, query.region);
  if (query.guests !== null) params.set(P.guests, String(query.guests));
  if (query.value !== null) {
    params.set(P.basis, URL_OF_BASIS[query.value.basis]);
    if (query.value.min !== null) params.set(P.valueMin, reais(query.value.min));
    if (query.value.max !== null) params.set(P.valueMax, reais(query.value.max));
  }
  if (query.suites !== null) params.set(P.suites, String(query.suites));
  if (query.areaMin !== null) params.set(P.areaMin, String(query.areaMin));
  if (query.areaMax !== null) params.set(P.areaMax, String(query.areaMax));
  if (query.modality !== null) params.set(P.modality, URL_OF_MODALITY[query.modality]);
  if (query.withEdition) params.set(P.withEdition, '1');
  if (query.brand !== null) params.set(P.brand, query.brand);
  if (query.sort !== 'curadoria') params.set(P.sort, query.sort);
  return params;
}

/** Um filtro ativo, removível sozinho (chip). Termos múltiplos viram um chip por termo. */
export type ActiveFilter =
  | { readonly kind: 'text' }
  | { readonly kind: 'lifestyle'; readonly slug: string }
  | { readonly kind: 'style'; readonly slug: string }
  | { readonly kind: 'region' }
  | { readonly kind: 'guests' }
  | { readonly kind: 'value' }
  | { readonly kind: 'suites' }
  | { readonly kind: 'area' }
  | { readonly kind: 'modality' }
  | { readonly kind: 'withEdition' }
  | { readonly kind: 'brand' };

export function activeFilters(query: CollectionQuery): ActiveFilter[] {
  return [
    ...(query.text === '' ? [] : [{ kind: 'text' } as const]),
    ...query.lifestyles.map((slug) => ({ kind: 'lifestyle', slug }) as const),
    ...query.styles.map((slug) => ({ kind: 'style', slug }) as const),
    ...(query.region === null ? [] : [{ kind: 'region' } as const]),
    ...(query.guests === null ? [] : [{ kind: 'guests' } as const]),
    ...(query.value === null ? [] : [{ kind: 'value' } as const]),
    ...(query.suites === null ? [] : [{ kind: 'suites' } as const]),
    ...(query.areaMin === null && query.areaMax === null ? [] : [{ kind: 'area' } as const]),
    ...(query.modality === null ? [] : [{ kind: 'modality' } as const]),
    ...(query.withEdition ? [{ kind: 'withEdition' } as const] : []),
    ...(query.brand === null ? [] : [{ kind: 'brand' } as const]),
  ];
}

/** A mesma busca sem um filtro (a ordenação se mantém). */
export function withoutFilter(query: CollectionQuery, filter: ActiveFilter): CollectionQuery {
  switch (filter.kind) {
    case 'text':
      return { ...query, text: '' };
    case 'lifestyle':
      return { ...query, lifestyles: query.lifestyles.filter((slug) => slug !== filter.slug) };
    case 'style':
      return { ...query, styles: query.styles.filter((slug) => slug !== filter.slug) };
    case 'region':
      return { ...query, region: null };
    case 'guests':
      return { ...query, guests: null };
    case 'value':
      return { ...query, value: null };
    case 'suites':
      return { ...query, suites: null };
    case 'area':
      return { ...query, areaMin: null, areaMax: null };
    case 'modality':
      return { ...query, modality: null };
    case 'withEdition':
      return { ...query, withEdition: false };
    case 'brand':
      return { ...query, brand: null };
  }
}
