import { describe, expect, it } from 'vitest';
import {
  activeFilters,
  collectionSearchParams,
  EMPTY_COLLECTION_QUERY,
  isFiltered,
  parseCollectionQuery,
  withoutFilter,
} from '@/features/catalog/application/collection-query';

// Busca da Coleção pela URL (docs/specs/catalog.md §13.12, §17.8): leniente — valor inválido é ignorado, nunca erro.
// Sem localização nem modalidade: a Home Edition não tem nenhuma das duas (BR-031, BR-032).
const BRAND = '00000000-0000-4000-8000-0000000000b1';

describe('Coleção — parâmetros da busca', () => {
  it('sem parâmetros: nenhum filtro, ordem de curadoria', () => {
    const query = parseCollectionQuery({});
    expect(query).toMatchObject({
      text: '',
      lifestyles: [],
      value: null,
      withHomeEdition: false,
      sort: 'curadoria',
    });
    expect(isFiltered(query)).toBe(false);
    expect(isFiltered(parseCollectionQuery({ ordem: 'recentes' }))).toBe(false);
  });

  it('lê todos os filtros com os nomes estáveis da URL', () => {
    const query = parseCollectionQuery({
      q: '  casa   do  mar ',
      lifestyle: ['natureza', 'bem-estar', 'natureza'],
      estilo: 'contemporaneo',
      pessoas: '8',
      'valor-de': '1.500.000',
      'valor-ate': '3000000',
      suites: '4',
      'area-de': '300',
      'area-ate': '600',
      'com-home-edition': '1',
      marca: BRAND,
      ordem: 'recentes',
    });
    expect(query).toEqual({
      text: 'casa do mar',
      lifestyles: ['natureza', 'bem-estar'],
      styles: ['contemporaneo'],
      guests: 8,
      value: { min: 150_000_000n, max: 300_000_000n },
      suites: 4,
      areaMin: 300,
      areaMax: 600,
      withHomeEdition: true,
      brand: BRAND,
      sort: 'recentes',
    });
    expect(isFiltered(query)).toBe(true);
  });

  it('[TECH-033] valor em reais inteiros vira unidades menores sem ponto flutuante; De/Até invertidos são trocados', () => {
    expect(parseCollectionQuery({ 'valor-de': '9000000', 'valor-ate': '4800000' }).value).toEqual({
      min: 480_000_000n,
      max: 900_000_000n,
    });
    expect(parseCollectionQuery({ 'valor-ate': '4800000' }).value).toEqual({
      min: null,
      max: 480_000_000n,
    });
    expect(parseCollectionQuery({ 'valor-de': '4,8' }).value).toBeNull();
  });

  it('valor inválido é ignorado: parâmetros que não existem mais, números fora do formato, slug inválido, marca que não é uuid', () => {
    const query = parseCollectionQuery({
      regiao: 'Trancoso, BA',
      base: 'owner',
      modalidade: 'co-owner',
      'valor-de': 'cem',
      pessoas: '0',
      suites: 'muitas',
      lifestyle: ['<script>', 'Natureza'],
      marca: 'maison',
      ordem: 'preco',
      'com-home-edition': 'sim',
    });
    expect(query).toMatchObject({
      value: null,
      guests: null,
      suites: null,
      lifestyles: [],
      brand: null,
      sort: 'curadoria',
      withHomeEdition: false,
    });
  });

  it('limita o trabalho por requisição: texto até 100 caracteres, no máximo 10 valores por filtro múltiplo', () => {
    const query = parseCollectionQuery({
      q: 'a'.repeat(500),
      lifestyle: Array.from({ length: 30 }, (_, index) => `termo-${index}`),
    });
    expect(query.text).toHaveLength(100);
    expect(query.lifestyles).toHaveLength(10);
  });
});

describe('Coleção — URL estável da busca', () => {
  it('serializa de volta para a mesma busca (ida e volta) e omite o padrão', () => {
    const params = {
      q: 'casa do mar',
      lifestyle: ['natureza', 'bem-estar'],
      estilo: 'contemporaneo',
      pessoas: '8',
      'valor-de': '1500000',
      'valor-ate': '3000000',
      suites: '4',
      'area-de': '300',
      'area-ate': '600',
      'com-home-edition': '1',
      marca: BRAND,
      ordem: 'recentes',
    };
    const query = parseCollectionQuery(params);
    const search = collectionSearchParams(query);
    expect(parseCollectionQuery(Object.fromEntries(groupParams(search)))).toEqual(query);
    expect(collectionSearchParams(parseCollectionQuery({})).toString()).toBe('');
  });

  it('cada filtro ativo vira um chip removível sozinho; a ordenação se mantém', () => {
    const query = parseCollectionQuery({
      q: 'mar',
      lifestyle: ['natureza', 'mar'],
      'valor-ate': '3000000',
      ordem: 'recentes',
    });
    const filters = activeFilters(query);
    expect(filters.map((filter) => filter.kind)).toEqual([
      'text',
      'lifestyle',
      'lifestyle',
      'value',
    ]);
    const withoutMar = withoutFilter(query, { kind: 'lifestyle', slug: 'mar' });
    expect(withoutMar.lifestyles).toEqual(['natureza']);
    expect(withoutMar.sort).toBe('recentes');
    expect(withoutFilter(query, { kind: 'value' }).value).toBeNull();
    expect(isFiltered(EMPTY_COLLECTION_QUERY)).toBe(false);
  });
});

/** URLSearchParams → objeto com repetidos em lista, como o Next entrega. */
function groupParams(search: URLSearchParams): [string, string | string[]][] {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of search) grouped.set(key, [...(grouped.get(key) ?? []), value]);
  return [...grouped].map(([key, values]) => [
    key,
    values.length === 1 ? (values[0] ?? '') : values,
  ]);
}
