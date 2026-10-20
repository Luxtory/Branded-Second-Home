import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalogCta, type CatalogCta } from '@/features/catalog/application/public-views';
import { CatalogActions } from '@/features/catalog/presentation/discovery/catalog-actions';
import { discoveryMessages } from '@/features/catalog/presentation/i18n/discovery-pt-br';

// CTA por disponibilidade (D-B2C-13, D-B2C-16; docs/specs/catalog.md §13.2). O E2E roda com Home Edition publicada; aqui,
// os quatro estados, na Home e no Como funciona.
const { qualification } = discoveryMessages;

function render(cta: CatalogCta, from: 'home' | 'howItWorks') {
  const next =
    from === 'home'
      ? qualification.next
      : {
          homeEditions: qualification.next.homeEditions,
          homeConcepts: qualification.next.homeConcepts,
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
  it('[REQ-022] com Home Edition publicada, o CTA leva ao primeiro grupo da Coleção', () => {
    expect(catalogCta({ homeConcepts: true, homeEditions: true })).toBe('homeEditions');
    expect(links(render('homeEditions', 'home'))).toEqual([
      {
        primary: true,
        href: '/colecao#home-editions',
        label: 'Conheça as Home Editions',
      },
      { primary: false, href: '/como-funciona', label: 'Entenda como funciona' },
    ]);
    expect(links(render('homeEditions', 'howItWorks'))).toEqual([
      {
        primary: true,
        href: '/colecao#home-editions',
        label: 'Conheça as Home Editions',
      },
    ]);
  });

  it('[REQ-022] só com Home Concepts sem Home Edition, o CTA é "Conheça os Home Concepts"', () => {
    expect(catalogCta({ homeConcepts: true, homeEditions: false })).toBe('homeConcepts');
    expect(links(render('homeConcepts', 'home'))[0]).toEqual({
      primary: true,
      href: '/colecao#home-concepts',
      label: 'Conheça os Home Concepts',
    });
    expect(render('homeConcepts', 'home')).toContain(qualification.next.homeConcepts);
  });

  it('[REQ-022] sem Concept publicado, nenhum caminho para uma Coleção vazia', () => {
    expect(catalogCta({ homeConcepts: false, homeEditions: false })).toBe('none');
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
