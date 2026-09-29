import { describe, expect, it } from 'vitest';
import { distinctRegions, publicConceptId } from '@/features/catalog/application/public-views';

describe('Discovery — visões públicas (docs/specs/catalog.md §13.2)', () => {
  it('id de Concept da URL: só uuid; o resto vira 404 sem consultar o banco', () => {
    const id = '3f2b8c1e-5a4d-4c7b-9e1f-0a2b3c4d5e6f';
    expect(publicConceptId(id)).toBe(id);
    for (const value of ['', 'casa-do-patio', `${id}x`, "1' OR '1'='1"]) {
      expect(publicConceptId(value)).toBeNull();
    }
  });

  it('[REQ-022] regiões das Editions sem repetição, na ordem de registro; sem Edition, nenhuma', () => {
    expect(distinctRegions([])).toEqual([]);
    expect(
      distinctRegions([{ region: 'Serra' }, { region: 'Litoral' }, { region: 'Serra' }]),
    ).toEqual(['Serra', 'Litoral']);
  });
});
