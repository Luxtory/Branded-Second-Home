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
// Uso: node prototypes/luxtory-club-video/filme/prova/montar.mjs [--final] [--entrada=<pasta>] [--saida=<pasta>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from '../../serve.mjs';
import { EDL } from './edl.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PROTO = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FINAL = process.argv.includes('--final');
const OUT = arg('saida') ?? join(PROTO, FINAL ? 'out/final/montagem' : 'out/prova');
const FRAMES_DIR = join(PROTO, FINAL ? 'out/final' : 'out/etapa-a');
const ENTRADA = arg('entrada') ?? join(PROTO, 'out/entrada');
const FONT = join(ROOT, 'src/design-system/fonts/hanken-grotesk/hanken-grotesk-latin.woff2');
const { width: W, height: H, fps: FPS } = EDL;
const FRAMES = Math.round((EDL.duration * FPS) / 1000);
const STRIP = 120; // altura da tarja da cópia de revisão (fora do quadro 16:9)
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

/** Quadros da interface: um link por quadro da prova para o quadro capturado (ou para um quadro transparente). */
function linkUiFrames(dir) {
  const blank = join(OUT, 'transparente.png');
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
    const item = EDL.ui.find((u) => t >= u.at && t < u.at + (u.to - u.from));
    let src = blank;
    if (item) {
      const frame = Math.round(((item.from + t - item.at) * FPS) / 1000);
      const framesDir =
        item.seq === 'request' ? `frames-${EDL.fmt}` : `frames-${item.seq}-${EDL.fmt}`;
      src = join(FRAMES_DIR, framesDir, `f${String(frame).padStart(5, '0')}.png`);
      if (!existsSync(src))
        throw new MontagemError(
          `Quadro de interface ausente: ${src}. Rode capture.mjs --seq=${item.seq}${FINAL ? ' --final' : ''} antes da montagem.`,
        );
    }
    symlinkSync(src, join(dir, `${String(k).padStart(5, '0')}.png`));
  }
}

/** Camada editorial: quadros RGBA do palco (?seq=prova), determinísticos como as interfaces. */
async function renderEditorial(dir) {
  const { origin, close } = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: W / 1280,
    });
    await page.goto(
      `${origin}/prototypes/luxtory-club-video/?seq=prova&fmt=${EDL.fmt}${FINAL ? '&final=1' : ''}`,
    );
    await page.waitForFunction(() => window.__demo?.ready);
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

/** Entrada e cadeia de filtro de um plano: footage aprovado, placeholder neutro ou foto com push-in. */
function shotSource(shot, i) {
  const dur = sec(shot.to - shot.from);
  const n = Math.round(((shot.to - shot.from) * FPS) / 1000);
  const file = entrada(shot.asset, ['mov', 'mp4']);
  // Exatamente n quadros: completa clonando o último (footage mais curto) e corta no fim do plano.
  const fit = `setsar=1,tpad=stop_mode=clone:stop=${n},trim=end_frame=${n},setpts=PTS-STARTPTS`;
  if (file)
    return {
      used: `entrada: ${file}`,
      input: ['-t', dur, '-i', file],
      chain: `[${i}:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:in_color_matrix=bt709:flags=lanczos,crop=${W}:${H},format=rgb24,${fit}`,
    };
  const p = shot.placeholder;
  if (p.neutral)
    return {
      used: 'placeholder neutro',
      input: [
        '-f',
        'lavfi',
        '-i',
        // Placeholder sóbrio (luz de janela num interior ao anoitecer), identificado na tarja; nunca footage final.
        `gradients=s=${W}x${H}:c0=0x5b5147:c1=0x0f1215:type=radial:x0=${Math.round(W * 0.18)}:y0=${Math.round(H * 0.35)}:x1=${W}:y1=${H}:d=${dur}:r=${FPS}:n=2:speed=0.002`,
      ],
      chain: `[${i}:v]format=rgb24,noise=alls=4:allf=t,gblur=sigma=3,${fit}`,
    };
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
  return {
    used: `placeholder: ${p.image}`,
    input: ['-loop', '1', '-framerate', String(FPS), '-t', dur, '-i', join(ROOT, p.image)],
    chain:
      `[${i}:v]scale=${W}:-2:flags=lanczos,crop=${W}:${H},format=rgb24,` +
      `perspective=x0='${x}':y0='${y}':x1='${x}+${w}':y1='${y}':x2='${x}':y2='${y}+${h}':` +
      `x3='${x}+${w}':y3='${y}+${h}':interpolation=cubic:eval=frame:sense=source,${fit}`,
  };
}

/** Tarja da cópia de revisão: plano e status do placeholder, narração-guia e timecode (fonte do DS). */
function reviewStrip(tmp) {
  const filters = [`pad=${W}:${H + STRIP}:0:0:color=0x101418`];
  const text = (name, value) => {
    const file = join(tmp, `${name}.txt`);
    writeFileSync(file, value);
    return file;
  };
  const between = (from, to) => `'gte(t,${sec(from)})*lt(t,${sec(to)})'`;
  EDL.shots.forEach((s, i) =>
    filters.push(
      `drawtext=fontfile=${FONT}:textfile=${text(`plano-${i}`, s.label)}:fontsize=22:fontcolor=0xb9c4cb:x=40:y=${H + 20}:enable=${between(s.from, s.to)}`,
    ),
  );
  EDL.vo.forEach((v, i) =>
    filters.push(
      `drawtext=fontfile=${FONT}:textfile=${text(`vo-${i}`, `VO guia — ${v.text}`)}:fontsize=32:fontcolor=white:x=40:y=${H + 60}:enable=${between(v.from, v.to)}`,
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
      `aevalsrc=exprs='${e}':d=${d}:s=${SR},adelay=delays=${s.at}:all=1,apad=whole_dur=${D}[fx${i}]`,
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
  );
  const inputs = [];
  const layers = ['[fx]', '[mar]', '[sala]'];
  const vo = entrada('vo', ['wav']);
  const trilha = entrada('trilha', ['wav']);
  if (vo) {
    inputs.push('-i', vo);
    graph.push(
      `[0:a]aformat=sample_rates=${SR}:channel_layouts=stereo,apad=whole_dur=${D},asplit[vo][vosc]`,
    );
    layers.push('[vo]');
  }
  if (trilha) {
    const idx = vo ? 1 : 0;
    inputs.push('-i', trilha);
    graph.push(
      `[${idx}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,apad=whole_dur=${D}[tr]`,
    );
    if (vo)
      graph.push('[tr][vosc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[trd]');
    layers.push(vo ? '[trd]' : '[tr]');
  } else if (vo) graph.push('[vosc]anullsink');
  graph.push(
    `${layers.join('')}amix=inputs=${layers.length}:normalize=0,atrim=end=${D},` +
      `afade=t=out:st=${sec(EDL.fadeOut.at - 200)}:d=${sec(EDL.fadeOut.dur + 200)}[a]`,
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
    ...EDL.shots
      .filter((s) => !entrada(s.asset, ['mov', 'mp4']))
      .map((s) => `${s.scene} ${s.plan} (footage ${s.asset})`),
    ...(entrada('vo', ['wav']) ? [] : ['voz (vo.wav)']),
    ...(entrada('trilha', ['wav']) ? [] : ['trilha (trilha.wav)']),
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
  const { soften, sharpen, sigma } = EDL.focus;
  const bt709 = `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`;
  const graph = [
    ...shots.map((s, i) => `${s.chain}[s${i}]`),
    `${shots.map((_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0,format=gbrp,split[sharp][soft]`,
    // Desfoque como camada com alfa que entra e sai em fade (bem mais rápido que blend por pixel).
    `[soft]gblur=sigma=${sigma},format=gbrap,fade=t=in:st=${sec(soften.at)}:d=${sec(soften.dur)}:alpha=1,` +
      `fade=t=out:st=${sec(sharpen.at)}:d=${sec(sharpen.dur)}:alpha=1[blur]`,
    `[sharp][blur]overlay=format=rgb[bg]`,
    `[${n}:v]format=rgba,fade=t=out:st=${sec(EDL.uiFadeOut.at)}:d=${sec(EDL.uiFadeOut.dur)}:alpha=1[ui]`,
    `[bg][ui]overlay=format=rgb[c1]`,
    `[c1][${n + 1}:v]overlay=format=rgb,fade=t=out:st=${sec(EDL.fadeOut.at)}:d=${sec(EDL.fadeOut.dur)}` +
      (FINAL ? `,${bt709}[vclean]` : `,split[clean][rev]`),
    ...(FINAL ? [] : [`[clean]${bt709}[vclean]`, `[rev]${reviewStrip(tmp)},${bt709}[vrev]`]),
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
    'slow',
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
    '-filter_complex_script',
    script,
    ...enc('[vclean]', cleanFile()),
    ...(FINAL ? [] : enc('[vrev]', reviewFile())),
  ]);
  return Object.fromEntries(EDL.shots.map((s, i) => [`${s.scene} ${s.plan}`, shots[i].used]));
}

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
      'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,color_space,color_transfer,color_primaries,sample_rate,channels:format=duration',
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
  }
  report.audio = measureLoudness(audio);
  if (!(report.audio.truePeakDbtp <= -1))
    failures.push(`áudio: true peak ${report.audio.truePeakDbtp} dBTP`);
  return { failures, report };
}

function contactSheet(file, sheet, tmp) {
  const times = [1_200, 4_000, 6_400, 8_800, 12_000, 13_600, 15_600, 19_000];
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
      'scale=640:-2:in_color_matrix=bt709',
      png,
    ]);
    return png;
  });
  execFileSync('montage', [
    ...shots,
    '-tile',
    '4x2',
    '-geometry',
    '+4+4',
    '-background',
    '#101418',
    sheet,
  ]);
}

async function main() {
  if (FINAL) preflightFinal();
  const tmp = join(OUT, 'tmp');
  const uiDir = join(OUT, 'ui');
  const edDir = join(OUT, 'editorial');
  for (const dir of [tmp, uiDir, edDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  const t0 = Date.now();
  linkUiFrames(uiDir);
  await renderEditorial(edDir);
  const audioFile = join(OUT, 'audio.wav');
  const audio = buildAudio(audioFile);
  const plates = compose(uiDir, edDir, audioFile, tmp);
  writeSrt(join(OUT, `${EDL.id}-vo-guia.srt`));
  const clean = cleanFile();
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
    failures,
    ms: Date.now() - t0,
  };
  writeFileSync(join(OUT, 'prova.json'), JSON.stringify(result, null, 2));
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    `prova: ${FRAMES} quadros (${EDL.duration / 1000} s) em ${Math.round(result.ms / 1000)} s`,
  );
  for (const [plan, used] of Object.entries(plates)) console.log(`  ${plan}: ${used}`);
  console.log(`  voz: ${audio.voz} · trilha: ${audio.trilha}`);
  console.log(
    `  áudio: ${report.audio.integratedLufs} LUFS integrado · true peak ${report.audio.truePeakDbtp} dBTP`,
  );
  if (failures.length) {
    console.error(`FALHAS (${failures.length}):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('prova: arquivos codificados conformes');
}

await main();
