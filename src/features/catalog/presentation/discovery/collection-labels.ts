import type { CollectionFacets } from '../../application/collection-discovery';
import {
  activeFilters,
  collectionSearchParams,
  withoutFilter,
  type ActiveFilter,
  type CollectionQuery,
} from '../../application/collection-query';
import type {
  PublicCollectionEntry,
  PublicCollectionHomeEdition,
  PublicCover,
} from '../../application/collection-views';
import type { MediaOwner } from '../../domain/collection';
import { discoveryMessages } from '../i18n/discovery-pt-br';
import { formatMoney } from '../money';
import { discoveryPaths } from './paths';

/**
 * Rótulos e endereços da Coleção (spec catalog §13.12, §17.8), derivados da busca e da leitura pública — sem decidir nada: o
 * que aparece já foi filtrado no servidor. Dado ausente some (nunca "—" nem "sob consulta").
 */
const text = discoveryMessages.collection;
const CURRENCY = 'BRL';
/** Âncora dos resultados: os formulários GET levam o visitante direto a eles. */
export const RESULTS_ANCHOR = 'resultados';
export const JOURNEY_ANCHOR = 'como';
export const DISCOVERY_ANCHOR = 'busca';

/** URL estável de uma busca (chips, ordenação, "Limpar filtros"). */
export function collectionHref(
  query: CollectionQuery,
  anchor: string | null = RESULTS_ANCHOR,
): string {
  const search = collectionSearchParams(query).toString();
  const hash = anchor === null ? '' : `#${anchor}`;
  return `${discoveryPaths.collection}${search === '' ? '' : `?${search}`}${hash}`;
}

/** "Até 10 pessoas · 5 suítes · 500 m²" — capacidade, suítes e área projetada da Home Edition (BR-031). */
export function factsLine(
  homeEdition: Pick<PublicCollectionHomeEdition, 'guestsMax' | 'suites' | 'projectedAreaM2'>,
): string {
  const card = text.card;
  return [
    card.guests(homeEdition.guestsMax),
    card.suites(homeEdition.suites),
    card.area(homeEdition.projectedAreaM2),
  ].join(' · ');
}

/** Lifestyle e estilo principais ("Natureza · Contemporâneo"). */
export function cardEyebrow(entry: PublicCollectionEntry): string | null {
  const labels = [entry.lifestyles[0]?.label, entry.styles[0]?.label].filter(
    (label): label is string => label !== undefined,
  );
  return labels.length === 0 ? null : labels.join(' · ');
}

/** O quadro tipográfico sem capa mostra o lifestyle principal ou, sem lifestyle, o título (checkpoint A, item 7). */
export const fallbackWord = (entry: PublicCollectionEntry): string =>
  entry.lifestyles[0]?.label ?? entry.title;

/**
 * "Média projetada R$ 4.800.000" — só com média vigente; sem modalidade, base ou Ação, nunca valor por dia (BR-034,
 * REQ-100). A explicação obrigatória acompanha a página.
 */
export function projectedLine(
  homeEdition: Pick<PublicCollectionHomeEdition, 'projectedInvestment'>,
): string | null {
  const value = homeEdition.projectedInvestment;
  return value === null
    ? null
    : text.card.projectedInvestment(formatMoney(value.amountMinor, value.currency));
}

const MEDIA_ROUTES: Readonly<Record<MediaOwner, string>> = {
  homeConcept: '/media/home-concept-covers',
  homeEdition: '/media/home-edition-media',
};

/** `srcset` das larguras de exibição da mídia, servidas pelo próprio domínio (ADR-0015). */
export function coverSrcSet(
  cover: PublicCover,
  owner: MediaOwner = 'homeConcept',
): { readonly src: string; readonly srcSet: string } {
  const url = (width: number) => `${MEDIA_ROUTES[owner]}/${cover.mediaId}/${width}`;
  const widths = cover.widths.map((item) => item.width);
  const fallback = widths.find((width) => width >= 800) ?? widths[widths.length - 1] ?? 0;
  return {
    src: url(fallback),
    srcSet: widths.map((width) => `${url(width)} ${width}w`).join(', '),
  };
}

const reais = (minor: bigint | null) => (minor === null ? null : formatMoney(minor, CURRENCY));

/** Faixa da média projetada em uma linha: "R$ 6.000.000 a R$ 10.000.000", "até R$ 1.300.000" (sem modalidade). */
export function valueSummary(query: CollectionQuery): string | null {
  const range = query.value;
  if (range === null) return null;
  const [min, max] = [reais(range.min), reais(range.max)];
  const f = text.facets;
  if (min !== null && max !== null) return f.rangeBetween(min, max);
  if (min !== null) return f.rangeFrom(min);
  return max === null ? null : f.rangeUpTo(max);
}

const termLabels = (slugs: readonly string[], terms: CollectionFacets['lifestyles']) =>
  slugs.map((slug) => terms.find((term) => term.slug === slug)?.label ?? slug);

/** O valor atual de cada faceta do Discovery (o resumo no botão; a lista quebra linha, nunca é cortada). */
export function facetSummaries(query: CollectionQuery, facets: CollectionFacets) {
  const f = text.facets;
  const join = (labels: readonly string[], none: string) =>
    labels.length === 0 ? none : labels.join(', ');
  return {
    lifestyle: join(termLabels(query.lifestyles, facets.lifestyles), f.all),
    style: join(termLabels(query.styles, facets.styles), f.all),
    guests: query.guests === null ? f.anyGuests : f.atLeastGuests(query.guests),
    value: valueSummary(query) ?? f.anyValue,
  } as const;
}

/** Texto do chip de um filtro ativo. */
export function chipLabel(
  filter: ActiveFilter,
  query: CollectionQuery,
  facets: CollectionFacets,
): string {
  const f = text.facets;
  switch (filter.kind) {
    case 'text':
      return f.quoted(query.text);
    case 'lifestyle':
      return termLabels([filter.slug], facets.lifestyles)[0] ?? filter.slug;
    case 'style':
      return termLabels([filter.slug], facets.styles)[0] ?? filter.slug;
    case 'guests':
      return f.atLeastGuests(query.guests ?? 0);
    case 'value':
      return f.valueChip(valueSummary(query) ?? '');
    case 'suites':
      return f.suitesChip(query.suites ?? 0);
    case 'area':
      return f.areaChip(String(query.areaMin ?? '…'), String(query.areaMax ?? '…'));
    case 'withHomeEdition':
      return f.withHomeEdition;
    case 'brand':
      return facets.brands.find((brand) => brand.id === query.brand)?.name ?? f.brand;
  }
}

/** Chips dos filtros ativos, cada um com o endereço da busca sem ele. */
export function activeChips(query: CollectionQuery, facets: CollectionFacets) {
  return activeFilters(query).map((filter) => ({
    key:
      filter.kind === 'lifestyle' || filter.kind === 'style'
        ? `${filter.kind}-${filter.slug}`
        : filter.kind,
    label: chipLabel(filter, query, facets),
    href: collectionHref(withoutFilter(query, filter)),
  }));
}
