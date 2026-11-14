// Demonstração conceitual — verificação no navegador (Etapa A). Para cada formato e instante-chave confere:
// valores e estados exibidos (derivados de data.js), selo visível, cartões sem sobreposição e dentro do quadro,
// tamanho mínimo de texto no arquivo final, axe (WCAG 2.2 AA), fontes do DS, nenhuma requisição fora de 127.0.0.1,
// nenhum erro de console, calendário sem dados de outro Titular e determinismo do quadro.
// Uso: node prototypes/luxtory-club-video/check.mjs   (relatório em out/etapa-a/check.json)
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { requestScenario } from './data.js';
import { brl, credits, instant } from './format.js';
import { startServer } from './serve.mjs';

const OUT = new URL('./out/etapa-a/', import.meta.url);
const FORMATS = {
  '16x9': { width: 1280, height: 720, outHeight: 1080 },
  '9x16': { width: 405, height: 720, outHeight: 1920 },
};
const s = requestScenario();
const KEY = [
  { t: 1_000, name: 'inicio', expect: [s.secondHome.name] },
  {
    t: 4_800,
    name: 'calendario',
    expect: ['3 noites', 'Noites de outro Titular', 'Luxchange Request'],
  },
  {
    t: 9_000,
    name: 'revisao',
    expect: [
      credits(s.credits),
      brl(s.feeCents),
      'ilustrativo',
      '24 horas',
      'política comercial aplicável',
      'Etapa conceitual',
    ],
  },
  {
    t: 13_800,
    name: 'pendente',
    expect: [
      'Pendente',
      `Enviada ${instant(s.sentAt)}`,
      `Expira ${instant(s.expiresAt)}`,
      'não ficam bloqueadas',
      credits(s.balances.afterSend.available),
      credits(s.balances.afterSend.held),
    ],
  },
  {
    t: 17_500,
    name: 'recebida',
    expect: ['Request recebida', 'Co-Owner', 'seguem consumidas do Direito de Uso'],
  },
  {
    t: 19_800,
    name: 'revalidacao',
    expect: [
      'Revalidando antes de confirmar',
      'Membership dos dois Titulares',
      'Créditos em Garantia',
    ],
  },
  {
    t: 22_000,
    name: 'confirmacao',
    expect: [
      'Request aceita',
      'Reserva confirmada',
      `Mesma operação · ${instant(s.acceptedAt)}`,
      s.holder.lot.id,
      `Vence ${instant(s.holder.lot.expiresAt)}`,
      credits(s.balances.afterAccept.consumed),
    ],
  },
];
const MIN_TEXT_OUT_PX = { '16x9': 16, '9x16': 30 };

const failures = [];
const fail = (msg) => failures.push(msg);
const report = { formats: {} };
const { origin, close } = await startServer();
const browser = await chromium.launch();

for (const [fmt, vp] of Object.entries(FORMATS)) {
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
  await page.goto(`${origin}/prototypes/luxtory-club-video/?fmt=${fmt}`);
  await page.waitForFunction(() => window.__demo?.ready);
  const fonts = await page.evaluate(() => [
    ...new Set(
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family.replaceAll('"', '')),
    ),
  ]);
  for (const family of ['Newsreader', 'Hanken Grotesk', 'Courier Prime'])
    if (!fonts.includes(family)) fail(`${fmt}: fonte ${family} não carregada`);
  const states = {};
  for (const key of KEY) {
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
    const ids = info.rects.map((r) => r.id);
    if (!ids.length) fail(`${fmt}@${key.t}: nenhum cartão visível`);
    for (const r of info.rects) {
      if (!r.seal) fail(`${fmt}@${key.t}: ${r.id} sem selo de demonstração`);
      if (r.left < 0 || r.top < 0 || r.right > vp.width || r.bottom > vp.height)
        fail(`${fmt}@${key.t}: ${r.id} fora do quadro`);
    }
    for (let i = 0; i < info.rects.length; i++)
      for (let j = i + 1; j < info.rects.length; j++) {
        const [a, b] = [info.rects[i], info.rects[j]];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
          fail(`${fmt}@${key.t}: ${a.id} sobrepõe ${b.id}`);
      }
    // innerText aplica o text-transform do DS (eyebrows em caixa alta): compara sem diferenciar caixa.
    for (const text of key.expect)
      if (!info.text.toLowerCase().includes(text.toLowerCase()))
        fail(`${fmt}@${key.t}: texto esperado ausente: ${text}`);
    const minOut = info.minFont * (vp.outHeight / vp.height);
    if (minOut < MIN_TEXT_OUT_PX[fmt])
      fail(`${fmt}@${key.t}: texto de ${minOut.toFixed(1)} px no arquivo final`);
    if (info.otherStates) fail(`${fmt}: calendário expõe estado de outras datas`);
    // preload: false — o pré-carregamento de CSSOM do axe resolve os @import do DS contra a URL da página (404 falsos).
    const axe = await new AxeBuilder({ page })
      .include('.demo-stage')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ preload: false })
      .analyze();
    for (const v of axe.violations) fail(`${fmt}@${key.t}: axe ${v.id} (${v.nodes.length})`);
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
  const cal = states.calendario.calendar;
  const expectedRange = {
    [s.nights[0]]: 'start',
    [s.nights[1]]: 'night',
    [s.nights[2]]: 'night',
    [s.checkout]: 'end',
  };
  if (JSON.stringify(cal) !== JSON.stringify(expectedRange))
    fail(`${fmt}: faixa do calendário ${JSON.stringify(cal)}`);
  // Determinismo: o mesmo instante, visitado duas vezes por caminhos diferentes, gera os mesmos bytes.
  const shot = async (t) => {
    await page.evaluate((x) => window.__demo.seek(x), t);
    return createHash('sha256')
      .update(await page.screenshot({ omitBackground: true }))
      .digest('hex');
  };
  const h1 = await shot(13_800);
  await shot(2_000);
  const h2 = await shot(13_800);
  if (h1 !== h2) fail(`${fmt}: quadro 13800 ms não determinístico`);
  if (errors.length) fail(`${fmt}: erros de console ${errors.join(' | ')}`);
  if (foreign.length) fail(`${fmt}: requisições externas ${foreign.join(', ')}`);
  report.formats[fmt] = {
    viewport: vp,
    fonts,
    states,
    deterministic: h1 === h2,
    foreignRequests: foreign.length,
    consoleErrors: errors.length,
  };
  await context.close();
}

await browser.close();
await close();
report.failures = failures;
await mkdir(OUT, { recursive: true });
await writeFile(new URL('check.json', OUT), JSON.stringify(report, null, 2));
for (const [fmt, r] of Object.entries(report.formats)) {
  const min = Math.min(...Object.values(r.states).map((x) => x.minTextOutputPx));
  console.log(
    `${fmt}: ${Object.keys(r.states).length} instantes · texto mínimo ${min} px no arquivo · determinístico ${r.deterministic} · fontes ${r.fonts.join(', ')}`,
  );
}
if (failures.length) {
  console.error(`FALHAS (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('check: tudo conforme');
