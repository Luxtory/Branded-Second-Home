import { describe, expect, it } from 'vitest';
import { groupInterests } from '@/features/ownership/application/interest-overview';
import type { InterestCount } from '@/features/ownership/application/ports';

const A = 'home-edition-a';
const B = 'home-edition-b';
const C = 'home-edition-c';
const labels = new Map([
  [A, { homeEditionName: 'Edição Mar', homeConceptTitle: 'Casa do Pátio', brandName: 'Maison A' }],
  [
    B,
    {
      homeEditionName: 'Edição Lareira',
      homeConceptTitle: 'Atelier da Serra',
      brandName: 'Maison B',
    },
  ],
  [
    C,
    { homeEditionName: 'Edição Jardim', homeConceptTitle: 'Casa do Pátio', brandName: 'Maison A' },
  ],
]);

const row = (
  homeEditionId: string,
  desiredLocation: string,
  modality: 'owner' | 'co_owner',
  approxDays: number | null,
  count: number,
): InterestCount => ({ homeEditionId, desiredLocation, modality, approxDays, count });

describe('visão agrupada do Admin (BR-062, spec ownership §5, §13)', () => {
  it('[REQ-025] Home Edition → localização pretendida → modalidade, com os valores exatos de approx_days em Co-Owner, sem faixas', () => {
    const groups = groupInterests(
      [
        row(A, 'Serra', 'co_owner', 30, 1),
        row(A, 'Serra', 'co_owner', 14, 2),
        row(A, 'Serra', 'owner', null, 3),
        row(A, 'Litoral', 'co_owner', 14, 1),
        row(B, 'Serra', 'owner', null, 1),
        row(C, 'Litoral', 'owner', null, 1),
      ],
      labels,
    );

    // Pelo título do Home Concept e, dentro dele, pelo nome da Home Edition.
    expect(groups.map((group) => group.label?.homeEditionName)).toEqual([
      'Edição Lareira',
      'Edição Jardim',
      'Edição Mar',
    ]);
    const mar = groups[2];
    expect(mar?.total).toBe(7);
    expect(mar?.locations.map((location) => [location.desiredLocation, location.total])).toEqual([
      ['Litoral', 1],
      ['Serra', 6],
    ]);
    expect(mar?.locations[1]?.modalities).toEqual([
      { modality: 'owner', total: 3, approxDays: [] },
      {
        modality: 'co_owner',
        total: 3,
        approxDays: [
          { days: 14, count: 2 },
          { days: 30, count: 1 },
        ],
      },
    ]);
  });

  it('sem rótulo do catálogo, a Home Edition aparece sem nome presumido e ordena pelo id', () => {
    const groups = groupInterests([row('home-edition-z', 'Serra', 'owner', null, 1)], new Map());

    expect(groups[0]?.label).toBeNull();
    expect(groups[0]?.homeEditionId).toBe('home-edition-z');
  });

  it('sem interesses, nenhuma linha', () => {
    expect(groupInterests([], labels)).toEqual([]);
  });
});
