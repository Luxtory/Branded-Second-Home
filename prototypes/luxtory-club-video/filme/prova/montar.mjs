// Demonstração conceitual — montagem da prova de linguagem audiovisual (Etapa C), a partir da EDL (edl.js).
//
// Camadas, de baixo para cima: imagem (footage aprovado de out/entrada quando existir; senão placeholder identificado,
// com push-in por `perspective`) → profundidade (desfoque leve enquanto há interface) → interface (quadros já
// capturados da Request, com alfa) → camada editorial do Design System (sequence-prova.js, com alfa) → fade final.
// Áudio: efeitos e ambientes sintéticos gerados aqui, mais voz e trilha de out/entrada quando existirem (trilha com
// ducking sob a voz).
//
// Saídas em out/prova/:
// - prova-request-16x9.mp4: a composição limpa;
// - prova-request-16x9-revisao.mp4: tarja abaixo do quadro com plano, status do placeholder, narração-guia e timecode;
// - legenda-guia .srt, folha de contato e prova.json (o que entrou, medições).
// Nada sai daqui para serviço externo; nenhum arquivo do repositório é alterado.
//
// Prévia interna é o padrão. `--final` é a exportação para o comercial: recusa antes de renderizar se algum plano
// depender de placeholder ou se faltar voz ou trilha; usa a interface capturada com `capture.mjs --final` (selo neutro
// "Dados ilustrativos") e a camada editorial sem a etiqueta interna; não gera cópia de revisão. Exportar não é publicar:
// a publicação depende da verificação de prontidão do produto e da aprovação da comunicação (PRODUCAO.md §5).
//
// Prova cinematográfica (`--edl=cinema`, edl-cinema.js; PROVA-CINEMATOGRAFICA.md §3): 24 fps, `--fmt=16x9|9x16`,
// interface renderizada do palco na cadência da EDL, imagens estáticas de out/entrada com câmera subpixel
// (superamostragem 2× + `perspective`), footage conformado por retemporização (sem quadros inventados ou descartados) e
// dissolve entre planos (`xfade`). Saídas em out/prova-cinema/.
//
// Uso: node prototypes/luxtory-club-video/filme/prova/montar.mjs [--edl=cinema] [--fmt=16x9|9x16] [--final]
//      [--entrada=<pasta>] [--saida=<pasta>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../serve.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
// `--edl=<nome>` carrega filme/prova/edl-<nome>.js (edlFor(fmt)); sem ele, a prova de montagem da Request (edl.js).
const EDL_NAME = arg('edl');
if (EDL_NAME && !/^[a-z0-9-]+$/.test(EDL_NAME)) throw new Error(`EDL inválida: ${EDL_NAME}`);
const EDL = EDL_NAME
  ? (await import(`./edl-${EDL_NAME}.js`)).edlFor(arg('fmt') ?? '16x9')
  : (await import('./edl.js')).EDL;
const PROTO = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FINAL = process.argv.includes('--final');
// `--rascunho`: inspeção rápida de ritmo e composição (sem superamostragem, codificação rápida, pasta própria);
// nunca vale como prévia de qualidade nem como exportação final.
const DRAFT = process.argv.includes('--rascunho') && !FINAL;
// Caminho absoluto: os quadros repetidos são links simbólicos, que precisam apontar para o arquivo certo.
const OUT =
  (arg('saida') && resolve(arg('saida'))) ??
  join(
    PROTO,
    FINAL
      ? `out/final/${EDL.id}-${EDL.fmt}`
      : `${EDL.out ?? 'out/prova'}${DRAFT ? '-rascunho' : ''}`,
  );
const FRAMES_DIR = join(PROTO, FINAL ? 'out/final' : 'out/etapa-a');
const ENTRADA = arg('entrada') ?? join(PROTO, 'out/entrada');
const FONT = join(ROOT, 'src/design-system/fonts/hanken-grotesk/hanken-grotesk-latin.woff2');
const { width: W, height: H, fps: FPS } = EDL;
const FRAMES = Math.round((EDL.duration * FPS) / 1000);
const STRIP = 120; // altura da tarja da cópia de revisão (fora do quadro)
const VIEWPORT = EDL.fmt === '9x16' ? { width: 405, height: 720 } : { width: 1280, height: 720 };
const VIDEO_EXTS = ['mov', 'mp4'];
const STILL_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const SS = DRAFT ? 1 : 2; // superamostragem do movimento de câmera sobre imagem
const [LABEL_SIZE, VO_SIZE] = EDL.fmt === '9x16' ? [17, 24] : [22, 32]; // tarja da cópia de revisão
const AUDIO = { vo: 'vo', trilha: 'trilha', trilhaIn: 0, ...EDL.audio };
const sec = (ms) => (ms / 1000).toFixed(3);
const probe = (file, entries) =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-of', 'json', ...entries, file], {
      encoding: 'utf8',
    }),
  );

class MontagemError extends Error {}

/** ffmpeg com erro legível: o stderr vira a mensagem. */
function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (run.status !== 0)
    throw new MontagemError(`ffmpeg falhou (${run.status}): ${run.stderr.trim()}`);
}

/** Arquivo de entrada aprovado para um asset (footage, voz, trilha), se existir. */
function entrada(asset, exts) {
  return exts.map((ext) => join(ENTRADA, `${asset}.${ext}`)).find((f) => existsSync(f));
}

/** Asset de um plano: `<asset>-<fmt>` antes de `<asset>`; imagens estáticas só nas EDLs que as aceitam. */
function shotAsset(shot) {
  const exts = EDL.stills ? [...VIDEO_EXTS, ...STILL_EXTS] : VIDEO_EXTS;
  return [`${shot.asset}-${EDL.fmt}`, shot.asset].map((name) => entrada(name, exts)).find(Boolean);
}

const isStill = (file) => STILL_EXTS.some((ext) => file.toLowerCase().endsWith(`.${ext}`));
const ratio = (fraction) => {
  const [num, den = 1] = fraction.split('/').map(Number);
  return num / den;
};

/** Fim de um trecho de interface: a sequência toca de `from` a `to` e congela em `to` por `hold` ms. */
const uiEnd = (u) => u.at + (u.to - u.from) + (u.hold ?? 0);

/**
 * Trecho de interface no instante t (ms) da montagem: instante da sequência (congelado durante a pausa de leitura,
 * `hold`) e opacidade do trecho (`fadeIn`/`fadeOut` em ms; por exemplo, o dissolve da imagem para a assinatura).
 */
function uiAt(t) {
  const u = EDL.ui.find((s) => t >= s.at && t < uiEnd(s));
  if (!u) return null;
  const fadeIn = u.fadeIn ? Math.min(1, (t - u.at) / u.fadeIn) : 1;
  const fadeOut = u.fadeOut ? Math.min(1, (uiEnd(u) - t) / u.fadeOut) : 1;
  return {
    u,
    ms: u.from + Math.min(t - u.at, u.to - u.from),
    opacity: Math.max(0, Math.min(fadeIn, fadeOut)),
  };
}

/** Quadros da interface: um link por quadro da prova para o quadro capturado (ou para um quadro transparente). */
function linkUiFrames(dir) {
  const blank = join(OUT, `transparente-${EDL.fmt}.png`);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0.0:s=${W}x${H},format=rgba`,
    '-frames:v',
    '1',
    blank,
  ]);
  for (let k = 0; k < FRAMES; k++) {
    const t = (k * 1000) / FPS;
    const hit = uiAt(t);
    const item = hit?.u;
    let src = blank;
    if (item) {
      const frame = Math.round((hit.ms * FPS) / 1000);
      // Mesma convenção da captura (capture.mjs): frames-<seq>-<fmt> para todas as sequências.
      const framesDir = `frames-${item.seq}-${EDL.fmt}`;
      src = join(FRAMES_DIR, framesDir, `f${String(frame).padStart(5, '0')}.png`);
      if (!existsSync(src))
        throw new MontagemError(
          `Quadro de interface ausente: ${src}. Rode capture.mjs --seq=${item.seq}${FINAL ? ' --final' : ''} antes da montagem.`,
        );
    }
    symlinkSync(src, join(dir, `${String(k).padStart(5, '0')}.png`));
  }
}

/** Abre o palco de uma sequência no formato da EDL, na resolução de saída. */
async function openStage(browser, origin, query) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: W / VIEWPORT.width,
  });
  await page.goto(
    `${origin}/prototypes/luxtory-club-video/?${query}&fmt=${EDL.fmt}${FINAL ? '&final=1' : ''}`,
  );
  await page.waitForFunction(() => window.__demo?.ready);
  return page;
}

/**
 * Interface renderizada do palco na cadência da EDL (`uiSource: 'stage'`): cada quadro da prova busca o instante exato
 * da sequência, como o capture.mjs faz; nenhuma conversão de cadência. Fora dos trechos, quadro transparente. Na pausa
 * de leitura o quadro é o mesmo: um link para o anterior, sem nova captura.
 */
async function renderUiFrames(dir) {
  const blank = join(OUT, `transparente-${EDL.fmt}.png`);
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0.0:s=${W}x${H},format=rgba`,
    '-frames:v',
    '1',
    blank,
  ]);
  const { origin, close } = await startServer();
  const browser = await chromium.launch();
  const pages = new Map();
  let last = { key: '', file: '' };
  try {
    for (let k = 0; k < FRAMES; k++) {
      const t = (k * 1000) / FPS;
      const file = join(dir, `${String(k).padStart(5, '0')}.png`);
      const hit = uiAt(t);
      if (!hit || hit.opacity <= 0) {
        symlinkSync(blank, file);
        continue;
      }
      const key = `${hit.u.seq}|${hit.ms.toFixed(3)}|${hit.opacity.toFixed(4)}`;
      if (key === last.key) {
        symlinkSync(last.file, file);
        continue;
      }
      if (!pages.has(hit.u.seq))
        pages.set(hit.u.seq, await openStage(browser, origin, `seq=${hit.u.seq}`));
      const page = pages.get(hit.u.seq);
      await page.evaluate(
        ([ms, opacity]) => {
          window.__demo.seek(ms);
          document.querySelector('[data-stage]').style.opacity = String(opacity);
        },
        [hit.ms, hit.opacity],
      );
      await page.screenshot({ path: file, omitBackground: true });
      last = { key, file };
    }
  } finally {
    await browser.close();
    await close();
  }
}

/** Camada editorial: quadros RGBA do palco (?seq=prova), determinísticos como as interfaces. */
async function renderEditorial(dir) {
  const { origin, close } = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await openStage(browser, origin, `seq=prova${EDL_NAME ? `&edl=${EDL_NAME}` : ''}`);
    for (let k = 0; k < FRAMES; k++) {
      await page.evaluate((t) => window.__demo.seek(t), (k * 1000) / FPS);
      await page.screenshot({
        path: join(dir, `${String(k).padStart(5, '0')}.png`),
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
    await close();
  }
}

/** Quadro do master de um instante (ms); os planos são contados por quadro, sem acumular arredondamento. */
const frameAt = (ms) => Math.round((ms * FPS) / 1000);
/** Quadros a mais no fim do plano `i` para o dissolve do plano seguinte (o plano continua por baixo da transição). */
const dissolveFrames = (i) => frameAt(EDL.shots[i + 1]?.dissolve ?? 0);

/**
 * Câmera sobre imagem estática: recorte `[cx, cy, zoom]` normalizado, interpolado em velocidade constante ou com
 * aceleração e desaceleração suaves (`ease: 'smooth'`). Superamostragem 2× antes do `perspective` (subpixel, cúbico) e
 * redução lanczos no fim: sem tremor de arredondamento nem cintilação em movimentos lentos.
 */
function stillMotion(i, n, extra, file, move = {}) {
  // O recorte nunca sai da imagem: centro limitado a [0,5/zoom, 1 − 0,5/zoom] nos extremos (entre eles, a interpolação
  // linear continua dentro, porque o limite é côncavo no zoom). Sem limitação por quadro, que daria partida brusca.
  const inside = ([cx, cy, z]) => {
    const half = 0.5 / z;
    const clamp = (v) => Math.min(1 - half, Math.max(half, v));
    return [clamp(cx), clamp(cy), z];
  };
  const from = inside(move.from ?? [0.5, 0.5, 1]);
  const to = inside(move.to ?? move.from ?? [0.5, 0.5, 1]);
  const [ax, ay] = move.anchor ?? [0.5, 0.5];
  const [w2, h2] = [W * SS, H * SS];
  const last = Math.max(1, n - 1);
  // No dissolve, o movimento linear continua na mesma velocidade; o suave assenta no último quadro do plano.
  const lin = `clip(on/${last},0,${move.ease === 'smooth' ? 1 : ((last + extra) / last).toFixed(6)})`;
  const prog = move.ease === 'smooth' ? `(${lin}*${lin}*(3-2*${lin}))` : lin;
  const lerp = (a, b) => `(${a}+(${b - a})*${prog})`;
  const rw = `(${w2}/${lerp(from[2], to[2])})`;
  const rh = `(${h2}/${lerp(from[2], to[2])})`;
  const x = `clip(${lerp(from[0], to[0])}*${w2}-${rw}/2,0,${w2}-${rw})`;
  const y = `clip(${lerp(from[1], to[1])}*${h2}-${rh}/2,0,${h2}-${rh})`;
  const { streams } = probe(file, [
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
  ]);
  const [{ width: iw, height: ih }] = streams;
  return {
    input: [
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-t',
      sec(((n + extra) * 1000) / FPS),
      '-i',
      file,
    ],
    chain:
      `[${i}:v]scale=${w2}:${h2}:force_original_aspect_ratio=increase:flags=lanczos,` +
      `crop=${w2}:${h2}:(iw-${w2})*${ax}:(ih-${h2})*${ay},format=rgb24,` +
      `perspective=x0='${x}':y0='${y}':x1='${x}+${rw}':y1='${y}':x2='${x}':y2='${y}+${rh}':` +
      `x3='${x}+${rw}':y3='${y}+${rh}':interpolation=cubic:eval=frame:sense=source,` +
      `scale=${W}:${H}:flags=lanczos`,
    // Ampliação efetiva sobre os pixels da fonte no quadro mais fechado.
    upscale: Math.max(W / iw, H / ih) * Math.max(from[2], to[2]),
    source: `${iw}×${ih}`,
  };
}

/**
 * Footage: retemporização por padrão (cada quadro da fonte vira um quadro do master: 23,976 → +0,1%, 25 → 96%, 30 →
 * 80%, 60 → 40% da velocidade), sem interpolar nem descartar quadros. `conform: 'realtime'` mantém a velocidade
 * descartando ou repetindo quadros e exige verificação visual de judder (fica registrado no relatório).
 */
function footageSource(i, n, extra, file, opts = {}) {
  const { streams } = probe(file, [
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate,avg_frame_rate',
  ]);
  const [v] = streams;
  const srcFps = ratio(
    v.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate,
  );
  const realtime = (opts.conform ?? (EDL.stills ? 'retime' : 'realtime')) === 'realtime';
  const [fx, fy] = opts.focus ?? [0.5, 0.5];
  const frames = n + extra;
  const cadence = realtime ? `fps=${FPS}` : `settb=1/${FPS},setpts=N,fps=${FPS}`;
  const speed = realtime ? 1 : FPS / srcFps;
  return {
    input: [
      '-ss',
      sec(opts.in ?? 0),
      '-t',
      ((frames + 2) / (realtime ? FPS : srcFps)).toFixed(3),
      '-i',
      file,
    ],
    chain:
      `[${i}:v]${cadence},scale=${W}:${H}:force_original_aspect_ratio=increase:in_color_matrix=bt709:flags=lanczos,` +
      `crop=${W}:${H}:(iw-${W})*${fx}:(ih-${H})*${fy},format=rgb24`,
    upscale: Math.max(W / v.width, H / v.height),
    source: `${v.width}×${v.height} a ${srcFps.toFixed(3)} fps`,
    conform: realtime
      ? 'tempo real (quadros repetidos ou descartados): verificar judder'
      : `retemporizado: ${(speed * 100).toFixed(1)}% da velocidade`,
  };
}

/** Entrada e cadeia de filtro de um plano: asset aprovado (footage ou imagem), placeholder neutro ou foto. */
function shotSource(shot, i) {
  const n = frameAt(shot.to) - frameAt(shot.from);
  const extra = dissolveFrames(i);
  const N = n + extra;
  const dur = sec((N * 1000) / FPS);
  // Exatamente N quadros: completa clonando o último (footage mais curto) e corta no fim do plano.
  const fit = `setsar=1,tpad=stop_mode=clone:stop=${N},trim=end_frame=${N},setpts=PTS-STARTPTS,settb=1/${FPS}`;
  const done = (used, src, extraInfo = {}) => ({
    used,
    input: src.input,
    chain: `${src.chain},${fit}`,
    upscale: src.upscale,
    ...extraInfo,
  });
  const file = shotAsset(shot);
  if (file && isStill(file)) {
    const src = stillMotion(i, n, extra, file, shot.move);
    return done(`entrada ${basename(file)} (imagem ${src.source})`, src, { asset: true });
  }
  if (file) {
    const src = footageSource(i, n, extra, file, shot.footage);
    return done(`entrada ${basename(file)} (${src.source}; ${src.conform})`, src, { asset: true });
  }
  const p = shot.placeholder;
  const tagOf = (kind) => (p.note ? p.note : `${kind}${p.image ? `: ${p.image}` : ''}`);
  if (p.neutral) {
    const [c0, c1] = p.colors ?? ['0x5b5147', '0x0f1215'];
    return done(tagOf('placeholder neutro'), {
      input: [
        '-f',
        'lavfi',
        '-i',
        // Placeholder sóbrio (gradiente de luz, semente fixa para renders reprodutíveis), identificado na tarja.
        `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:type=radial:x0=${Math.round(W * 0.18)}:y0=${Math.round(H * 0.35)}:x1=${W}:y1=${H}:d=${dur}:r=${FPS}:n=2:speed=0.002:seed=7`,
      ],
      chain: `[${i}:v]format=rgb24,noise=alls=4:allf=t,gblur=sigma=3`,
    });
  }
  if (p.move) {
    const src = stillMotion(i, n, extra, join(ROOT, p.image), p.move);
    return done(tagOf('placeholder'), src);
  }
  const [xs, ys, ws] = p.start;
  const [xe, ye, we] = p.end;
  // Progresso do movimento: começa em `moveFrom` (ms no plano; câmera parada antes) e segue em velocidade constante
  // (dolly) ou com aceleração e desaceleração suaves (`ease: 'smooth'`).
  const s0 = Math.round(((p.moveFrom ?? 0) * FPS) / 1000);
  const lin = `clip((on-${s0})/${Math.max(1, n - 1 - s0)},0,1)`;
  const prog = p.ease === 'smooth' ? `(${lin}*${lin}*(3-2*${lin}))` : lin;
  const lerp = (a, b) => `(${a}+(${b - a})*${prog})`;
  const x = lerp(xs, xe);
  const y = lerp(ys, ye);
  const w = lerp(ws, we);
  const h = `(${w}*9/16)`;
  return done(tagOf('placeholder'), {
    input: ['-loop', '1', '-framerate', String(FPS), '-t', dur, '-i', join(ROOT, p.image)],
    chain:
      `[${i}:v]scale=${W}:-2:flags=lanczos,crop=${W}:${H},format=rgb24,` +
      `perspective=x0='${x}':y0='${y}':x1='${x}+${w}':y1='${y}':x2='${x}':y2='${y}+${h}':` +
      `x3='${x}+${w}':y3='${y}+${h}':interpolation=cubic:eval=frame:sense=source`,
  });
}

/** Tarja da cópia de revisão: plano e status do placeholder, narração-guia e timecode (fonte do DS). */
function reviewStrip(tmp, labels) {
  const filters = [`pad=${W}:${H + STRIP}:0:0:color=0x101418`];
  const text = (name, value) => {
    const file = join(tmp, `${name}.txt`);
    writeFileSync(file, value);
    return file;
  };
  const between = (from, to) => `'gte(t,${sec(from)})*lt(t,${sec(to)})'`;
  EDL.shots.forEach((s, i) =>
    filters.push(
      `drawtext=fontfile=${FONT}:textfile=${text(`plano-${i}`, labels[i])}:fontsize=${LABEL_SIZE}:fontcolor=0xb9c4cb:x=40:y=${H + 20}:enable=${between(s.from, s.to)}`,
    ),
  );
  EDL.vo.forEach((v, i) =>
    filters.push(
      `drawtext=fontfile=${FONT}:textfile=${text(`vo-${i}`, `VO guia — ${v.text}`)}:fontsize=${VO_SIZE}:fontcolor=white:x=40:y=${H + 60}:enable=${between(v.from, v.to)}`,
    ),
  );
  filters.push(
    `drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontsize=22:fontcolor=0xb9c4cb:x=w-tw-40:y=${H + 20}`,
  );
  return filters.join(',');
}

/** Loudness integrado (LUFS) e true peak (dBTP) pelo ebur128, que escreve o resumo no stderr. */
function measureLoudness(file) {
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  return {
    integratedLufs: Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]),
    truePeakDbtp: Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]),
  };
}

/** Áudio: efeitos e ambientes sintéticos (+ voz e trilha de out/entrada, se existirem). */
function buildAudio(file) {
  const D = sec(EDL.duration);
  const SR = 48_000;
  const SOUNDS = {
    tap: { d: 0.12, e: '0.22*(sin(2*PI*1250*t)+0.5*sin(2*PI*2500*t))*exp(-t*70)*(1-exp(-t*3000))' },
    check: { d: 0.06, e: '0.08*sin(2*PI*2200*t)*exp(-t*120)*(1-exp(-t*4000))' },
    state: { d: 0.45, e: '0.13*(sin(2*PI*660*t)+0.7*sin(2*PI*990*t))*exp(-t*14)*(1-exp(-t*800))' },
    // Resolução da assinatura: acorde grave e aberto, com decaimento longo, sob a frase da marca.
    resolve: {
      d: 4,
      e: '0.06*(sin(2*PI*196*t)+sin(2*PI*293.66*t)+0.8*sin(2*PI*392*t)+0.5*sin(2*PI*587.33*t))*(1-exp(-t*8))*exp(-t*0.9)',
    },
    chord: {
      d: 3,
      e: '0.075*(sin(2*PI*293.66*t)+sin(2*PI*369.99*t)+sin(2*PI*440*t)+0.6*sin(2*PI*587.33*t))*(1-exp(-t*25))*exp(-t*1.4)',
    },
  };
  // Janela de cada ambiente com rampas de 150 ms nos cortes.
  const windowExpr = (kind) =>
    EDL.ambience
      .filter((a) => a.kind === kind)
      .map(
        (a) =>
          `clip((t-${sec(a.from)})/0.15+${a.from === 0 ? 1 : 0},0,1)*clip((${sec(a.to)}-t)/0.15+${a.to === EDL.duration ? 1 : 0},0,1)`,
      )
      .join('+');
  const graph = [];
  const mix = [];
  EDL.sfx.forEach((s, i) => {
    const { d, e } = SOUNDS[s.kind];
    graph.push(
      // asetpts: o adelay desloca os carimbos de tempo; sem renumerar as amostras, o amix alinhava os efeitos fora do
      // instante e o atrim cortava o fim do áudio (provas até a v7.1: áudio mais curto que o vídeo).
      `aevalsrc=exprs='${e}':d=${d}:s=${SR},adelay=delays=${s.at}:all=1,apad=whole_dur=${D},asetpts=N/SR/TB[fx${i}]`,
    );
    mix.push(`[fx${i}]`);
  });
  graph.push(
    `${mix.join('')}amix=inputs=${mix.length}:normalize=0,pan=stereo|c0=c0|c1=c0[fx]`,
    // Mar: ruído marrom filtrado, em estéreo (duas sementes), com ondulação lenta.
    ...[1, 2].map(
      (seed) =>
        `anoisesrc=c=brown:a=0.5:d=${D}:r=${SR}:seed=${seed * 7},lowpass=f=520,highpass=f=45,volume='0.3*(0.55+0.45*sin(2*PI*0.09*t+${seed}))*(${windowExpr('mar')})':eval=frame[mar${seed}]`,
    ),
    `[mar1][mar2]join=inputs=2:channel_layout=stereo[mar]`,
    // Interior neutro: tom de sala muito baixo.
    `anoisesrc=c=pink:a=0.03:d=${D}:r=${SR}:seed=3,lowpass=f=400,volume='${windowExpr('interior')}':eval=frame,pan=stereo|c0=c0|c1=c0[sala]`,
    // Vento na serra: ruído rosa em banda média, com rajadas lentas.
    `anoisesrc=c=pink:a=0.12:d=${D}:r=${SR}:seed=5,highpass=f=300,lowpass=f=1400,volume='0.5*(0.6+0.4*sin(2*PI*0.17*t))*(${windowExpr('vento') || '0'})':eval=frame,pan=stereo|c0=c0|c1=c0[vento]`,
  );
  const inputs = [];
  const layers = ['[fx]', '[mar]', '[sala]', '[vento]'];
  const vo = entrada(AUDIO.vo, ['wav']);
  const trilha = entrada(AUDIO.trilha, ['wav', 'mp3']);
  if (vo) {
    inputs.push('-i', vo);
    graph.push(
      `[0:a]aformat=sample_rates=${SR}:channel_layouts=stereo,apad=whole_dur=${D},asplit[vo][vosc]`,
    );
    layers.push('[vo]');
  }
  if (trilha) {
    const idx = vo ? 1 : 0;
    inputs.push('-ss', sec(AUDIO.trilhaIn), '-i', trilha);
    graph.push(
      `[${idx}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,afade=t=in:d=0.8,apad=whole_dur=${D}[tr]`,
    );
    if (vo)
      graph.push('[tr][vosc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[trd]');
    layers.push(vo ? '[trd]' : '[tr]');
  } else if (vo) graph.push('[vosc]anullsink');
  graph.push(
    `${layers.join('')}amix=inputs=${layers.length}:normalize=0,atrim=end=${D},` +
      (EDL.audioOut
        ? `afade=t=out:st=${sec(EDL.audioOut.at)}:d=${sec(EDL.audioOut.dur)}[a]`
        : `afade=t=out:st=${sec(EDL.fadeOut.at - 200)}:d=${sec(EDL.fadeOut.dur + 200)}[a]`),
  );
  const mixFile = file.replace(/\.wav$/, '-mix.wav');
  ffmpeg([
    ...inputs,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[a]',
    '-ar',
    String(SR),
    '-c:a',
    'pcm_s24le',
    mixFile,
  ]);
  // Loudness medido, não ganho fixo: com voz, referência de web (−14 LUFS); só com efeitos sintéticos, −20 LUFS para
  // ouvir a prova num nível confortável. O alvo final é decidido por canal (ROTEIRO.md §7); o limitador segura o pico.
  const target = vo ? -14 : -20;
  const gain = target - measureLoudness(mixFile).integratedLufs;
  ffmpeg([
    '-i',
    mixFile,
    '-af',
    `volume=${gain.toFixed(2)}dB,alimiter=limit=0.79:level=false`,
    '-ar',
    String(SR),
    '-c:a',
    'pcm_s24le',
    file,
  ]);
  rmSync(mixFile);
  return {
    voz: vo ?? 'ausente (narração só como legenda-guia)',
    trilha: trilha ?? 'ausente',
    alvoLufs: target,
  };
}

/** Na exportação final, recusa antes de renderizar: nenhum plano depende de placeholder; voz e trilha existem. */
function preflightFinal() {
  const missing = [
    ...EDL.shots.filter((s) => !shotAsset(s)).map((s) => `${s.scene} ${s.plan} (asset ${s.asset})`),
    ...(entrada(AUDIO.vo, ['wav']) ? [] : [`voz (${AUDIO.vo}.wav)`]),
    ...(entrada(AUDIO.trilha, ['wav', 'mp3']) ? [] : [`trilha (${AUDIO.trilha}.wav|mp3)`]),
  ];
  if (missing.length)
    throw new MontagemError(
      `Exportação final recusada: faltam assets aprovados em ${ENTRADA}: ${missing.join('; ')}.`,
    );
}

const cleanFile = () => join(OUT, `${EDL.id}-${EDL.fmt}${FINAL ? '-final' : ''}.mp4`);
const reviewFile = () => join(OUT, `${EDL.id}-${EDL.fmt}-revisao.mp4`);

/** Composição: imagem → profundidade → interface → editorial → fade; cópia limpa (+ cópia de revisão na prévia). */
function compose(uiDir, edDir, audio, tmp) {
  const shots = EDL.shots.map(shotSource);
  const n = shots.length;
  // Cortes secos por concat; dissolve (`shot.dissolve`, ms) por xfade a partir do início do plano que entra (o plano
  // anterior foi renderizado com os quadros a mais).
  const join2 = EDL.shots.some((s) => s.dissolve)
    ? EDL.shots.slice(1).map((s, k) => {
        const i = k + 1;
        const a = i === 1 ? '[s0]' : `[v${i - 1}]`;
        const out = i === n - 1 ? '' : `[v${i}]`;
        const op = s.dissolve
          ? `xfade=transition=fade:duration=${(frameAt(s.dissolve) / FPS).toFixed(6)}:offset=${(frameAt(s.from) / FPS).toFixed(6)}`
          : `concat=n=2:v=1:a=0,settb=1/${FPS}`;
        return `${a}[s${i}]${op}${out}`;
      })
    : [`${shots.map((_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0`];
  const labels = EDL.shots.map((s, i) =>
    s.label
      ? s.label
      : `${s.scene} · ${s.plan}${EDL.fmt === '9x16' ? '' : ` ${s.what}`} · ${shots[i].used}`,
  );
  const { soften, sharpen, sigma, windows } = EDL.focus;
  const bt709 = `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`;
  // Desfoque como camada com alfa (bem mais rápido que blend por pixel). Uma janela (soften → sharpen) por fades; várias
  // janelas (`windows`, uma por bloco de interface) por uma máscara de baixa resolução calculada no tempo e ampliada.
  const maskInput = n + 3;
  const blur = windows
    ? [
        `[${maskInput}:v]format=gray,geq=lum='255*clip(${windows
          .map(
            (w) =>
              `clip((T-${sec(w.from)})/${sec(w.ramp)},0,1)*clip((${sec(w.to)}-T)/${sec(w.ramp)},0,1)`,
          )
          .join('+')},0,1)',scale=${W}:${H},format=gray[fmask]`,
        `[soft]gblur=sigma=${sigma},format=gbrap[softa]`,
        `[softa][fmask]alphamerge[blur]`,
      ]
    : [
        `[soft]gblur=sigma=${sigma},format=gbrap,fade=t=in:st=${sec(soften.at)}:d=${sec(soften.dur)}:alpha=1,` +
          `fade=t=out:st=${sec(sharpen.at)}:d=${sec(sharpen.dur)}:alpha=1[blur]`,
      ];
  const uiFade = EDL.uiFadeOut
    ? `,fade=t=out:st=${sec(EDL.uiFadeOut.at)}:d=${sec(EDL.uiFadeOut.dur)}:alpha=1`
    : '';
  const endFade = EDL.fadeOut
    ? `,fade=t=out:st=${sec(EDL.fadeOut.at)}:d=${sec(EDL.fadeOut.dur)}`
    : '';
  const graph = [
    ...shots.map((s, i) => `${s.chain}[s${i}]`),
    ...join2.slice(0, -1),
    `${join2.at(-1)},format=gbrp,split[sharp][soft]`,
    ...blur,
    `[sharp][blur]overlay=format=rgb[bg]`,
    `[${n}:v]format=rgba${uiFade}[ui]`,
    `[bg][ui]overlay=format=rgb[c1]`,
    `[c1][${n + 1}:v]overlay=format=rgb${endFade}` +
      (FINAL ? `,${bt709}[vclean]` : `,split[clean][rev]`),
    ...(FINAL
      ? []
      : [`[clean]${bt709}[vclean]`, `[rev]${reviewStrip(tmp, labels)},${bt709}[vrev]`]),
  ];
  const script = join(tmp, 'grafo.txt');
  writeFileSync(script, graph.join(';\n'));
  const enc = (map, file) => [
    '-map',
    map,
    '-map',
    `${n + 2}:a`,
    '-frames:v',
    String(FRAMES),
    '-c:v',
    'libx264',
    '-preset',
    DRAFT ? 'veryfast' : 'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-c:a',
    'aac',
    '-b:a',
    '256k',
    '-movflags',
    '+faststart',
    file,
  ];
  ffmpeg([
    ...shots.flatMap((s) => s.input),
    '-framerate',
    String(FPS),
    '-i',
    join(uiDir, '%05d.png'),
    '-framerate',
    String(FPS),
    '-i',
    join(edDir, '%05d.png'),
    '-i',
    audio,
    ...(windows
      ? ['-f', 'lavfi', '-i', `color=c=black:s=32x18:r=${FPS}:d=${sec(EDL.duration)}`]
      : []),
    '-filter_complex_script',
    script,
    ...enc('[vclean]', cleanFile()),
    ...(FINAL ? [] : enc('[vrev]', reviewFile())),
  ]);
  return EDL.shots.map((s, i) => ({
    plan: `${s.scene} ${s.plan}`,
    used: shots[i].used,
    asset: Boolean(shots[i].asset),
    upscale: shots[i].upscale && Number(shots[i].upscale.toFixed(3)),
  }));
}

// Ampliação acima disso sobre um asset aprovado tende a amaciar a 100% em 1080p (PROVA-CINEMATOGRAFICA.md §4): aviso na
// prévia, recusa na exportação final.
const MAX_UPSCALE = 1.35;
const upscaleIssues = (plates) =>
  plates
    .filter((p) => p.asset && p.upscale > MAX_UPSCALE)
    .map((p) => `${p.plan}: ampliação ${p.upscale}× sobre a fonte (máximo ${MAX_UPSCALE}×)`);

/** Legenda-guia da narração (SRT), para ouvir a montagem com a voz definitiva depois. */
function writeSrt(file) {
  const tc = (ms) => {
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')},${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
  };
  writeFileSync(
    file,
    EDL.vo.map((v, i) => `${i + 1}\n${tc(v.from)} --> ${tc(v.to)}\n${v.text}\n`).join('\n'),
  );
}

/** Validação do que foi codificado: formato, cadência, quadros, cor, áudio (loudness e true peak) e folha de contato. */
function validate(files, audio) {
  const failures = [];
  const report = {};
  for (const [name, file, height] of files) {
    const info = probe(file, [
      '-count_frames',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,color_space,color_transfer,color_primaries,sample_rate,channels,duration:format=duration',
    ]);
    const v = info.streams.find((s) => s.codec_type === 'video');
    const a = info.streams.find((s) => s.codec_type === 'audio');
    report[name] = { video: v, audio: a, duration: Number(info.format.duration) };
    if (v.width !== W || v.height !== height) failures.push(`${name}: ${v.width}x${v.height}`);
    if (v.r_frame_rate !== `${FPS}/1`) failures.push(`${name}: cadência ${v.r_frame_rate}`);
    if (Number(v.nb_read_frames) !== FRAMES)
      failures.push(`${name}: ${v.nb_read_frames} quadros (esperado ${FRAMES})`);
    if (v.color_space !== 'bt709' || v.color_primaries !== 'bt709')
      failures.push(`${name}: cor ${v.color_space}`);
    if (!a || a.sample_rate !== '48000' || a.channels !== 2)
      failures.push(`${name}: áudio ${JSON.stringify(a)}`);
    // Áudio do começo ao fim do vídeo (tolerância de um quadro mais o priming do AAC).
    else if (Math.abs(Number(a.duration) - EDL.duration / 1000) > 1 / FPS + 0.05)
      failures.push(`${name}: áudio de ${a.duration} s para ${EDL.duration / 1000} s de vídeo`);
  }
  report.audio = measureLoudness(audio);
  if (!(report.audio.truePeakDbtp <= -1))
    failures.push(`áudio: true peak ${report.audio.truePeakDbtp} dBTP`);
  return { failures, report };
}

function contactSheet(file, sheet, tmp) {
  const times = EDL.contact;
  const shots = times.map((t, i) => {
    const png = join(tmp, `contato-${i}.png`);
    ffmpeg([
      '-ss',
      sec(t),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'scale=-2:360:in_color_matrix=bt709',
      png,
    ]);
    return png;
  });
  execFileSync('montage', [
    ...shots,
    '-tile',
    `4x${Math.ceil(times.length / 4)}`,
    '-geometry',
    '+4+4',
    '-background',
    '#101418',
    sheet,
  ]);
}

async function main() {
  if (FINAL) preflightFinal();
  // Pastas de trabalho por formato: 16:9 e 9:16 podem renderizar ao mesmo tempo na mesma saída.
  const tmp = join(OUT, `tmp-${EDL.fmt}`);
  const uiDir = join(OUT, `ui-${EDL.fmt}`);
  const edDir = join(OUT, `editorial-${EDL.fmt}`);
  for (const dir of [tmp, uiDir, edDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  const t0 = Date.now();
  if (EDL.uiSource === 'stage') await renderUiFrames(uiDir);
  else linkUiFrames(uiDir);
  await renderEditorial(edDir);
  const audioFile = join(OUT, `audio-${EDL.fmt}.wav`);
  const audio = buildAudio(audioFile);
  const plates = compose(uiDir, edDir, audioFile, tmp);
  writeSrt(join(OUT, `${EDL.id}-vo-guia.srt`));
  const clean = cleanFile();
  const warnings = upscaleIssues(plates);
  const { failures, report } = validate(
    [['limpa', clean, H], ...(FINAL ? [] : [['revisao', reviewFile(), H + STRIP]])],
    audioFile,
  );
  contactSheet(clean, join(OUT, `contato-${EDL.id}-${EDL.fmt}.jpg`), tmp);
  const result = {
    edl: EDL.id,
    export: FINAL ? 'final' : 'prévia interna',
    frames: FRAMES,
    seconds: EDL.duration / 1000,
    plates,
    audio,
    report,
    warnings,
    failures: FINAL ? [...failures, ...warnings] : failures,
    ms: Date.now() - t0,
  };
  writeFileSync(
    join(OUT, EDL.out ? `prova-${EDL.fmt}.json` : 'prova.json'),
    JSON.stringify(result, null, 2),
  );
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    `prova: ${FRAMES} quadros (${EDL.duration / 1000} s) em ${Math.round(result.ms / 1000)} s`,
  );
  for (const { plan, used, upscale } of plates)
    console.log(`  ${plan}: ${used}${upscale ? ` · ampliação ${upscale.toFixed(2)}×` : ''}`);
  for (const w of warnings) console.warn(`  AVISO: ${w}`);
  console.log(`  voz: ${audio.voz} · trilha: ${audio.trilha}`);
  console.log(
    `  áudio: ${report.audio.integratedLufs} LUFS integrado · true peak ${report.audio.truePeakDbtp} dBTP`,
  );
  if (result.failures.length) {
    console.error(`FALHAS (${result.failures.length}):\n- ${result.failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('prova: arquivos codificados conformes');
}

await main();
