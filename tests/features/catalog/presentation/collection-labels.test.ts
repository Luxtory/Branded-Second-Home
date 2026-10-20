import { describe, expect, it } from 'vitest';
import { collectionFacets } from '@/features/catalog/application/collection-discovery';
import { parseCollectionQuery } from '@/features/catalog/application/collection-query';
import type {
  PublicCollectionEntry,
  PublicCollectionHomeEdition,
} from '@/features/catalog/application/collection-views';
import {
  activeChips,
  cardEyebrow,
  collectionHref,
  coverSrcSet,
  facetSummaries,
  factsLine,
  fallbackWord,
  projectedLine,
  valueSummary,
} from '@/features/catalog/presentation/discovery/collection-labels';

// Rótulos da Coleção (docs/specs/catalog.md §13.12, §17.8): derivados, nunca decidem o que aparece.
const normalize = (value: string) => value.replace(/\s/g, ' ');

const varanda: PublicCollectionHomeEdition = {
  id: 'e1',
  name: 'Edição Varanda',
  typology: 'Casa térrea',
  guestsMax: 10,
  suites: 5,
  projectedAreaM2: 1200,
  projectedInvestment: { amountMinor: 480_000_000n, currency: 'BRL' },
  cover: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

const entry: PublicCollectionEntry = {
  id: 'c1',
  title: 'Casa do Mar',
  brandPartnerId: 'b1',
  brandName: 'Maison Atlântica',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  summary: null,
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
  homeEditions: [
    varanda,
    {
      ...varanda,
      id: 'e2',
      name: 'Edição Serra',
      guestsMax: 6,
      suites: 1,
      projectedInvestment: null,
    },
  ],
};

describe('Coleção — rótulos', () => {
  it('[REQ-100] [BR-034] Home Edition: fatos e "Média projetada" só com média vigente; sem modalidade, Ação ou dia', () => {
    expect(factsLine(varanda)).toBe('Até 10 pessoas · 5 suítes · 1.200 m²');
    expect(factsLine(entry.homeEditions[1]!)).toBe('Até 6 pessoas · 1 suíte · 1.200 m²');
    expect(normalize(projectedLine(varanda) ?? '')).toBe('Média projetada R$ 4.800.000');
    expect(projectedLine(entry.homeEditions[1]!)).toBeNull();
    expect(projectedLine(varanda)).not.toMatch(/owner|co-owner|ação|di[aá]ria|por dia|cota/i);
  });

  it('eyebrow e quadro sem capa: o lifestyle principal ou o título', () => {
    expect(cardEyebrow(entry)).toBe('Natureza · Contemporâneo');
    expect(cardEyebrow({ ...entry, lifestyles: [], styles: [] })).toBeNull();
    expect(fallbackWord(entry)).toBe('Natureza');
    expect(fallbackWord({ ...entry, lifestyles: [] })).toBe('Casa do Mar');
  });

  it('[ADR-0015] srcset das larguras servidas pelo próprio domínio, com fallback de 800 px, por dono da mídia', () => {
    expect(coverSrcSet(entry.cover!)).toEqual({
      src: '/media/home-concept-covers/m1/800',
      srcSet:
        '/media/home-concept-covers/m1/480 480w, /media/home-concept-covers/m1/800 800w, /media/home-concept-covers/m1/1200 1200w',
    });
    expect(coverSrcSet(entry.cover!, 'homeEdition').src).toBe('/media/home-edition-media/m1/800');
  });

  it('resumos das facetas, faixa da média projetada e chips com o endereço da busca sem o filtro', () => {
    const other = {
      ...entry,
      id: 'c2',
      homeEditions: [
        {
          ...varanda,
          id: 'e3',
          guestsMax: 6,
          projectedInvestment: { amountMinor: 900_000_000n, currency: 'BRL' as const },
        },
      ],
    };
    const facets = collectionFacets([entry, other]);
    const query = parseCollectionQuery({
      lifestyle: 'natureza',
      'valor-de': '6000000',
      'valor-ate': '10000000',
    });
    expect(normalize(valueSummary(query) ?? '')).toBe('R$ 6.000.000 a R$ 10.000.000');
    expect(normalize(valueSummary(parseCollectionQuery({ 'valor-ate': '1300000' })) ?? '')).toBe(
      'até R$ 1.300.000',
    );
    expect(facetSummaries(parseCollectionQuery({}), facets)).toEqual({
      lifestyle: 'Todos',
      style: 'Todos',
      guests: 'Qualquer',
      value: 'Qualquer',
    });
    expect(
      activeChips(query, facets).map((chip) => [chip.label.replace(/\s/g, ' '), chip.href]),
    ).toEqual([
      ['Natureza', '/colecao?valor-de=6000000&valor-ate=10000000#resultados'],
      ['Média projetada: R$ 6.000.000 a R$ 10.000.000', '/colecao?lifestyle=natureza#resultados'],
    ]);
    expect(collectionHref(parseCollectionQuery({}), null)).toBe('/colecao');
  });
});
