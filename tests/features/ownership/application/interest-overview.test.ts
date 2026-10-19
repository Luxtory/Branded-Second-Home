import { describe, expect, it } from 'vitest';
import { groupInterests } from '@/features/ownership/application/interest-overview';
import type { InterestCount } from '@/features/ownership/application/ports';

const A = 'concept-a';
const B = 'concept-b';
const labels = new Map([
  [A, { title: 'Casa do Pátio', brandName: 'Maison A' }],
  [B, { title: 'Atelier da Serra', brandName: 'Maison B' }],
]);

const row = (
  conceptId: string,
  region: string,
  modality: 'owner' | 'co_owner',
  approxDays: number | null,
  count: number,
): InterestCount => ({ conceptId, region, modality, approxDays, count });

describe('visão agrupada do Admin (BR-062, spec ownership §5)', () => {
  it('[REQ-025] Concept → região → modalidade, com os valores exatos de approx_days em Co-Owner, sem faixas', () => {
    const groups = groupInterests(
      [
        row(A, 'Serra', 'co_owner', 30, 1),
        row(A, 'Serra', 'co_owner', 14, 2),
        row(A, 'Serra', 'owner', null, 3),
        row(A, 'Litoral', 'co_owner', 14, 1),
        row(B, 'Serra', 'owner', null, 1),
      ],
      labels,
    );

    expect(groups.map((group) => group.label?.title)).toEqual([
      'Atelier da Serra',
      'Casa do Pátio',
    ]);
    const pátio = groups[1];
    expect(pátio?.total).toBe(7);
    expect(pátio?.regions.map((region) => [region.region, region.total])).toEqual([
      ['Litoral', 1],
      ['Serra', 6],
    ]);
    expect(pátio?.regions[1]?.modalities).toEqual([
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

  it('sem rótulo do catálogo, o Concept aparece sem título presumido e ordena pelo id', () => {
    const groups = groupInterests([row('concept-z', 'Serra', 'owner', null, 1)], new Map());

    expect(groups[0]?.label).toBeNull();
    expect(groups[0]?.conceptId).toBe('concept-z');
  });

  it('sem interesses, nenhuma linha', () => {
    expect(groupInterests([], labels)).toEqual([]);
  });
});
