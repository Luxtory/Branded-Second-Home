// Placas internas de teste por Second Home (fora do Git, em out/placas/), geradas de forma determinística. Servem só
// para conferir a legibilidade das interfaces sobre imagem; não são footage nem representam o imóvel final:
//   - azzura-noite.jpg: a foto provisória do litoral (Azzura Home) escurecida, para o teste em fundo escuro;
//   - olivar-tarde.png e olivar-noite.png: campos neutros quentes para a Olivar Home (Direct numa tarde de outono,
//     Luxplus numa noite de inverno), sem fingir uma arquitetura que ainda não existe em imagem.
// Uso: chamado por capture.mjs; ou `node prototypes/luxtory-club-video/placas.mjs`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PLATES } from './placas-caminhos.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SIZE = 2400; // cobre 16:9 e 9:16 com folga para o push-in

// Grão fino e estático (como papel ou película): sem textura, o push-in de um gradiente liso não muda quase nada entre
// quadros e a validação de continuidade da placa (capture.mjs) não consegue provar o movimento (mediana 0,002, medido).
const GRAIN = 14;
const GRAIN_BLUR = 1.2;
const field = (c0, c1) =>
  `gradients=s=${SIZE}x${SIZE}:c0=${c0}:c1=${c1}:type=radial:x0=${SIZE * 0.3}:y0=${SIZE * 0.35}:x1=${SIZE}:y1=${SIZE}:n=2:d=1,format=rgb24,noise=alls=${GRAIN}:allf=t,gblur=sigma=${GRAIN_BLUR}`;

const RECIPES = {
  azzuraNoite: [
    '-i',
    `${ROOT}public/images/home/hero/hero-lifestyle.jpg`,
    '-vf',
    'eq=brightness=-0.16:gamma=0.62:saturation=0.8,colorbalance=bs=0.12:bm=0.06:rh=-0.05',
  ],
  olivarTarde: ['-f', 'lavfi', '-i', field('0xcdb88f', '0x6b5f45')],
  olivarNoite: ['-f', 'lavfi', '-i', field('0x806a4c', '0x1a1612')],
};

/** Gera as placas que faltam; `force` regenera todas (depois de mudar uma receita). */
export function ensurePlates({ force = false } = {}) {
  mkdirSync(`${ROOT}prototypes/luxtory-club-video/out/placas/`, { recursive: true });
  for (const [key, args] of Object.entries(RECIPES)) {
    const out = `${ROOT}${PLATES[key]}`;
    if (existsSync(out) && !force) continue;
    const run = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', ...args, '-frames:v', '1', out],
      { encoding: 'utf8' },
    );
    if (run.status !== 0) throw new Error(`Placa ${key} não gerada: ${run.stderr.trim()}`);
  }
  return PLATES;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(ensurePlates({ force: process.argv.includes('--force') }));
