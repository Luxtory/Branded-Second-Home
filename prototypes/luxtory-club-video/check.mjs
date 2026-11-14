// Demonstração conceitual — verificação no navegador. Para cada sequência (Request, Direct, Luxplus), formato e
// instante-chave do `qa` da sequência confere: valores e estados exibidos (derivados de data.js), selo visível, cartões
// sem sobreposição e dentro do quadro, tamanho mínimo de texto no arquivo final, axe (WCAG 2.2 AA), fontes do DS,
// nenhuma requisição fora de 127.0.0.1, nenhum erro de console, calendário sem dados de outro Titular, varredura de
// sobreposição em todos os quadros e determinismo do quadro.
// Uso: node prototypes/luxtory-club-video/check.mjs [--seq=request,direct,luxplus]   (relatório em out/etapa-a/check.json)
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startServer } from './serve.mjs';

const OUT = new URL('./out/etapa-a/', import.meta.url);
const FORMATS = {
  '16x9': { width: 1280, height: 720, outHeight: 1080 },
  '9x16': { width: 405, height: 720, outHeight: 1920 },
};
const SEQS = (
  process.argv.find((a) => a.startsWith('--seq='))?.slice(6) ?? 'request,direct,luxplus'
).split(',');
const MIN_TEXT_OUT_PX = { '16x9': 16, '9x16': 30 };

const failures = [];
const fail = (msg) => failures.push(msg);
const report = { sequences: {} };
const { origin, close } = await startServer();
const browser = await chromium.launch();

for (const seq of SEQS) {
  const { qa } = await import(`./sequence-${seq}.js`);
  report.sequences[seq] = {};
  for (const [fmt, vp] of Object.entries(FORMATS)) {
    const tag = `${seq} ${fmt}`;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    const foreign = [];
    page.on(
      'console',
      (m) =>
        m.type() === 'error' &&
        !m.text().startsWith('Failed to load resource') &&
        errors.push(m.text()),
    );
    page.on(
      'response',
      (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url().replace(origin, '')}`),
    );
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => !r.url().startsWith(origin) && foreign.push(r.url()));
    await page.goto(`${origin}/prototypes/luxtory-club-video/?seq=${seq}&fmt=${fmt}`);
    await page.waitForFunction(() => window.__demo?.ready);
    const fonts = await page.evaluate(() => [
      ...new Set(
        [...document.fonts]
          .filter((f) => f.status === 'loaded')
          .map((f) => f.family.replaceAll('"', '')),
      ),
    ]);
    // Courier Prime só existe para metadados técnicos (lx-meta, DS §13.3): é exigida onde há metadados.
    const hasMeta = await page.evaluate(() => !!document.querySelector('.lx-meta'));
    for (const family of ['Newsreader', 'Hanken Grotesk', ...(hasMeta ? ['Courier Prime'] : [])])
      if (!fonts.includes(family)) fail(`${tag}: fonte ${family} não carregada`);
    const states = {};
    for (const key of qa.checkpoints) {
      await page.evaluate((t) => window.__demo.seek(t), key.t);
      const info = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('.demo-card')].filter(
          (c) =>
            getComputedStyle(c).visibility === 'visible' &&
            Number(c.style.opacity) > 0.99 &&
            getComputedStyle(c).display !== 'none',
        );
        const rects = visible.map((c) => ({
          id: c.id,
          ...c.getBoundingClientRect().toJSON(),
          seal: !!c.querySelector('.demo-seal')?.offsetHeight,
        }));
        let minFont = Infinity;
        for (const card of visible) {
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const el = walker.currentNode.parentElement;
            if (
              !walker.currentNode.textContent.trim() ||
              !el.offsetHeight ||
              getComputedStyle(el).visibility !== 'visible' ||
              el.closest('caption')
            )
              continue;
            minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
          }
        }
        const text = visible.map((c) => c.innerText).join('\n');
        const ranges = Object.fromEntries(
          [...document.querySelectorAll('[data-day][data-range]')].map((td) => [
            td.dataset.day,
            td.dataset.range,
          ]),
        );
        const otherStates = document.querySelectorAll('[data-day][data-state]').length;
        return { rects, minFont, text, ranges, otherStates };
      });
      if (!info.rects.length) fail(`${tag}@${key.t}: nenhum cartão visível`);
      for (const r of info.rects) {
        if (!r.seal) fail(`${tag}@${key.t}: ${r.id} sem selo de demonstração`);
        if (r.left < 0 || r.top < 0 || r.right > vp.width || r.bottom > vp.height)
          fail(`${tag}@${key.t}: ${r.id} fora do quadro`);
      }
      for (let i = 0; i < info.rects.length; i++)
        for (let j = i + 1; j < info.rects.length; j++) {
          const [a, b] = [info.rects[i], info.rects[j]];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
            fail(`${tag}@${key.t}: ${a.id} sobrepõe ${b.id}`);
        }
      // innerText aplica o text-transform do DS (eyebrows em caixa alta): compara sem diferenciar caixa.
      for (const text of key.expect)
        if (!info.text.toLowerCase().includes(text.toLowerCase()))
          fail(`${tag}@${key.t}: texto esperado ausente: ${text}`);
      // `absent`: textos que ainda não podem estar visíveis naquele instante (ex.: o tempo limpo da assinatura).
      for (const text of key.absent ?? [])
        if (info.text.toLowerCase().includes(text.toLowerCase()))
          fail(`${tag}@${key.t}: texto visível antes da hora: ${text}`);
      const minOut = info.minFont * (vp.outHeight / vp.height);
      if (minOut < MIN_TEXT_OUT_PX[fmt])
        fail(`${tag}@${key.t}: texto de ${minOut.toFixed(1)} px no arquivo final`);
      if (info.otherStates) fail(`${tag}: calendário expõe estado de outras datas`);
      // preload: false — o pré-carregamento de CSSOM do axe resolve os @import do DS contra a URL da página (404 falsos).
      const axe = await new AxeBuilder({ page })
        .include('.demo-stage')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .options({ preload: false })
        .analyze();
      for (const v of axe.violations) fail(`${tag}@${key.t}: axe ${v.id} (${v.nodes.length})`);
      states[key.name] = {
        t: key.t,
        cards: info.rects.map((r) => ({
          id: r.id,
          top: +((r.top / vp.height) * 100).toFixed(1),
          bottom: +((r.bottom / vp.height) * 100).toFixed(1),
          left: +((r.left / vp.width) * 100).toFixed(1),
          right: +((r.right / vp.width) * 100).toFixed(1),
        })),
        minTextOutputPx: +minOut.toFixed(1),
        axeViolations: axe.violations.length,
        calendar: key.name === 'calendario' ? info.ranges : undefined,
      };
    }
    if (qa.calendar) {
      const cal = states.calendario.calendar;
      if (JSON.stringify(cal) !== JSON.stringify(qa.calendar.range))
        fail(`${tag}: faixa do calendário ${JSON.stringify(cal)}`);
    }
    // Transições, quadro a quadro (30 fps): dois cartões que se cruzam nunca ficam visíveis ao mesmo tempo
    // (opacidade > 0,05 nos dois) — é o que mistura textos durante uma troca no mesmo lugar.
    const crossings = await page.evaluate(() => {
      const found = [];
      const step = 1000 / 30;
      for (let t = 0; t <= window.__demo.duration; t += step) {
        window.__demo.seek(t);
        const cards = [...document.querySelectorAll('.demo-card')]
          .filter((c) => c.style.visibility === 'visible' && getComputedStyle(c).display !== 'none')
          .map((c) => ({ id: c.id, o: Number(c.style.opacity), r: c.getBoundingClientRect() }))
          .filter((c) => c.o > 0.05);
        for (let i = 0; i < cards.length; i++)
          for (let j = i + 1; j < cards.length; j++) {
            const [a, b] = [cards[i].r, cards[j].r];
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
              found.push(`${Math.round(t)} ms ${cards[i].id}×${cards[j].id}`);
          }
      }
      return found;
    });
    if (crossings.length)
      fail(`${tag}: cartões sobrepostos em ${crossings.length} quadros: ${crossings.join(', ')}`);
    // Determinismo: o mesmo instante, visitado duas vezes por caminhos diferentes, gera os mesmos bytes.
    const probeT = qa.checkpoints[Math.min(3, qa.checkpoints.length - 1)].t;
    const shot = async (t) => {
      await page.evaluate((x) => window.__demo.seek(x), t);
      return createHash('sha256')
        .update(await page.screenshot({ omitBackground: true }))
        .digest('hex');
    };
    const h1 = await shot(probeT);
    await shot(qa.checkpoints[0].t);
    const h2 = await shot(probeT);
    if (h1 !== h2) fail(`${tag}: quadro ${probeT} ms não determinístico`);
    if (errors.length) fail(`${tag}: erros de console ${errors.join(' | ')}`);
    if (foreign.length) fail(`${tag}: requisições externas ${foreign.join(', ')}`);
    report.sequences[seq][fmt] = {
      viewport: vp,
      fonts,
      states,
      deterministic: h1 === h2,
      overlappingFrames: crossings.length,
      foreignRequests: foreign.length,
      consoleErrors: errors.length,
    };
    await context.close();
  }
}

await browser.close();
await close();
report.failures = failures;
await mkdir(OUT, { recursive: true });
await writeFile(new URL('check.json', OUT), JSON.stringify(report, null, 2));
for (const [seq, formats] of Object.entries(report.sequences))
  for (const [fmt, r] of Object.entries(formats)) {
    const min = Math.min(...Object.values(r.states).map((x) => x.minTextOutputPx));
    console.log(
      `${seq} ${fmt}: ${Object.keys(r.states).length} instantes · texto mínimo ${min} px no arquivo · sobreposição ${r.overlappingFrames} quadros · determinístico ${r.deterministic}`,
    );
  }
if (failures.length) {
  console.error(`FALHAS (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check: tudo conforme');
