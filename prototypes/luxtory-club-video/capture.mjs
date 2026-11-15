// Demonstração conceitual — captura determinística, exportação e validação dos arquivos codificados.
// Etapas: quadros RGBA (transparência + resolução pelos pixels do dispositivo) → prévias H.264 leves (sobre Sand Wash e
// compostas sobre placas com movimento) → um asset curto ProRes 4444 com alfa → stills 4K → validação do que foi
// codificado (codec, alfa, dimensões, fps, duração, quadros, PSNR das bordas e cores) → comparação com captura em
// tempo real na mesma resolução (opcional). Instantes, trechos, placas e cartões amostrados vêm do `qa` de cada sequência.
// Uso: node prototypes/luxtory-club-video/capture.mjs [--seq=request,direct,luxplus] [--fps=30] [--realtime]
// (saída em out/etapa-a/, fora do Git)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { ensurePlates } from './placas.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// --final: exportação para o comercial (selo neutro, sem marcas internas) em out/final/, sem tocar nas evidências.
const FINAL = process.argv.includes('--final');
const OUT = fileURLToPath(new URL(FINAL ? './out/final/' : './out/etapa-a/', import.meta.url));
const EVIDENCE = FINAL
  ? `${OUT}evidencias/`
  : fileURLToPath(new URL('./evidencias/etapa-a/', import.meta.url));
const FPS = Number(process.argv.find((a) => a.startsWith('--fps='))?.slice(6) ?? 30);
const SEQS = (
  process.argv.find((a) => a.startsWith('--seq='))?.slice(6) ?? 'request,direct,luxplus'
).split(',');
const tokens = JSON.parse(readFileSync(`${ROOT}src/design-system/tokens/tokens.json`, 'utf8'));
const hex = (value) => value.replace('#', '');
const DEEP = hex(tokens.palette['dark-moroccan-blue'].$value);
const SAND_WASH = hex(tokens.derived['sand-wash'].$value);
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

// Viewport CSS fixo por formato (a legibilidade vem dele); a resolução de saída vem do deviceScaleFactor.
const FORMATS = {
  '16x9': {
    viewport: { width: 1280, height: 720 },
    preview: [1920, 1080],
    master: [3840, 2160],
    focusX: 0.5,
  },
  '9x16': {
    viewport: { width: 405, height: 720 },
    preview: [1080, 1920],
    master: [2160, 3840],
    focusX: 0.62,
  },
};
const H264 = [
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '16',
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
  '-movflags',
  '+faststart',
];
const BT709 = [
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-color_range',
  'tv',
];
const TO_709 = 'scale=out_color_matrix=bt709:out_range=tv';
const FROM_709 = 'scale=in_color_matrix=bt709:in_range=tv';

const ffmpeg = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'pipe'],
  });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(' ')}\n${r.stderr}`);
  return r.stderr.toString();
};
const probe = (file) => {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames,color_space:format=duration,size',
    '-of',
    'json',
    file,
  ]);
  const {
    streams: [st],
    format,
  } = JSON.parse(out);
  return {
    codec: st.codec_name,
    profile: st.profile,
    pixFmt: st.pix_fmt,
    width: st.width,
    height: st.height,
    fps: st.r_frame_rate,
    frames: Number(st.nb_read_frames),
    duration: Number(format.duration),
    colorSpace: st.color_space,
    mb: +(Number(format.size) / 1_048_576).toFixed(1),
  };
};
/** Pixel RGBA de um quadro (decodificado com a matriz BT.709 quando o arquivo é YUV). */
const pixel = (file, frame, x, y, yuv = true) => {
  const vf = `select=eq(n\\,${frame}),${yuv ? `${FROM_709},` : ''}format=rgba,crop=1:1:${x}:${y}`;
  return [
    ...execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      vf,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-',
    ]).subarray(0, 4),
  ];
};
const psnr = (a, b) => {
  const log = ffmpeg([
    '-i',
    a,
    '-i',
    b,
    '-lavfi',
    '[0]format=rgba[x];[1]format=rgba[y];[x][y]psnr',
    '-f',
    'null',
    '-',
  ]);
  const m =
    log.match(/r:(\S+) g:(\S+) b:(\S+) a:(\S+) average:(\S+)/) ??
    ffmpeg([
      '-v',
      'info',
      '-i',
      a,
      '-i',
      b,
      '-lavfi',
      '[0]format=rgba[x];[1]format=rgba[y];[x][y]psnr',
      '-f',
      'null',
      '-',
    ]).match(/r:(\S+) g:(\S+) b:(\S+) a:(\S+) average:(\S+)/);
  const v = (s) => (s === 'inf' ? Infinity : Number(s));
  return { r: v(m[1]), g: v(m[2]), b: v(m[3]), a: v(m[4]) };
};
const near = (got, want, tol) => got.slice(0, 3).every((c, i) => Math.abs(c - want[i]) <= tol);
/** Continuidade: diferença média de luma entre quadros consecutivos numa região [w, h, x, y], por quadro. */
const motion = (file, [w, h, x, y], from = 0, to = Infinity) => {
  const log = `${file}.motion.txt`;
  ffmpeg([
    '-i',
    file,
    '-vf',
    `crop=${w}:${h}:${x}:${y},tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${log}`,
    '-f',
    'null',
    '-',
  ]);
  const values = [...readFileSync(log, 'utf8').matchAll(/YAVG=([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .slice(Math.max(1, from), to);
  rmSync(log);
  const sorted = [...values].sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cv =
    Math.sqrt(values.reduce((sum, v) => sum + (v - median) ** 2, 0) / values.length) / median;
  return {
    frames: values.length,
    median: +median.toFixed(3),
    max: +sorted.at(-1).toFixed(3),
    cv: +cv.toFixed(2),
    still: values.filter((v) => v === 0).length,
  };
};

const failures = [];
const check = (ok, msg) => ok || failures.push(msg);
let report;
mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });
// Placas internas de teste por Second Home (out/placas/), geradas se faltarem.
ensurePlates();
const { origin, close } = await startServer();
const browser = await chromium.launch();
let SEQ = 'request';
const stageUrl = (fmt, extra = '') =>
  `${origin}/prototypes/luxtory-club-video/?seq=${SEQ}&fmt=${fmt}${FINAL ? '&final=1' : ''}${extra}`;

async function openStage(fmt, [width], extra) {
  const { viewport } = FORMATS[fmt];
  const context = await browser.newContext({ viewport, deviceScaleFactor: width / viewport.width });
  const page = await context.newPage();
  await page.goto(stageUrl(fmt, extra));
  await page.waitForFunction(() => window.__demo?.ready);
  return { context, page };
}

for (const seq of SEQS) {
  SEQ = seq;
  const { qa } = await import(`./sequence-${seq}.js`);
  const { stills: STILLS, alpha: ALPHA } = qa;
  const PLATES = qa.plates;
  const edgeCard = qa.edge ?? qa.sample;
  report = { seq, fps: FPS, formats: {} };
  for (const [fmt, spec] of Object.entries(FORMATS)) {
    const [W, H] = spec.preview;
    // A Request mantém os nomes da Etapa A nas evidências versionadas; as outras sequências levam o nome no prefixo.
    const tag = seq === 'request' ? fmt : `${seq}-${fmt}`;
    const dir = `${OUT}frames-${seq}-${fmt}/`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    mkdirSync(`${OUT}stills/`, { recursive: true });

    // 1. Quadros RGBA na resolução da prévia (transparência explícita: omitBackground).
    const { context, page } = await openStage(fmt, spec.preview);
    const duration = await page.evaluate(() => window.__demo.duration);
    const total = Math.round((duration / 1000) * FPS);
    const started = performance.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.__demo.seek(t), (i * 1000) / FPS);
      await page.screenshot({
        path: `${dir}f${String(i).padStart(5, '0')}.png`,
        omitBackground: true,
      });
    }
    const msPerFrame = (performance.now() - started) / total;
    // Pontos de amostragem: interior de um cartão (fundo Deep) e um canto vazio do palco.
    const rectAt = async (sel, t) => {
      await page.evaluate((x) => window.__demo.seek(x), t);
      return page.evaluate((q) => document.querySelector(q).getBoundingClientRect().toJSON(), sel);
    };
    const card = await rectAt(qa.sample.card, qa.sample.at);
    const corner = await rectAt(edgeCard.card, edgeCard.at);
    const holder = await rectAt(qa.motion.card, qa.motion.at);
    await context.close();
    const dpr = W / spec.viewport.width;
    const even = (v) => Math.max(2, Math.floor((v * dpr) / 2) * 2);
    const holderBox = [
      even(holder.width),
      even(holder.height),
      even(holder.left),
      even(holder.top),
    ];
    const inCard = [Math.round((card.left + 4) * dpr), Math.round((card.top + 4) * dpr)];
    const empty = [4, 4];

    // 2. Stills 4K (master) nos instantes-chave, com alfa.
    const master = await openStage(fmt, spec.master);
    for (const [name, t] of Object.entries(STILLS)) {
      await master.page.evaluate((x) => window.__demo.seek(x), t);
      await master.page.screenshot({
        path: `${OUT}stills/${seq}-${fmt}-${name}.png`,
        omitBackground: true,
      });
    }
    await master.context.close();

    // 3. Prévias leves H.264: sobre Sand Wash e compostas sobre placas com push-in suave.
    const frames = ['-framerate', String(FPS), '-i', `${dir}f%05d.png`];
    const files = {
      preview: `${OUT}${seq}-${fmt}-preview.mp4`,
      ...Object.fromEntries(
        Object.keys(PLATES).map((kind) => [kind, `${OUT}${seq}-${fmt}-comp-${kind}.mp4`]),
      ),
      alpha: `${OUT}${seq}-${fmt}-alpha-prores4444.mov`,
    };
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=c=0x${SAND_WASH}:s=${W}x${H}:r=${FPS},format=rgb24`,
      ...frames,
      '-filter_complex',
      `[0][1]overlay=shortest=1:format=rgb,${TO_709},format=yuv420p`,
      ...H264,
      ...BT709,
      files.preview,
    ]);
    const plateMotion = {};
    for (const kind of Object.keys(PLATES)) {
      // Placa de teste com push-in subpixel: perspective com coordenadas em ponto flutuante (zoompan anda em pixels
      // inteiros e trava — medido). Vira um vídeo intermediário, como o footage real, e o alfa é composto sobre ele.
      const still = `${OUT}plate-${fmt}-${kind}.png`;
      const plate = `${OUT}plate-${fmt}-${kind}.mp4`;
      ffmpeg([
        '-i',
        `${ROOT}${PLATES[kind]}`,
        '-vf',
        `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-ow)*${spec.focusX}:(ih-oh)/2`,
        still,
      ]);
      const z = `(0.03*in/${total})`;
      const push = `perspective=x0=W*${z}:y0=H*${z}:x1=W*(1-${z}):y1=H*${z}:x2=W*${z}:y2=H*(1-${z}):x3=W*(1-${z}):y3=H*(1-${z}):interpolation=cubic:sense=source:eval=frame`;
      ffmpeg([
        '-loop',
        '1',
        '-framerate',
        String(FPS),
        '-i',
        still,
        '-frames:v',
        String(total),
        '-vf',
        `${push},${TO_709},format=yuv444p`,
        '-c:v',
        'libx264',
        '-crf',
        '12',
        // Um único keyframe: os I-frames periódicos do x264 criavam pulsos de diferença (quadros 250 e 500, medido).
        '-g',
        String(total),
        ...BT709,
        plate,
      ]);
      plateMotion[kind] = motion(plate, [
        Math.round(W * 0.4),
        Math.round(H * 0.3),
        Math.round(W * 0.3),
        Math.round(H * 0.35),
      ]);
      // Composição em RGB (alfa straight), como num editor: placa decodificada pela mesma matriz BT.709.
      ffmpeg([
        '-i',
        plate,
        ...frames,
        '-filter_complex',
        `[0]${FROM_709},format=rgb24[bg];[bg][1]overlay=shortest=1:format=rgb,${TO_709},format=yuv420p`,
        ...H264,
        ...BT709,
        files[kind],
      ]);
    }
    // 4. Um asset curto com alfa (ProRes 4444, 10 bits, alfa de 16 bits), só do trecho R4. qscale 8 = metade do peso do
    //    padrão com RGB ≥ 50 dB e alfa idêntico (medido); os masters da Etapa C usam a qualidade padrão.
    const startFrame = Math.round((ALPHA.from / 1000) * FPS);
    ffmpeg([
      '-framerate',
      String(FPS),
      '-start_number',
      String(startFrame),
      '-i',
      `${dir}f%05d.png`,
      '-frames:v',
      String(ALPHA.seconds * FPS),
      '-vf',
      `${TO_709},format=yuva444p10le`,
      '-c:v',
      'prores_ks',
      '-profile:v',
      '4444',
      '-qscale:v',
      '8',
      '-alpha_bits',
      '16',
      '-vendor',
      'apl0',
      ...BT709,
      files.alpha,
    ]);

    // 5. Validação dos arquivos codificados.
    const probes = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, probe(f)]));
    for (const k of ['preview', ...Object.keys(PLATES)]) {
      const p = probes[k];
      check(
        p.codec === 'h264' && p.pixFmt === 'yuv420p',
        `${fmt} ${k}: codec/pix_fmt ${p.codec}/${p.pixFmt}`,
      );
      check(p.width === W && p.height === H, `${fmt} ${k}: dimensões ${p.width}x${p.height}`);
      check(
        p.fps === `${FPS}/1` && p.frames === total && Math.abs(p.duration - duration / 1000) < 0.05,
        `${fmt} ${k}: fps/quadros/duração ${p.fps}/${p.frames}/${p.duration}`,
      );
      check(p.colorSpace === 'bt709', `${fmt} ${k}: espaço de cor ${p.colorSpace}`);
    }
    const a = probes.alpha;
    check(
      a.codec === 'prores' && /4444/.test(a.profile) && a.pixFmt.startsWith('yuva444p'),
      `${fmt} alpha: ${a.codec}/${a.profile}/${a.pixFmt}`,
    );
    check(
      a.width === W && a.height === H && a.fps === `${FPS}/1` && a.frames === ALPHA.seconds * FPS,
      `${fmt} alpha: ${a.width}x${a.height} ${a.fps} ${a.frames}`,
    );
    // Fidelidade do alfa e das bordas: quadro do meio do trecho, decodificado, contra o PNG de origem (RGBA).
    // PSNR no quadro do meio (em plena transição: alfa parcial); cores num quadro já assentado da confirmação.
    const mid = Math.floor((ALPHA.seconds * FPS) / 2);
    const settled = Math.round((qa.sample.at / 1000) * FPS) - startFrame;
    // Ponto de amostragem fora do trecho ProRes = configuração errada no `qa`, não amostra vazia silenciosa.
    check(
      settled >= 0 && settled < ALPHA.seconds * FPS,
      `${fmt} alpha: amostra em ${qa.sample.at} ms fora do trecho ${ALPHA.from} ms + ${ALPHA.seconds} s`,
    );
    const decoded = `${OUT}alpha-${seq}-${fmt}-decoded.png`;
    ffmpeg([
      '-i',
      files.alpha,
      '-vf',
      `select=eq(n\\,${mid}),${FROM_709},format=rgba`,
      '-frames:v',
      '1',
      decoded,
    ]);
    const source = `${dir}f${String(startFrame + mid).padStart(5, '0')}.png`;
    const fidelity = psnr(source, decoded);
    check(
      Math.min(fidelity.r, fidelity.g, fidelity.b) >= 40 && fidelity.a >= 50,
      `${fmt} alpha: PSNR ${JSON.stringify(fidelity)}`,
    );
    const colors = {
      alphaCard: pixel(files.alpha, settled, ...inCard),
      alphaEmpty: pixel(files.alpha, settled, ...empty),
      previewCard: pixel(files.preview, Math.round((qa.sample.at / 1000) * FPS), ...inCard),
      previewBackground: pixel(files.preview, Math.round((qa.sample.at / 1000) * FPS), ...empty),
    };
    check(
      near(colors.alphaCard, rgb(DEEP), 2) && colors.alphaCard[3] === 255,
      `${fmt} alpha: cor do cartão ${colors.alphaCard}`,
    );
    // Cartão opaco de quadro inteiro (assinatura): não há palco vazio nem fundo Sand Wash à vista.
    check(
      qa.opaque || colors.alphaEmpty[3] === 0,
      `${fmt} alpha: palco vazio não transparente ${colors.alphaEmpty}`,
    );
    check(
      near(colors.previewCard, rgb(DEEP), 4),
      `${fmt} preview: cor do cartão ${colors.previewCard}`,
    );
    check(
      qa.opaque || near(colors.previewBackground, rgb(SAND_WASH), 4),
      `${fmt} preview: Sand Wash ${colors.previewBackground}`,
    );
    // Continuidade: placa sem travada (nenhum quadro parado; nenhum salto > 3× a mediana que também passe de 0,25 nível
    // de luma, limiar de visibilidade — o zoompan media 2,69) e entrada do cartão do detentor sem quadro repetido.
    for (const [kind, m] of Object.entries(plateMotion))
      check(
        m.still === 0 && m.max <= Math.max(3 * m.median, 0.25),
        `${fmt} placa ${kind}: movimento irregular ${JSON.stringify(m)}`,
      );
    const enterFrom = Math.round((qa.motion.enter[0] / 1000) * FPS) + 1;
    const enterTo = Math.round((qa.motion.enter[1] / 1000) * FPS);
    const uiMotion = motion(files.preview, holderBox, enterFrom, enterTo);
    check(
      uiMotion.still === 0,
      `${fmt} interface: quadro repetido durante a transição ${JSON.stringify(uiMotion)}`,
    );

    // 6. Evidências versionáveis: folha de contato das composições e zoom de borda do alfa sobre as duas placas.
    const at = (t) => Math.round((t / 1000) * FPS);
    const tiles = [];
    for (const kind of Object.keys(PLATES)) {
      for (const [name, t] of Object.entries(STILLS)) {
        const tile = `${OUT}tile-${seq}-${fmt}-${kind}-${name}.png`;
        ffmpeg([
          '-i',
          files[kind],
          '-vf',
          `select=eq(n\\,${at(t)}),${FROM_709},scale=${fmt === '16x9' ? '640:-2' : '-2:640'}:flags=lanczos`,
          '-frames:v',
          '1',
          tile,
        ]);
        tiles.push(tile);
      }
    }
    // Uma linha por placa, os instantes-chave da esquerda para a direita.
    const n = Object.keys(STILLS).length;
    const rows = Object.keys(PLATES).length;
    const row = (r) =>
      `${Array.from({ length: n }, (_, i) => `[${r * n + i}]`).join('')}hstack=inputs=${n}${rows > 1 ? `[r${r}]` : ''}`;
    const sheet = Array.from({ length: rows }, (_, r) => row(r)).join(';');
    // Sem placa (assinatura) não há composição: sem folha de contato nem zoom de borda.
    if (rows)
      ffmpeg([
        ...tiles.flatMap((t) => ['-i', t]),
        '-filter_complex',
        rows > 1
          ? `${sheet};${Array.from({ length: rows }, (_, r) => `[r${r}]`).join('')}vstack=inputs=${rows}`
          : sheet,
        '-frames:v',
        '1',
        '-q:v',
        '4',
        `${EVIDENCE}contato-${tag}.jpg`,
      ]);
    const cx = Math.max(0, Math.round((corner.left - 16) * dpr));
    const cy = Math.max(0, Math.round((corner.top - 12) * dpr));
    const kinds = Object.keys(PLATES);
    const zoom = (i) =>
      `[${i}]select=eq(n\\,${at(edgeCard.at)}),${FROM_709},crop=200:120:${cx}:${cy},scale=800:480:flags=neighbor`;
    if (rows)
      ffmpeg([
        ...kinds.flatMap((kind) => ['-i', files[kind]]),
        '-filter_complex',
        kinds.length > 1
          ? `${kinds.map((_, i) => `${zoom(i)}[z${i}]`).join(';')};${kinds.map((_, i) => `[z${i}]`).join('')}hstack=inputs=${kinds.length}`
          : zoom(0),
        '-frames:v',
        '1',
        `${EVIDENCE}borda-${tag}.png`,
      ]);
    for (const t of tiles) rmSync(t);

    report.formats[fmt] = {
      viewport: spec.viewport,
      devicePixelRatio: { preview: dpr, master: spec.master[0] / spec.viewport.width },
      frames: total,
      msPerFramePreview: +msPerFrame.toFixed(1),
      probes,
      alphaFidelityPsnrDb: fidelity,
      colors,
      expected: { deep: rgb(DEEP), sandWash: rgb(SAND_WASH) },
      plateMotion,
      uiTransitionMotion: uiMotion,
    };
  }
  writeFileSync(`${OUT}validation-${seq}.json`, JSON.stringify({ ...report, failures }, null, 2));
  for (const [fmt, r] of Object.entries(report.formats)) {
    const { preview, alpha } = r.probes;
    console.log(
      `${seq} ${fmt}: ${r.frames} quadros a ${r.msPerFramePreview} ms/quadro · prévia ${preview.width}x${preview.height} ${preview.fps} ${preview.duration}s ${preview.mb} MB · alfa ${alpha.pixFmt} ${alpha.frames} quadros ${alpha.mb} MB · PSNR ${JSON.stringify(r.alphaFidelityPsnrDb)}`,
    );
  }
}

// 7. Comparação: captura em tempo real (screencast do Chromium, como uma gravação de tela) na MESMA resolução 1920×1080.
//    O screencast entrega pixels CSS (com DPR 1,5 saía 1280×720, medido); por isso a viewport aqui é 1920×1080 a
//    DPR 1 — 1920×1080 pixels reais, como gravar um monitor 1080p a 100%. Mede tempo, quedas e alfa, não a composição.
//    Feita na Etapa A; só roda de novo com --realtime.
if (process.argv.includes('--realtime')) {
  SEQ = 'request';
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(stageUrl('16x9', '&play=1'));
  await page.waitForFunction(() => window.__demo?.ready);
  const cdp = await context.newCDPSession(page);
  const stamps = [];
  let firstFrame = null;
  cdp.on('Page.screencastFrame', async (f) => {
    stamps.push(f.metadata.timestamp);
    firstFrame ??= f.data;
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(12_000);
  await cdp.send('Page.stopScreencast');
  await context.close();
  // O screencast só envia quadro quando a tela muda: intervalos > 250 ms são pausas da coreografia, não quedas.
  // Durante o movimento, um intervalo > 40 ms é um quadro atrasado ou perdido em relação a 30 fps.
  const intervals = stamps.slice(1).map((t, i) => (t - stamps[i]) * 1000);
  const gaps = intervals.filter((ms) => ms <= 250).sort((x, y) => x - y);
  const frame = `${OUT}realtime-frame.png`;
  writeFileSync(frame, Buffer.from(firstFrame, 'base64'));
  const p = probe(frame);
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', frame, '-vf', 'format=rgba', '-f', 'rawvideo', '-'],
    { maxBuffer: 64 * 1_048_576 },
  );
  let minAlpha = 255;
  for (let i = 3; i < raw.length; i += 4) minAlpha = Math.min(minAlpha, raw[i]);
  report.realtime = {
    method: 'CDP Page.startScreencast durante a reprodução ao vivo (12 s)',
    frames: stamps.length,
    idlePauses: intervals.length - gaps.length,
    lateDuringMotion: gaps.filter((ms) => ms > 40).length,
    intervalMsDuringMotion: {
      median: +gaps[Math.floor(gaps.length / 2)].toFixed(1),
      p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1),
      max: +gaps.at(-1).toFixed(1),
    },
    resolution: `${p.width}x${p.height}`,
    hasTransparency: minAlpha < 255,
  };
  writeFileSync(`${OUT}realtime.json`, JSON.stringify(report.realtime, null, 2));
  console.log(`tempo real: ${JSON.stringify(report.realtime)}`);
}

await browser.close();
await close();
if (failures.length) {
  console.error(`FALHAS (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('capture: arquivos codificados conformes');
