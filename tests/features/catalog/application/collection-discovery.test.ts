import { describe, expect, it } from 'vitest';
import {
  collectionFacets,
  discoverCollection,
  normalizeText,
} from '@/features/catalog/application/collection-discovery';
import {
  parseCollectionQuery,
  type SearchParams,
} from '@/features/catalog/application/collection-query';
import type {
  PublicCollectionEntry,
  PublicCollectionHomeEdition,
} from '@/features/catalog/application/collection-views';

// Descoberta da Coleção (docs/specs/catalog.md §13.12, §17.8; D-B2C-21, D-B2C-27): funções puras sobre a leitura
// pública. Pessoas, suítes, área e média projetada são atributos da Home Edition (BR-031, BR-034).
const MILLION_REAIS = 100_000_000n;
const natureza = { slug: 'natureza', label: 'Natureza' };
const bemEstar = { slug: 'bem-estar', label: 'Bem-estar' };
const contemporaneo = { slug: 'contemporaneo', label: 'Contemporâneo' };

const cover = {
  mediaId: '00000000-0000-4000-8000-00000000c0c0',
  alt: 'Casa',
  credit: null,
  cropX: 50,
  cropY: 50,
  widths: [{ width: 1600, height: 1200 }],
} as const;

function homeEdition(
  name: string,
  facts: { guests: number; suites: number; area: number },
  investment: bigint | null = null,
): PublicCollectionHomeEdition {
  return {
    id: `home-edition-${name}`,
    name,
    typology: 'Casa térrea',
    guestsMax: facts.guests,
    suites: facts.suites,
    projectedAreaM2: facts.area,
    projectedInvestment: investment === null ? null : { amountMinor: investment, currency: 'BRL' },
    cover: null,
    createdAt: new Date(Date.UTC(2026, 9, 1)),
  };
}

let sequence = 0;
function entry(
  title: string,
  overrides: Partial<PublicCollectionEntry> = {},
): PublicCollectionEntry {
  sequence += 1;
  return {
    id: `home-concept-${title}`,
    title,
    brandPartnerId: 'brand-a',
    brandName: 'Maison Atlântica',
    createdAt: new Date(Date.UTC(2026, 8, sequence)),
    summary: null,
    lifestyles: [],
    styles: [],
    cover: null,
    rank: null,
    featured: false,
    homeEditions: [],
    ...overrides,
  };
}

const query = (params: SearchParams = {}) => parseCollectionQuery(params);
const titles = (entries: readonly PublicCollectionEntry[]) => entries.map((item) => item.title);
const all = (result: ReturnType<typeof discoverCollection>) =>
  titles([...result.groups.withHomeEdition, ...result.groups.withoutHomeEdition]);

const MAR = entry('Casa do Mar', {
  lifestyles: [natureza, bemEstar],
  styles: [contemporaneo],
  homeEditions: [
    homeEdition('Edição Varanda', { guests: 10, suites: 5, area: 500 }, 48n * MILLION_REAIS),
  ],
});
const SERRA = entry('Casa da Serra', {
  lifestyles: [bemEstar],
  brandPartnerId: 'brand-b',
  brandName: 'Atelier Serra',
  homeEditions: [
    homeEdition('Edição Lareira', { guests: 6, suites: 3, area: 320 }, 22n * MILLION_REAIS),
  ],
});
const PATIO = entry('Casa do Pátio', { lifestyles: [natureza] });
const CATALOG = [MAR, SERRA, PATIO];

describe('Coleção — descoberta', () => {
  it('[REQ-022] sem filtro: um card por Home Concept, em dois grupos — com Home Edition e ainda sem Home Edition', () => {
    const result = discoverCollection(CATALOG, query());
    expect(result.filtered).toBe(false);
    expect(result.groups).toEqual({ withHomeEdition: [MAR, SERRA], withoutHomeEdition: [PATIO] });
    expect(result.total).toBe(3);
  });

  it('busca livre por Home Concept, lifestyle, estilo, Home Edition e Brand Partner, sem acento e sem diferenciar maiúsculas', () => {
    const search = (q: string) => all(discoverCollection(CATALOG, query({ q })));
    expect(search('patio')).toEqual(['Casa do Pátio']);
    expect(search('NATUREZA')).toEqual(['Casa do Mar', 'Casa do Pátio']);
    expect(search('contemporaneo')).toEqual(['Casa do Mar']);
    expect(search('lareira')).toEqual(['Casa da Serra']);
    expect(search('atelier')).toEqual(['Casa da Serra']);
    expect(search('casa natureza varanda')).toEqual(['Casa do Mar']);
    expect(normalizeText(' São PAULO ')).toBe('sao paulo');
  });

  it('[REQ-020] [BR-034] média projetada (De/Até, uma etapa, sem modalidade): só Home Concepts com Home Edition e média vigente na faixa', () => {
    const range = discoverCollection(
      CATALOG,
      query({ 'valor-de': '20000000', 'valor-ate': '30000000' }),
    );
    expect(range.groups).toEqual({ withHomeEdition: [SERRA], withoutHomeEdition: [] });
    const upTo = discoverCollection(CATALOG, query({ 'valor-ate': '50000000' }));
    expect(upTo.groups).toEqual({ withHomeEdition: [MAR, SERRA], withoutHomeEdition: [] });
    // A Home Edition sem média vigente fica fora de qualquer faixa ativa.
    const noValue = entry('Sem média', {
      homeEditions: [homeEdition('Edição Pátio', { guests: 8, suites: 4, area: 400 })],
    });
    expect(discoverCollection([noValue], query({ 'valor-de': '1' })).total).toBe(0);
  });

  it('[REQ-022] card com várias Home Editions: as que atendem à busca vêm primeiro, sem mudar o resto', () => {
    const grande = homeEdition(
      'Edição Grande',
      { guests: 12, suites: 6, area: 600 },
      7n * MILLION_REAIS,
    );
    const compacta = homeEdition(
      'Edição Compacta',
      { guests: 6, suites: 3, area: 280 },
      95n * (MILLION_REAIS / 100n),
    );
    const two = entry('Casa Dupla', { homeEditions: [grande, compacta] });
    const namesOf = (result: ReturnType<typeof discoverCollection>) =>
      result.groups.withHomeEdition.flatMap((item) => item.homeEditions.map((e) => e.name));

    expect(namesOf(discoverCollection([two], query()))).toEqual([
      'Edição Grande',
      'Edição Compacta',
    ]);
    expect(namesOf(discoverCollection([two], query({ 'valor-ate': '1000000' })))).toEqual([
      'Edição Compacta',
      'Edição Grande',
    ]);
    expect(namesOf(discoverCollection([two], query({ pessoas: '10' })))).toEqual([
      'Edição Grande',
      'Edição Compacta',
    ]);
  });

  it('"só com Home Edition" esconde os Home Concepts ainda sem Home Edition', () => {
    const only = discoverCollection(CATALOG, query({ 'com-home-edition': '1' }));
    expect(only.groups).toEqual({ withHomeEdition: [MAR, SERRA], withoutHomeEdition: [] });
  });

  it('[BR-031] pessoas, suítes e área valem pelas Home Editions publicadas: Home Concept sem Home Edition não passa num filtro ativo', () => {
    const atLeastEight = discoverCollection(CATALOG, query({ pessoas: '8' }));
    expect(atLeastEight.groups).toEqual({ withHomeEdition: [MAR], withoutHomeEdition: [] });
    expect(discoverCollection(CATALOG, query({ suites: '4' })).total).toBe(1);
    const area = discoverCollection(CATALOG, query({ 'area-de': '300', 'area-ate': '400' }));
    expect(area.groups).toEqual({ withHomeEdition: [SERRA], withoutHomeEdition: [] });
    expect(
      discoverCollection(CATALOG, query({ marca: '00000000-0000-4000-8000-000000000000' })).total,
    ).toBe(0);
  });

  it('curadoria: posição primeiro (sem posição depois), depois ordem de registro; "Mais recentes" pelo registro', () => {
    const ranked = [
      entry('A', { rank: null }),
      entry('B', { rank: 2 }),
      entry('C', { rank: 1 }),
      entry('D', { rank: null }),
    ];
    expect(titles(discoverCollection(ranked, query()).groups.withoutHomeEdition)).toEqual([
      'C',
      'B',
      'A',
      'D',
    ]);
    expect(
      titles(discoverCollection(ranked, query({ ordem: 'recentes' })).groups.withoutHomeEdition),
    ).toEqual(['D', 'C', 'B', 'A']);
  });

  it('destaque editorial: só explícito, com capa, sem filtro e na curadoria; abre o seu grupo', () => {
    const featured = entry('Destaque', { featured: true, cover, rank: 9 });
    const catalog = [...CATALOG, featured];
    const result = discoverCollection(catalog, query());
    expect(result.featuredId).toBe(featured.id);
    expect(titles(result.groups.withoutHomeEdition)).toEqual(['Destaque', 'Casa do Pátio']);
    expect(discoverCollection(catalog, query({ q: 'casa' })).featuredId).toBeNull();
    expect(discoverCollection(catalog, query({ ordem: 'recentes' })).featuredId).toBeNull();
    const withoutCover = entry('Sem capa', { featured: true });
    expect(discoverCollection([withoutCover], query()).featuredId).toBeNull();
    // Capa válida para card, mas sem resolução para o destaque em DPR 2: nunca promovida.
    const smallCover = entry('Capa pequena', {
      featured: true,
      cover: {
        ...cover,
        widths: [
          { width: 480, height: 360 },
          { width: 1000, height: 750 },
        ],
      },
    });
    expect(discoverCollection([smallCover], query()).featuredId).toBeNull();
  });

  it('facetas: só valores reais das Home Editions, cada filtro só com 2+ opções; média projetada com a menor e a maior vigente', () => {
    const facets = collectionFacets(CATALOG);
    expect(facets.lifestyles).toEqual([bemEstar, natureza]);
    expect(facets.styles).toEqual([]);
    expect(facets.guests).toEqual([6, 10]);
    expect(facets.value).toEqual({ min: 22n * MILLION_REAIS, max: 48n * MILLION_REAIS });
    expect(facets.suites).toEqual([3, 5]);
    expect(facets.area).toEqual({ min: 320, max: 500 });
    expect(facets.brands).toEqual(
      [
        { id: 'brand-a', name: 'Maison Atlântica' },
        { id: 'brand-b', name: 'Atelier Serra' },
      ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    );
    expect(facets.withHomeEdition).toBe(true);
    expect(facets).not.toHaveProperty('regions');
    expect(facets).not.toHaveProperty('modalities');

    expect(collectionFacets([PATIO])).toMatchObject({
      lifestyles: [],
      guests: [],
      value: null,
      area: null,
      brands: [],
      withHomeEdition: false,
    });
    // Uma só média publicada não é escolha.
    expect(collectionFacets([MAR, PATIO]).value).toBeNull();
  });
});
