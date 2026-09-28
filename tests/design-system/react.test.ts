import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import manifest from '@/design-system/brand/logo/manifest.json';
import { ICON_PATHS } from '@/design-system/react/icons';
import { Logo, logoUrl, PageHeader, RecordList } from '@/design-system/react';

describe('wrappers React do Design System (ADR-0009)', () => {
  it('[ADR-0003] ícones espelham os arquivos de src/design-system/icons', () => {
    for (const [name, paths] of Object.entries(ICON_PATHS)) {
      const svg = readFileSync(`src/design-system/icons/${name}.svg`, 'utf8');
      for (const path of paths) expect(svg, name).toContain(`<path d="${path}"/>`);
    }
  });

  it('[ADR-0003] logo segue o fundo: Warm Sand em night, Moroccan Blue em paper; ícone abaixo de 360 px', () => {
    const night = renderToStaticMarkup(
      createElement(Logo, { ground: 'night', href: '/admin', label: 'Luxtory — início' }),
    );
    expect(night).toContain(`srcSet="${logoUrl('horizontal/warm-sand')}"`);
    expect(night).toContain(`src="${logoUrl('icon/warm-sand')}"`);
    expect(night).toContain('media="(min-width: 22.5rem)"');
    expect(night).toContain('aria-label="Luxtory — início"');
    expect(night).toContain('alt=""');

    const paper = renderToStaticMarkup(
      createElement(Logo, { ground: 'paper', href: '/admin', label: 'Luxtory — início' }),
    );
    expect(paper).toContain(`srcSet="${logoUrl('horizontal/moroccan-blue')}"`);
    expect(paper).toContain(`src="${logoUrl('icon/moroccan-blue')}"`);
    // Proporção pelo viewBox do manifest (sem CLS).
    const [width = 0, height = 0] = manifest.logos['icon/moroccan-blue'].viewBox;
    expect(paper).toContain(`width="${Math.round(width)}" height="${Math.round(height)}"`);
  });

  it('[ADR-0009] sem link (layout focado), a própria imagem leva o nome acessível', () => {
    const plain = renderToStaticMarkup(createElement(Logo, { ground: 'paper', label: 'Luxtory' }));
    expect(plain).toMatch(/^<span class="lx-logo">/);
    expect(plain).toContain('alt="Luxtory"');
    expect(plain).not.toContain('<a ');
  });

  it('[ADR-0009] PageHeader: contexto antes do h1 e ações depois do texto, só quando existirem', () => {
    const bare = renderToStaticMarkup(createElement(PageHeader, { title: 'Catálogo' }));
    expect(bare).toBe(
      '<header class="lx-page-header"><h1 class="lx-display-m">Catálogo</h1></header>',
    );

    const full = renderToStaticMarkup(
      createElement(PageHeader, {
        title: 'Brand Partner',
        lead: 'Descrição',
        context: { href: '/admin/catalogo', label: 'Catálogo' },
        actions: createElement('a', { className: 'lx-button', href: '/x' }, 'Ação'),
      }),
    );
    expect(full.indexOf('lx-page-header__context')).toBeLessThan(full.indexOf('<h1'));
    expect(full).toContain('<a class="lx-link" href="/admin/catalogo">Catálogo</a>');
    expect(full.indexOf('lx-page-header__actions')).toBeGreaterThan(
      full.indexOf('lx-page-header__lead'),
    );
  });

  it('[ADR-0009] RecordList: lista nomeada, um link por item e atributos só quando existirem', () => {
    const html = renderToStaticMarkup(
      createElement(RecordList, {
        label: 'Brand Partners',
        items: [
          {
            id: 'a',
            href: '/a',
            title: 'Casa A',
            attributes: [{ label: 'Estado', value: 'Ativa' }],
          },
          { id: 'b', href: '/b', title: 'Casa B' },
        ],
      }),
    );
    expect(html).toMatch(/^<ul class="lx-record-list" aria-label="Brand Partners">/);
    expect(html.match(/class="lx-record-list__link"/g)).toHaveLength(2);
    expect(html.match(/<dl class="lx-record-list__meta">/g)).toHaveLength(1);
    expect(html).toContain('<dt class="lx-record-list__meta-label">Estado</dt>');
  });
});
