import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalogCta, type CatalogCta } from '@/features/catalog/application/public-views';
import { CatalogActions } from '@/features/catalog/presentation/discovery/catalog-actions';
import { HomePage } from '@/features/catalog/presentation/discovery/home-page';
import { readAvailability } from '@/features/catalog/presentation/discovery/read';
import { discoveryMessages } from '@/features/catalog/presentation/i18n/discovery-pt-br';

// Availability is the Home's request-scoped PostgreSQL IO seam; all rendering stays real.
vi.mock('@/features/catalog/presentation/discovery/read', () => ({ readAvailability: vi.fn() }));

// CTA por disponibilidade (D-B2C-13, D-B2C-16; docs/specs/catalog.md §13.2). O E2E roda com Edition publicada; aqui,
// os quatro estados, na Home e no Como funciona.
const { qualification } = discoveryMessages;

function render(cta: CatalogCta, from: 'home' | 'howItWorks') {
  const next =
    from === 'home'
      ? qualification.next
      : {
          editions: qualification.next.editions,
          concepts: qualification.next.concepts,
          none: qualification.nextHowItWorks.none,
        };
  return renderToStaticMarkup(createElement(CatalogActions, { cta, next, from }));
}

const links = (html: string) =>
  [...html.matchAll(/<a class="([^"]+)" href="([^"]+)">([^<]+)</g)].map(([, cls, href, label]) => ({
    primary: cls?.includes('lx-button--primary') ?? false,
    href,
    label,
  }));

describe('CTA do Discovery por disponibilidade', () => {
  it('[REQ-022] com Edition publicada, o CTA leva à primeira oferta da Coleção', () => {
    expect(catalogCta({ concepts: true, editions: true })).toBe('editions');
    expect(links(render('editions', 'home'))).toEqual([
      {
        primary: true,
        href: '/colecao#home-editions',
        label: 'Conheça as Home Editions',
      },
      { primary: false, href: '/como-funciona', label: 'Entenda como funciona' },
    ]);
    expect(links(render('editions', 'howItWorks'))).toEqual([
      {
        primary: true,
        href: '/colecao#home-editions',
        label: 'Conheça as Home Editions',
      },
    ]);
  });

  it('[REQ-022] só com Concepts sem Edition, o CTA é "Conheça os Home Concepts"', () => {
    expect(catalogCta({ concepts: true, editions: false })).toBe('concepts');
    expect(links(render('concepts', 'home'))[0]).toEqual({
      primary: true,
      href: '/colecao#home-concepts',
      label: 'Conheça os Home Concepts',
    });
    expect(render('concepts', 'home')).toContain(qualification.next.concepts);
  });

  it('[REQ-022] sem Concept publicado, nenhum caminho para uma Coleção vazia', () => {
    expect(catalogCta({ concepts: false, editions: false })).toBe('none');
    expect(links(render('none', 'home'))).toEqual([
      { primary: true, href: '/como-funciona', label: 'Entenda como funciona' },
    ]);
    const howItWorks = render('none', 'howItWorks');
    expect(links(howItWorks)).toEqual([]);
    expect(howItWorks).toContain(qualification.nextHowItWorks.none);
  });

  it('[TECH-001] dados indisponíveis: estado desconhecido, nunca tratado como inexistência de Edition ou de Concept', () => {
    expect(catalogCta(null)).toBe('unknown');
    const home = render('unknown', 'home');
    expect(links(home)).toEqual([
      { primary: true, href: '/como-funciona', label: 'Entenda como funciona' },
    ]);
    for (const html of [home, render('unknown', 'howItWorks')]) {
      expect(html).not.toContain('/colecao');
      expect(html).not.toContain(qualification.next.none);
      expect(html).not.toMatch(/ainda não|não há/i);
    }
    expect(render('unknown', 'howItWorks')).toBe('');
  });
});

describe('PUSH da Home real por disponibilidade', () => {
  const publishedNext =
    'Se essa combinação faz sentido para a vida que você quer viver, o próximo passo é descobrir qual Second Home combina com você.';
  const noneNext =
    'Os primeiros Home Concepts ainda não foram publicados. Enquanto isso, veja em detalhe como tudo funciona.';
  const unknownNext = 'Veja em detalhe como tudo funciona.';

  it.each([
    {
      state: 'editions',
      availability: { editions: true, concepts: true },
      instruction: publishedNext,
      expectedLinks: [
        { primary: true, href: '/colecao#home-editions', label: 'Conheça as Home Editions' },
        { primary: false, href: '/como-funciona', label: 'Entenda como funciona' },
      ],
    },
    {
      state: 'concepts',
      availability: { editions: false, concepts: true },
      instruction: publishedNext,
      expectedLinks: [
        { primary: true, href: '/colecao#home-concepts', label: 'Conheça os Home Concepts' },
        { primary: false, href: '/como-funciona', label: 'Entenda como funciona' },
      ],
    },
    {
      state: 'none',
      availability: { editions: false, concepts: false },
      instruction: noneNext,
      expectedLinks: [{ primary: true, href: '/como-funciona', label: 'Entenda como funciona' }],
    },
    {
      state: 'unknown',
      availability: null,
      instruction: unknownNext,
      expectedLinks: [{ primary: true, href: '/como-funciona', label: 'Entenda como funciona' }],
    },
  ])(
    '[REQ-022] [TECH-001] $state: uma instrução compatível e os caminhos disponíveis',
    async ({ availability, instruction, expectedLinks }) => {
      vi.mocked(readAvailability).mockResolvedValueOnce(availability);
      const html = renderToStaticMarkup(await HomePage());
      const push = html.match(/<section\b[^>]*id="para-quem"[\s\S]*?<\/section>/)?.[0];
      expect(push).toBeDefined();
      const paragraphs = [...(push ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(([, line]) =>
        line?.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' '),
      );
      expect(paragraphs.filter((line) => line === instruction)).toHaveLength(1);
      for (const other of [publishedNext, noneNext, unknownNext].filter(
        (line) => line !== instruction,
      )) {
        expect(paragraphs).not.toContain(other);
      }
      expect(links(push ?? '')).toEqual(expectedLinks);
    },
  );
});
