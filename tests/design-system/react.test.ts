import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import manifest from '@/design-system/brand/logo/manifest.json';
import { ICON_PATHS } from '@/design-system/react/icons';
import { Logo, logoUrl } from '@/design-system/react';

describe('wrappers React do Design System (ADR-0009)', () => {
  it('[ADR-0003] ícones espelham os arquivos de src/design-system/icons', () => {
    for (const [name, path] of Object.entries(ICON_PATHS)) {
      const svg = readFileSync(`src/design-system/icons/${name}.svg`, 'utf8');
      expect(svg, name).toContain(`<path d="${path}"/>`);
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
});
