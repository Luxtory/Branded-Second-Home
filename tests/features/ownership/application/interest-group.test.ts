import { describe, expect, it } from 'vitest';
import { groupHomeEditionInterests } from '@/features/ownership/application/interest-group';
import type { InterestRecord } from '@/features/ownership/application/ports';

// Grupo da Home Edition no drill-down do Admin (spec ownership §14.10): os interesses de uma Home Edition, sem PII, por
// localização pretendida → modalidade; dentro de cada modalidade, do mais recente ao mais antigo. Nenhuma faixa,
// ranking, score ou algoritmo (BR-062).
const record = (
  id: string,
  desiredLocation: string,
  modality: 'owner' | 'co_owner',
  day: number,
  approxDays: number | null = modality === 'co_owner' ? 14 : null,
): InterestRecord => ({
  id,
  homeEditionId: 'home-edition-a',
  modality,
  desiredLocation,
  approxDays,
  createdAt: new Date(Date.UTC(2026, 9, day)),
});

describe('grupo da Home Edition no Admin (spec ownership §14.10)', () => {
  it('[REQ-025] localização em ordem alfabética → Owner antes de Co-Owner → mais recente primeiro', () => {
    const groups = groupHomeEditionInterests([
      record('a', 'Serra', 'co_owner', 1, 30),
      record('b', 'Litoral', 'owner', 2),
      record('c', 'Serra', 'co_owner', 3, 14),
      record('d', 'Serra', 'owner', 4),
    ]);

    expect(groups.map((group) => group.desiredLocation)).toEqual(['Litoral', 'Serra']);
    expect(groups[1]?.modalities.map((group) => group.modality)).toEqual(['owner', 'co_owner']);
    expect(groups[1]?.modalities[1]?.interests.map((interest) => interest.id)).toEqual(['c', 'a']);
    expect(groups[1]?.modalities[1]?.interests.map((interest) => interest.approxDays)).toEqual([
      14, 30,
    ]);
  });

  it('sem interesses → nenhum grupo; nunca contato nem pré-qualificação no grupo', () => {
    expect(groupHomeEditionInterests([])).toEqual([]);
    const [group] = groupHomeEditionInterests([record('a', 'Serra', 'owner', 1)]);
    expect(JSON.stringify(group)).not.toMatch(/email|phone|name|investment|decision/u);
  });
});
