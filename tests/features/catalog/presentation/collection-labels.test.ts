import { describe, expect, it } from 'vitest';
import { collectionFacets } from '@/features/catalog/application/collection-discovery';
import { parseCollectionQuery } from '@/features/catalog/application/collection-query';
import type { PublicCollectionEntry } from '@/features/catalog/application/collection-views';
import {
  activeChips,
  cardEyebrow,
  collectionHref,
  coverSrcSet,
  editionLines,
  facetSummaries,
  factsLine,
  fallbackWord,
  valueSummary,
} from '@/features/catalog/presentation/discovery/collection-labels';

// Rótulos da Coleção (docs/specs/catalog.md §13.12): derivados, nunca decidem o que aparece.
const normalize = (value: string) => value.replace(/\s/g, ' ');

const entry: PublicCollectionEntry = {
  id: 'c1',
  title: 'Casa do Mar',
  brandPartnerId: 'b1',
  brandName: 'Maison Atlântica',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  summary: null,
  guestsMax: 10,
  suites: 5,
  builtAreaM2: 1200,
  lifestyles: [
    { slug: 'natureza', label: 'Natureza' },
    { slug: 'mar', label: 'Mar' },
  ],
  styles: [{ slug: 'contemporaneo', label: 'Contemporâneo' }],
  cover: {
    mediaId: 'm1',
    alt: 'Casa',
    credit: null,
    cropX: 50,
    cropY: 35,
    widths: [
      { width: 480, height: 360 },
      { width: 800, height: 600 },
      { width: 1200, height: 900 },
    ],
  },
  rank: null,
  featured: false,
  editions: [
    {
      id: 'e1',
      region: 'Trancoso, BA',
      modality: 'owner_and_co_owner',
      values: [{ basis: 'acao', amountMinor: 62_000_000n, currency: 'BRL' }],
    },
    { id: 'e2', region: 'Serra', modality: 'owner', values: [] },
  ],
};

describe('Coleção — rótulos', () => {
  it('[REQ-100] [REQ-103] Edition: uma linha por base da modalidade; com valor "a partir de", sem valor só a base; nunca por dia', () => {
    expect(editionLines(entry.editions[0]!).map(normalize)).toEqual([
      'Owner',
      'Co-Owner · Ação a partir de R$ 620.000',
    ]);
    expect(editionLines(entry.editions[1]!)).toEqual(['Owner']);
    expect(editionLines(entry.editions[0]!).join(' ')).not.toMatch(/di[aá]ria|por dia|cota/i);
  });

  it('fatos, eyebrow e quadro sem capa: só o que existe; o lifestyle principal ou o título', () => {
    expect(factsLine(entry)).toBe('Até 10 pessoas · 5 suítes · 1.200 m²');
    expect(factsLine({ ...entry, guestsMax: null, suites: 1, builtAreaM2: null })).toBe('1 suíte');
    expect(factsLine({ ...entry, guestsMax: null, suites: null, builtAreaM2: null })).toBeNull();
    expect(cardEyebrow(entry)).toBe('Natureza · Contemporâneo');
    expect(cardEyebrow({ ...entry, lifestyles: [], styles: [] })).toBeNull();
    expect(fallbackWord(entry)).toBe('Natureza');
    expect(fallbackWord({ ...entry, lifestyles: [] })).toBe('Casa do Mar');
  });

  it('[ADR-0015] srcset das larguras servidas pelo próprio domínio, com fallback de 800 px', () => {
    expect(coverSrcSet(entry.cover!)).toEqual({
      src: '/media/concept-covers/m1/800',
      srcSet:
        '/media/concept-covers/m1/480 480w, /media/concept-covers/m1/800 800w, /media/concept-covers/m1/1200 1200w',
    });
  });

  it('resumos das facetas, faixa de valor e chips com o endereço da busca sem o filtro', () => {
    const facets = collectionFacets([entry, { ...entry, id: 'c2', guestsMax: 6 }]);
    const query = parseCollectionQuery({
      lifestyle: 'natureza',
      base: 'owner',
      'valor-de': '6000000',
      'valor-ate': '10000000',
    });
    expect(normalize(valueSummary(query) ?? '')).toBe('Owner · R$ 6.000.000 a R$ 10.000.000');
    expect(
      normalize(
        valueSummary(parseCollectionQuery({ base: 'co-owner', 'valor-ate': '1300000' })) ?? '',
      ),
    ).toBe('Co-Owner · até R$ 1.300.000');
    expect(facetSummaries(parseCollectionQuery({}), facets)).toEqual({
      lifestyle: 'Todos',
      region: 'Todas',
      style: 'Todos',
      guests: 'Qualquer',
      value: 'Escolha a modalidade',
    });
    expect(
      activeChips(query, facets).map((chip) => [chip.label.replace(/\s/g, ' '), chip.href]),
    ).toEqual([
      ['Natureza', '/colecao?base=owner&valor-de=6000000&valor-ate=10000000#resultados'],
      ['Owner · R$ 6.000.000 a R$ 10.000.000', '/colecao?lifestyle=natureza#resultados'],
    ]);
    expect(collectionHref(parseCollectionQuery({}), null)).toBe('/colecao');
  });
});
