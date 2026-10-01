import { describe, expect, it } from 'vitest';
import {
  catalogCta,
  distinctRegions,
  groupCollection,
  publicConceptId,
  type PublicConceptCard,
} from '@/features/catalog/application/public-views';

const card = (id: string, editions: number): PublicConceptCard => ({
  id,
  title: `Concept ${id}`,
  brandName: 'Marca',
  editions: Array.from({ length: editions }, (_, index) => ({
    id: `${id}-${index}`,
    region: 'Região',
    modality: 'owner',
  })),
});

describe('Discovery — visões públicas (docs/specs/catalog.md §13.2)', () => {
  it('id de Concept da URL: só uuid; o resto vira 404 sem consultar o banco', () => {
    const id = '3f2b8c1e-5a4d-4c7b-9e1f-0a2b3c4d5e6f';
    expect(publicConceptId(id)).toBe(id);
    for (const value of ['', 'casa-do-patio', `${id}x`, "1' OR '1'='1"]) {
      expect(publicConceptId(value)).toBeNull();
    }
  });

  it('regiões sem repetição, na ordem de registro', () => {
    expect(distinctRegions([])).toEqual([]);
    expect(
      distinctRegions([{ region: 'Serra' }, { region: 'Litoral' }, { region: 'Serra' }]),
    ).toEqual(['Serra', 'Litoral']);
  });

  it('[REQ-022] Coleção em dois grupos, sem repetir Concept: com Edition primeiro, ordem de registro mantida', () => {
    const { withEditions, withoutEditions } = groupCollection([
      card('a', 0),
      card('b', 1),
      card('c', 0),
      card('d', 2),
    ]);
    expect(withEditions.map((item) => item.id)).toEqual(['b', 'd']);
    expect(withoutEditions.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('[REQ-022] CTA por disponibilidade (D-B2C-13, D-B2C-16): dado indisponível nunca vira "sem Edition"', () => {
    expect(catalogCta({ concepts: true, editions: true })).toBe('editions');
    expect(catalogCta({ concepts: true, editions: false })).toBe('concepts');
    expect(catalogCta({ concepts: false, editions: false })).toBe('none');
    expect(catalogCta(null)).toBe('unknown');
  });
});
