import { describe, expect, it } from 'vitest';
import { mainImage } from '@/features/catalog/application/public-media';
import {
  catalogCta,
  publicId,
  type PublicHomeEditionMedia,
} from '@/features/catalog/application/public-views';

const media = (mediaId: string, kind: PublicHomeEditionMedia['kind']): PublicHomeEditionMedia => ({
  mediaId,
  kind,
  alt: `Mídia ${mediaId}`,
  credit: null,
  cropX: 50,
  cropY: 50,
  widths: [{ width: 800, height: 600 }],
});

describe('Discovery — visões públicas (docs/specs/catalog.md §13.2, §17.7)', () => {
  it('id da URL (Home Concept, Home Edition): só uuid; o resto vira 404 sem consultar o banco', () => {
    const id = '3f2b8c1e-5a4d-4c7b-9e1f-0a2b3c4d5e6f';
    expect(publicId(id)).toBe(id);
    for (const value of ['', 'casa-do-patio', `${id}x`, "1' OR '1'='1"]) {
      expect(publicId(value)).toBeNull();
    }
  });

  it('[BR-031] imagem principal da Home Edition: a primeira imagem ou render aprovado; planta nunca abre', () => {
    expect(mainImage([])).toBeNull();
    expect(mainImage([media('p1', 'floor_plan')])).toBeNull();
    expect(mainImage([media('p1', 'floor_plan'), media('r1', 'render')])?.mediaId).toBe('r1');
    expect(mainImage([media('i1', 'image'), media('r1', 'render')])).not.toHaveProperty('kind');
  });

  it('[REQ-022] CTA por disponibilidade (D-B2C-13, D-B2C-16, D-B2C-27): dado indisponível nunca vira "sem Home Edition"', () => {
    expect(catalogCta({ homeConcepts: true, homeEditions: true })).toBe('homeEditions');
    expect(catalogCta({ homeConcepts: true, homeEditions: false })).toBe('homeConcepts');
    expect(catalogCta({ homeConcepts: false, homeEditions: false })).toBe('none');
    expect(catalogCta(null)).toBe('unknown');
  });
});
