import { describe, expect, it } from 'vitest';
import type { Env } from '@/features/platform';
import { createLabHandler } from '@/features/platform/presentation/lab';

const preview = () => ({ VERCEL_ENV: 'preview' }) satisfies Env;
const production = () => ({ VERCEL_ENV: 'production' }) satisfies Env;

async function get(path: string[], readEnv: () => Env = preview) {
  const handler = createLabHandler(readEnv);
  return handler(new Request(`http://localhost/lab/${path.join('/')}`), {
    params: Promise.resolve(path.length === 0 ? {} : { path }),
  });
}

describe('rota interna /lab', () => {
  it('[ADR-0003] /lab responde 404 em produção', async () => {
    expect((await get([], production)).status).toBe(404);
    expect((await get(['lab', 'index.html'], production)).status).toBe(404);
  });

  it('/lab redireciona para o Lab, preservando os caminhos relativos do HTML', async () => {
    const response = await get([]);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/lab/lab/index.html');
  });

  it('serve arquivos do Design System com noindex e content-type', async () => {
    const html = await get(['lab', 'index.html']);
    const css = await get(['styles', 'index.css']);

    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await html.text()).toContain('Design System Lab');
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
  });

  it.each([
    [['..', 'package.json']],
    [['lab', '..', '..', 'package.json']],
    [['scripts', 'tokens.test.mjs']],
    [['README.md']],
    [['lab', '.hidden.css']],
    [['styles', 'nao-existe.css']],
    [['styles']],
  ])('recusa caminho fora da lista permitida: %j → 404', async (path) => {
    expect((await get(path)).status).toBe(404);
  });
});
