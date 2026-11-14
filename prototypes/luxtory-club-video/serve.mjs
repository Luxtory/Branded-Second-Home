// Demonstração conceitual — servidor estático local (127.0.0.1) para o palco. Serve só o protótipo, os arquivos do
// Design System de que ele precisa e as fotos públicas usadas como placa de prévia. Módulos ES não carregam por file://.
// Uso: node prototypes/luxtory-club-video/serve.mjs  → http://127.0.0.1:4173/prototypes/luxtory-club-video/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED = [
  'prototypes/luxtory-club-video/',
  'src/design-system/styles/',
  'src/design-system/tokens/',
  'src/design-system/fonts/',
  'src/design-system/brand/logo/',
  'public/images/',
];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const path = normalize(
      decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname),
    ).replace(/^[/\\]+/, '');
    const file = join(ROOT, path.endsWith('/') || path === '' ? join(path, 'index.html') : path);
    const rel = file.slice(ROOT.length).split(sep).join('/');
    if (
      !file.startsWith(ROOT) ||
      !ALLOWED.some((dir) => rel.startsWith(dir)) ||
      !TYPES[extname(file)]
    ) {
      res.writeHead(404).end();
      return;
    }
    let body;
    try {
      body = await readFile(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'content-type': TYPES[extname(file)], 'cache-control': 'no-store' })
      .end(body);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({
        origin: `http://127.0.0.1:${actual}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin } = await startServer(Number(process.env.PORT ?? 4173));
  console.log(`Demonstração conceitual: ${origin}/prototypes/luxtory-club-video/?fmt=16x9`);
  console.log(`Vertical:                ${origin}/prototypes/luxtory-club-video/?fmt=9x16`);
  console.log(
    'Espaço pausa/continua · R reinicia · ?t=<ms> mostra um quadro · ?bg=plate mostra uma placa de prévia',
  );
}
