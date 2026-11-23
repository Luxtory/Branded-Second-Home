import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClubPage } from '@/features/catalog/presentation/discovery/club-page';

describe('demonstração de reservas da Luxtory Club', () => {
  it('apresenta o vídeo entre propriedade e Luxchange', () => {
    const html = renderToStaticMarkup(createElement(ClubPage));

    const demonstration = html.indexOf('id="reservas-na-pratica"');
    expect(demonstration).toBeGreaterThan(html.indexOf('id="condicoes"'));
    expect(demonstration).toBeLessThan(html.indexOf('id="luxchange"'));
    expect(html).toContain('Uma estadia. <em>Três formas de reservar.</em>');
    const player = html.match(/<iframe[^>]+>/)?.[0];
    expect(player).toContain(
      'src="https://www.youtube-nocookie.com/embed/wTnxs8DEBWE?playsinline=1"',
    );
    expect(player).toContain('title="Simulação de reserva do Luxtory Club"');
    expect(player).toContain('loading="lazy"');
    expect(player).toMatch(/\ballowfullscreen\b/i);
    expect(html).toContain('href="https://youtu.be/wTnxs8DEBWE"');
  });
});
