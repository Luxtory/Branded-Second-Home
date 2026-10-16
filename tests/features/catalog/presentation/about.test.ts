import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aboutMessages as text } from '@/features/catalog/presentation/i18n/about-pt-br';
import { AboutContent } from '@/features/catalog/presentation/about/content';
import { aboutContext } from '@/features/catalog/presentation/about/context';
import { aboutMetadata } from '@/features/catalog/presentation/about/metadata';
import * as discoveryRoute from '@/app/(public)/sobre/page';
import * as brandPartnersRoute from '@/app/(brand-partners)/brand-partner/sobre/page';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

afterEach(() => vi.unstubAllEnvs());

describe('Sobre a Luxtory — contrato aprovado, catalog §15', () => {
  it('preserva fatos, racional do modelo e citação na edição concisa autorizada', () => {
    const history = strings(text.content.history).join(' ').replaceAll('**', '');
    for (const fact of [
      'Marcos Rodopiano',
      '13 empreendimentos de alto padrão',
      '2019',
      'patrimônio',
      'liberdade',
      'pertencimento',
      'Brand DNA',
      'arquitetura',
      'experiências',
      'confiança',
    ])
      expect(history).toContain(fact);
    expect(text.content.history.acts[3].paragraphs.at(-1)).toMatch(
      /proposta.*Branded Second Homes/,
    );
    expect(text.content.founder.quote).toBe(
      '“Criei a Luxtory para agregar mais valor ao lazer e transformar momentos em ricas histórias de vida.”',
    );
    expect(text.content.history.acts).toHaveLength(4);
    expect(text.content.purpose.values.map((value) => value.title)).toEqual([
      'Missão',
      'Visão',
      'Propósito',
    ]);
  });

  it('renderiza o mesmo corpo com um H1 e todos os destaques nas duas jornadas', () => {
    const b2c = renderToStaticMarkup(createElement(AboutContent, { journey: 'discovery' }));
    const b2b = renderToStaticMarkup(createElement(AboutContent, { journey: 'brandPartners' }));
    expect(b2c.replaceAll('/como-funciona', '/brand-partner/como-funciona')).toBe(b2b);
    expect(b2c.match(/<h1\b/g)).toHaveLength(1);
    expect(b2c.match(/<section\b/g)).toHaveLength(5);
    const emphasis = strings(text.content).flatMap((line) => [...line.matchAll(/\*\*(.+?)\*\*/g)]);
    expect(b2c.match(/<strong>/g)).toHaveLength(emphasis.length);
    expect(b2c).not.toContain('**');
  });

  for (const [journey, about, how] of [
    ['discovery', '/sobre', '/como-funciona'],
    ['brandPartners', '/brand-partner/sobre', '/brand-partner/como-funciona'],
  ] as const) {
    it(`[REQ-028] ${journey}: destinos explícitos da própria jornada e metadata noindex fora de Production`, () => {
      expect(aboutContext(journey)).toEqual({ about, howItWorks: how });
      vi.stubEnv('VERCEL_ENV', 'preview');
      const metadata = aboutMetadata(journey);
      expect(metadata.alternates).toEqual({ canonical: about });
      expect(metadata.openGraph).toMatchObject({ url: about, title: text.content.hero.eyebrow });
      expect(metadata.description).toBe(text.content.hero.lead);
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });
  }

  it('usa JPEG local 884 × 990 com bytes originais fixados e dimensões declaradas', async () => {
    const file = readFileSync('public/images/about/marcos-rodopiano.jpg');
    expect(createHash('sha256').update(file).digest('hex')).toBe(
      'fd9a0683cbdd862eedcbf5e736940324bea4f2339f85a6badc467202905b82cc',
    );
    expect(await sharp(file).metadata()).toMatchObject({ format: 'jpeg', width: 884, height: 990 });
    const html = renderToStaticMarkup(createElement(AboutContent, { journey: 'discovery' }));
    expect(html).toContain('alt="Marcos Rodopiano, fundador da Luxtory"');
    expect(html).toContain('width="884" height="990"');
  });

  it('[TECH-100] os dois portões bloqueiam página e metadados de forma independente', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PUBLIC_SITE', undefined);
    vi.stubEnv('BRAND_PARTNERS_SITE', undefined);
    for (const route of [discoveryRoute, brandPartnersRoute]) {
      expect(() => route.default()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      expect(() => route.generateMetadata()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    }
    vi.stubEnv('PUBLIC_SITE', 'open');
    expect(() => discoveryRoute.default()).not.toThrow();
    expect(discoveryRoute.generateMetadata().robots).toEqual({ index: true, follow: true });
    expect(() => brandPartnersRoute.generateMetadata()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    vi.stubEnv('PUBLIC_SITE', undefined);
    vi.stubEnv('BRAND_PARTNERS_SITE', 'open');
    expect(() => brandPartnersRoute.default()).not.toThrow();
    expect(brandPartnersRoute.generateMetadata().robots).toEqual({ index: true, follow: true });
    expect(() => discoveryRoute.generateMetadata()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('BRAND_PARTNERS_SITE', 'closed');
    expect(() => brandPartnersRoute.default()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(() => brandPartnersRoute.generateMetadata()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
