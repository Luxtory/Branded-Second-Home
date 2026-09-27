import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import manifest from '@/design-system/brand/logo/manifest.json';
import { errorResponse } from './errors';
import { withRoute, type RouteContext } from './route';

// Logos do kit oficial servidos byte a byte, só pelas chaves do manifest: o request escolhe a chave, nunca o caminho
// do arquivo (ADR-0003, ADR-0009). O `<img>` do App Shell aponta para cá.
const LOGO_DIR = join(process.cwd(), 'src', 'design-system', 'brand', 'logo');
const CACHE_SECONDS = 86_400;
// Defesa em profundidade para quem abrir o SVG direto: nada além do estilo inline dos próprios arquivos.
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

type LogoKey = keyof typeof manifest.logos;

export interface LogoRouteParams {
  readonly params: Promise<{ family: string; color: string }>;
}

const isLogoKey = (key: string): key is LogoKey => Object.hasOwn(manifest.logos, key);

/** GET /brand/logo/<família>/<cor> — ex.: `horizontal/warm-sand`. Chave fora do manifest → 404. */
export const getLogo = withRoute(
  async (_request: Request, { correlationId }: RouteContext, route: LogoRouteParams) => {
    const { family, color } = await route.params;
    const key = `${family}/${color}`;
    if (!isLogoKey(key)) return errorResponse('ERR_NOT_FOUND', correlationId);
    // Arquivos incluídos no bundle por `outputFileTracingIncludes` (next.config.ts).
    const body = await readFile(
      /* turbopackIgnore: true */ join(LOGO_DIR, manifest.logos[key].file),
    );
    return new Response(new Uint8Array(body), {
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': `public, max-age=${CACHE_SECONDS}`,
        'content-security-policy': SVG_CSP,
      },
    });
  },
);
