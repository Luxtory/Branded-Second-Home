import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { loadEnv, type Env } from '../infrastructure/env';
import { withRoute } from './route';

/**
 * Rota interna /lab (ADR-0003): serve o Design System Lab e seus arquivos, só fora de produção.
 * `/lab` → `/lab/lab/index.html`; `/lab/<caminho>` → `src/design-system/<caminho>`, de modo que os caminhos
 * relativos do Lab (`../styles/index.css`, `../brand/logo/…`) funcionam sem alterar o HTML.
 */
const DS_ROOT = join(process.cwd(), 'src', 'design-system');
const LAB_ENTRY = '/lab/lab/index.html';
const ALLOWED_DIRS = new Set(['lab', 'styles', 'tokens', 'fonts', 'brand', 'icons']);
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const LAB_HEADERS = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' };

interface LabRouteParams {
  params: Promise<{ path?: string[] }>;
}

const notFound = () => new Response(null, { status: 404, headers: LAB_HEADERS });

function resolveLabFile(root: string, segments: readonly string[]): string | null {
  const [dir] = segments;
  if (dir === undefined || !ALLOWED_DIRS.has(dir)) return null;
  if (!segments.every((segment) => SAFE_SEGMENT.test(segment))) return null;
  const file = join(root, ...segments);
  if (!file.startsWith(root + sep) || CONTENT_TYPES[extname(file)] === undefined) return null;
  return file;
}

function isMissingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR';
}

export function createLabHandler(readEnv: () => Env = () => loadEnv(), root: string = DS_ROOT) {
  return withRoute(async (_request, _context, { params }: LabRouteParams) => {
    if (readEnv().VERCEL_ENV === 'production') return notFound();
    const { path: segments = [] } = await params;
    if (segments.length === 0) {
      return new Response(null, { status: 308, headers: { ...LAB_HEADERS, location: LAB_ENTRY } });
    }
    const file = resolveLabFile(root, segments);
    if (file === null) return notFound();
    let body: Buffer;
    try {
      // Caminho validado acima; os arquivos entram no bundle só por `outputFileTracingIncludes` (next.config.ts).
      // Sem o ignore, o rastreamento incluiria o projeto inteiro na função.
      body = await readFile(/* turbopackIgnore: true */ file);
    } catch (error) {
      if (isMissingFile(error)) return notFound();
      throw error;
    }
    return new Response(new Uint8Array(body), {
      headers: { ...LAB_HEADERS, 'content-type': CONTENT_TYPES[extname(file)] ?? '' },
    });
  });
}

export const getLab = createLabHandler();
