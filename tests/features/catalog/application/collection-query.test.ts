import { describe, expect, it } from 'vitest';
import {
  activeFilters,
  collectionSearchParams,
  EMPTY_COLLECTION_QUERY,
  isFiltered,
  parseCollectionQuery,
  withoutFilter,
} from '@/features/catalog/application/collection-query';

// Busca da Coleção pela URL (docs/specs/catalog.md §13.12): leniente — valor inválido é ignorado, nunca erro.
const BRAND = '00000000-0000-4000-8000-0000000000b1';

describe('Coleção — parâmetros da busca', () => {
  it('sem parâmetros: nenhum filtro, ordem de curadoria', () => {
    const query = parseCollectionQuery({});
    expect(query).toMatchObject({
      text: '',
      lifestyles: [],
      region: null,
      value: null,
      withEdition: false,
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
      regiao: 'Trancoso, BA',
      pessoas: '8',
      base: 'co-owner',
      'valor-de': '1.500.000',
      'valor-ate': '3000000',
      suites: '4',
      'area-de': '300',
      'area-ate': '600',
      modalidade: 'owner',
      'com-edition': '1',
      marca: BRAND,
      ordem: 'recentes',
    });
    expect(query).toEqual({
      text: 'casa do mar',
      lifestyles: ['natureza', 'bem-estar'],
      styles: ['contemporaneo'],
      region: 'Trancoso, BA',
      guests: 8,
      value: { basis: 'acao', min: 150_000_000n, max: 300_000_000n },
      suites: 4,
      areaMin: 300,
      areaMax: 600,
      modality: 'owner',
      withEdition: true,
      brand: BRAND,
      sort: 'recentes',
    });
    expect(isFiltered(query)).toBe(true);
  });

  it('[TECH-033] valor em reais inteiros vira unidades menores sem ponto flutuante; De/Até invertidos são trocados', () => {
    expect(
      parseCollectionQuery({ base: 'owner', 'valor-de': '9000000', 'valor-ate': '4800000' }).value,
    ).toEqual({ basis: 'owner', min: 480_000_000n, max: 900_000_000n });
    expect(parseCollectionQuery({ base: 'owner', 'valor-de': '4,8' }).value).toEqual({
      basis: 'owner',
      min: null,
      max: null,
    });
  });

  it('valor inválido é ignorado: base desconhecida, números fora do intervalo, slug inválido, marca que não é uuid', () => {
    const query = parseCollectionQuery({
      base: 'mensal',
      'valor-de': '100',
      pessoas: '0',
      suites: 'muitas',
      lifestyle: ['<script>', 'Natureza'],
      marca: 'maison',
      ordem: 'preco',
      'com-edition': 'sim',
    });
    expect(query).toMatchObject({
      value: null,
      guests: null,
      suites: null,
      lifestyles: [],
      brand: null,
      sort: 'curadoria',
      withEdition: false,
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
      regiao: 'Trancoso, BA',
      pessoas: '8',
      base: 'co-owner',
      'valor-de': '1500000',
      'valor-ate': '3000000',
      suites: '4',
      'area-de': '300',
      'area-ate': '600',
      modalidade: 'owner',
      'com-edition': '1',
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
      regiao: 'Trancoso, BA',
      base: 'owner',
      ordem: 'recentes',
    });
    const filters = activeFilters(query);
    expect(filters.map((filter) => filter.kind)).toEqual([
      'text',
      'lifestyle',
      'lifestyle',
      'region',
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
