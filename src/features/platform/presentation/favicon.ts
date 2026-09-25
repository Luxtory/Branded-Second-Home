import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import manifest from '@/design-system/brand/logo/manifest.json';
import { withRoute } from './route';

// Favicon = arquivo oficial `icon/moroccan-blue` do kit (uso previsto no manifest: "Favicon, avatar…"), servido
// byte a byte: a marca nunca é redesenhada nem recolorida (ADR-0003).
const LOGO_DIR = join(process.cwd(), 'src', 'design-system', 'brand', 'logo');
const FAVICON_FILE = manifest.logos['icon/moroccan-blue'].file;
const CACHE_SECONDS = 86_400;

/** GET /favicon.ico — também atende páginas sem `<link rel="icon">`, como o Lab. */
export const getFavicon = withRoute(async () => {
  // Arquivo incluído no bundle por `outputFileTracingIncludes` (next.config.ts).
  const body = await readFile(/* turbopackIgnore: true */ join(LOGO_DIR, FAVICON_FILE));
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
});
