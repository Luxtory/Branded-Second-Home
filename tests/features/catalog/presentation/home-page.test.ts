import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from '@/features/catalog/presentation/discovery/home-page';
import { HOME_SECTIONS } from '@/features/catalog/presentation/discovery/paths';
import { discoveryMessages } from '@/features/catalog/presentation/i18n/discovery-pt-br';

// The visual recipe must remain useful when the catalog is unavailable; database state is covered separately.
vi.mock('@/features/catalog/presentation/discovery/read', () => ({
  readAvailability: async () => null,
}));

describe('Home using the founder-approved Luxtory Design System', () => {
  it('[D-B2C-18] keeps the eleven narrative anchors and uses the original solution diagram', async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('lx-b2c-home');
    const ids = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual([...HOME_SECTIONS]);
    const title = discoveryMessages.home.hero.title;
    const headline = html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1]?.replace(/<[^>]*>/g, '');
    expect(headline).toBe(title.lead + title.turn + title.tail);
    expect(html).toContain('/diagrams/diagrama-solucao-luxtory.svg');
    expect(html).not.toContain('/lab/');
    expect(html).not.toContain('lx-triad');
    expect(html).not.toContain('lx-frame--typographic');
  });

  it('[REQ-022] [TECH-001] preserves the unknown-state CTA and the founder-approved guardrails', async () => {
    const html = renderToStaticMarkup(await HomePage());
    const content = html.replace(/<[^>]*>/g, '');
    expect(html).toContain('href="/como-funciona"');
    expect(html).not.toContain('href="/colecao#');
    expect(content).toContain(
      'Créditos não são moeda, investimento nem garantia de disponibilidade.',
    );
    expect(content).toContain(
      'A administração integral pela Luxtory é opcional, assim como a Taxa de Administração.',
    );
    expect(content).toContain('As despesas da Second Home são rateadas entre os Co-Owners.');
  });
});
