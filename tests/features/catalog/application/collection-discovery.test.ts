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
  PublicCollectionEdition,
  PublicCollectionEntry,
} from '@/features/catalog/application/collection-views';

// Descoberta da Coleção (docs/specs/catalog.md §13.12, D-B2C-21): funções puras sobre a leitura pública.
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

function edition(
  region: string,
  modality: PublicCollectionEdition['modality'],
  values: Partial<Record<'owner' | 'acao', bigint>> = {},
): PublicCollectionEdition {
  return {
    id: `${region}-${modality}`,
    region,
    modality,
    values: Object.entries(values).map(([basis, amountMinor]) => ({
      basis: basis as 'owner' | 'acao',
      amountMinor,
      currency: 'BRL',
    })),
  };
}

let sequence = 0;
function entry(
  title: string,
  overrides: Partial<PublicCollectionEntry> = {},
): PublicCollectionEntry {
  sequence += 1;
  return {
    id: `concept-${title}`,
    title,
    brandPartnerId: 'brand-a',
    brandName: 'Maison Atlântica',
    createdAt: new Date(Date.UTC(2026, 8, sequence)),
    summary: null,
    guestsMax: null,
    suites: null,
    builtAreaM2: null,
    lifestyles: [],
    styles: [],
    cover: null,
    rank: null,
    featured: false,
    editions: [],
    ...overrides,
  };
}

const query = (params: SearchParams = {}) => parseCollectionQuery(params);
const titles = (entries: readonly PublicCollectionEntry[]) => entries.map((item) => item.title);

const MAR = entry('Casa do Mar', {
  lifestyles: [natureza, bemEstar],
  styles: [contemporaneo],
  guestsMax: 10,
  suites: 5,
  builtAreaM2: 500,
  editions: [
    edition('Trancoso, BA', 'owner_and_co_owner', {
      owner: 48n * MILLION_REAIS,
      acao: 6n * MILLION_REAIS,
    }),
  ],
});
const SERRA = entry('Casa da Serra', {
  lifestyles: [bemEstar],
  guestsMax: 6,
  suites: 3,
  builtAreaM2: 320,
  brandPartnerId: 'brand-b',
  brandName: 'Atelier Serra',
  editions: [edition('Campos do Jordão, SP', 'owner', { owner: 22n * MILLION_REAIS })],
});
const PATIO = entry('Casa do Pátio', { lifestyles: [natureza], guestsMax: 8 });
const CATALOG = [MAR, SERRA, PATIO];

describe('Coleção — descoberta', () => {
  it('[REQ-022] sem filtro: um card por Concept, em dois grupos — com Home Edition e ainda sem Home Edition', () => {
    const result = discoverCollection(CATALOG, query());
    expect(result.filtered).toBe(false);
    expect(result.groups).toEqual({
      kind: 'catalog',
      withEdition: [MAR, SERRA],
      withoutEdition: [PATIO],
    });
    expect(result.total).toBe(3);
  });

  it('busca livre por Concept, lifestyle, estilo, destino e Brand Partner, sem acento e sem diferenciar maiúsculas', () => {
    const search = (q: string) => {
      const { groups } = discoverCollection(CATALOG, query({ q }));
      return groups.kind === 'catalog'
        ? titles([...groups.withEdition, ...groups.withoutEdition])
        : [];
    };
    expect(search('patio')).toEqual(['Casa do Pátio']);
    expect(search('NATUREZA')).toEqual(['Casa do Mar', 'Casa do Pátio']);
    expect(search('contemporaneo')).toEqual(['Casa do Mar']);
    expect(search('campos jordao')).toEqual(['Casa da Serra']);
    expect(search('atelier')).toEqual(['Casa da Serra']);
    expect(search('casa natureza trancoso')).toEqual(['Casa do Mar']);
    expect(normalizeText(' São PAULO ')).toBe('sao paulo');
  });

  it('[REQ-020] [REQ-022] Localização não elimina Concepts sem Edition na região: dois grupos, sem repetir Concept', () => {
    const result = discoverCollection(CATALOG, query({ regiao: 'trancoso, ba' }));
    expect(result.groups).toEqual({
      kind: 'region',
      region: 'trancoso, ba',
      inRegion: [MAR],
      others: [SERRA, PATIO],
    });
    // Com lifestyle: os "outros" também respeitam as demais escolhas.
    const withLifestyle = discoverCollection(
      CATALOG,
      query({ regiao: 'Trancoso, BA', lifestyle: 'natureza' }),
    );
    expect(withLifestyle.groups).toMatchObject({ inRegion: [MAR], others: [PATIO] });
  });

  it('[REQ-020] [REQ-100] [REQ-103] faixa de valor: só Concepts com Edition e valor vigente na base escolhida, Owner e Co-Owner com o mesmo peso', () => {
    const owner = discoverCollection(
      CATALOG,
      query({ base: 'owner', 'valor-de': '20000000', 'valor-ate': '30000000' }),
    );
    expect(owner.groups).toEqual({ kind: 'catalog', withEdition: [SERRA], withoutEdition: [] });

    const coOwner = discoverCollection(CATALOG, query({ base: 'co-owner' }));
    expect(coOwner.groups).toEqual({ kind: 'catalog', withEdition: [MAR], withoutEdition: [] });

    // Com região, o primeiro grupo exige a Edition na região com o valor; os "outros" precisam de valor em outra região.
    const inRegion = discoverCollection(
      CATALOG,
      query({ regiao: 'Trancoso, BA', base: 'owner', 'valor-ate': '30000000' }),
    );
    expect(inRegion.groups).toMatchObject({ inRegion: [], others: [SERRA] });
  });

  it('[REQ-022] card com várias Editions: as que atendem à região e à faixa de valor vêm primeiro, sem mudar o resto', () => {
    const bahia = edition('Litoral Sul da Bahia', 'owner_and_co_owner', {
      owner: 7n * MILLION_REAIS,
      acao: 11n * (MILLION_REAIS / 10n),
    });
    const norte = edition('Litoral Norte de São Paulo', 'co_owner', {
      acao: 95n * (MILLION_REAIS / 100n),
    });
    const two = entry('Casa Dupla', { editions: [bahia, norte] });
    const editionsOf = (result: ReturnType<typeof discoverCollection>) =>
      (result.groups.kind === 'region'
        ? result.groups.inRegion
        : result.groups.withEdition
      ).flatMap((item) => item.editions.map((e) => e.region));

    expect(editionsOf(discoverCollection([two], query()))).toEqual([
      'Litoral Sul da Bahia',
      'Litoral Norte de São Paulo',
    ]);
    expect(
      editionsOf(discoverCollection([two], query({ regiao: 'Litoral Norte de São Paulo' }))),
    ).toEqual(['Litoral Norte de São Paulo', 'Litoral Sul da Bahia']);
    expect(
      editionsOf(discoverCollection([two], query({ base: 'co-owner', 'valor-ate': '1000000' }))),
    ).toEqual(['Litoral Norte de São Paulo', 'Litoral Sul da Bahia']);
  });

  it('modalidade disponível: uma Edition Owner e Co-Owner atende às duas; "só com Home Edition" esconde os sem Edition', () => {
    const coOwner = discoverCollection(CATALOG, query({ modalidade: 'co-owner' }));
    expect(coOwner.groups).toMatchObject({ withEdition: [MAR], withoutEdition: [] });
    const owner = discoverCollection(CATALOG, query({ modalidade: 'owner' }));
    expect(owner.groups).toMatchObject({ withEdition: [MAR, SERRA] });
    const onlyEditions = discoverCollection(CATALOG, query({ 'com-edition': '1' }));
    expect(onlyEditions.groups).toMatchObject({ withEdition: [MAR, SERRA], withoutEdition: [] });
  });

  it('pessoas, suítes e área: o dado ausente não passa num filtro ativo', () => {
    const atLeastEight = discoverCollection(CATALOG, query({ pessoas: '8' }));
    expect(atLeastEight.groups).toMatchObject({ withEdition: [MAR], withoutEdition: [PATIO] });
    const suites = discoverCollection(CATALOG, query({ suites: '4' }));
    expect(suites.total).toBe(1);
    const area = discoverCollection(CATALOG, query({ 'area-de': '300', 'area-ate': '400' }));
    expect(area.groups).toMatchObject({ withEdition: [SERRA], withoutEdition: [] });
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
    const curated = discoverCollection(ranked, query()).groups;
    expect(curated.kind === 'catalog' && titles(curated.withoutEdition)).toEqual([
      'C',
      'B',
      'A',
      'D',
    ]);
    const recent = discoverCollection(ranked, query({ ordem: 'recentes' })).groups;
    expect(recent.kind === 'catalog' && titles(recent.withoutEdition)).toEqual([
      'D',
      'C',
      'B',
      'A',
    ]);
  });

  it('destaque editorial: só explícito, com capa, sem filtro e na curadoria; abre o seu grupo', () => {
    const featured = entry('Destaque', { featured: true, cover, rank: 9 });
    const catalog = [...CATALOG, featured];
    const result = discoverCollection(catalog, query());
    expect(result.featuredId).toBe(featured.id);
    expect(result.groups.kind === 'catalog' && titles(result.groups.withoutEdition)).toEqual([
      'Destaque',
      'Casa do Pátio',
    ]);
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

  it('facetas: só valores reais, cada filtro só com 2+ opções; faixa de valor com o menor e o maior vigente por base', () => {
    const facets = collectionFacets(CATALOG);
    expect(facets.lifestyles).toEqual([bemEstar, natureza]);
    expect(facets.styles).toEqual([]);
    expect(facets.regions).toEqual(['Campos do Jordão, SP', 'Trancoso, BA']);
    expect(facets.guests).toEqual([6, 8, 10]);
    expect(facets.values).toEqual([
      { basis: 'owner', min: 22n * MILLION_REAIS, max: 48n * MILLION_REAIS },
      { basis: 'acao', min: 6n * MILLION_REAIS, max: 6n * MILLION_REAIS },
    ]);
    expect(facets.suites).toEqual([3, 5]);
    expect(facets.area).toEqual({ min: 320, max: 500 });
    expect(facets.modalities).toEqual(['owner', 'co_owner']);
    expect(facets.brands).toEqual(
      [
        { id: 'brand-a', name: 'Maison Atlântica' },
        { id: 'brand-b', name: 'Atelier Serra' },
      ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    );
    expect(facets.withEdition).toBe(true);

    const single = collectionFacets([PATIO]);
    expect(single).toMatchObject({
      lifestyles: [],
      regions: [],
      guests: [],
      values: [],
      area: null,
      modalities: [],
      brands: [],
      withEdition: false,
    });
  });
});
