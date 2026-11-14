import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { secondHomePartnersMessages as text } from '../../src/features/catalog/presentation/i18n/second-home-partners-pt-br';
import { SECOND_HOME_PARTNERS_SECTIONS } from '../../src/features/catalog/presentation/second-home-partners/paths';
import { messages as platformText } from '../../src/features/platform/presentation/i18n/pt-br';
import {
  captureForReview,
  collectConsoleErrors,
  expectResponsive,
  worstContrastUnder,
} from './support/ui';

// Jornada pública Second Home Partners (REQ-105, TECH-057; spec catalog §20). O servidor de E2E usa o envio e o
// limitador determinísticos (tests/support/e2e-server.mjs): nenhum e-mail real. Falhas são simuladas por interceptação.

const PAGE = '/second-home-partner';
const ENDPOINT = '/v1/second-home-partner-contacts';
const CLOSED_SITE = 'http://127.0.0.1:3101';
const PRODUCTION_SITE = 'http://127.0.0.1:3102';
const HERO_TITLE = `${text.hero.title.lead}${text.hero.title.turn}`;
const { conversation, form } = text;

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Parágrafos, cards, etapas, linhas do Club e respostas: os blocos com limite de linhas (catalog §20.2). */
const BLOCKS = [
  text.hero.body,
  ...text.opportunity.paragraphs,
  text.benefits.intro,
  ...text.benefits.items.map((item) => item.text),
  text.benefits.note,
  text.solutions.intro,
  ...text.solutions.items.map((item) => item.text),
  ...text.solutions.note,
  ...text.process.steps.map((step) => step.text),
  ...text.faq.items.map((item) => item.answer),
  conversation.intro,
];

/** Exceções registradas no catalog §20.2: quatro linhas por clareza, a 390 e 1440 px (nenhuma desde 2026-11-13). */
const FOUR_LINE_EXCEPTIONS: readonly string[] = [];

/** Toda a copy visível da página (a das perguntas fica dentro dos disclosures). */
const VISIBLE = [
  text.hero.marker,
  HERO_TITLE,
  text.hero.note,
  text.opportunity.marker,
  `${text.opportunity.title.lead}${text.opportunity.title.turn}`,
  text.benefits.marker,
  ...text.benefits.items.map((item) => item.title),
  text.developments.marker,
  `${text.developments.title.lead}${text.developments.title.turn}`,
  text.developments.intro,
  ...text.developments.items.flatMap((item) => [item.title, item.text]),
  text.developments.note,
  text.solutions.marker,
  ...text.solutions.items.map((item) => item.label),
  text.process.marker,
  ...text.process.steps.map((step) => step.title),
  text.faq.title,
  ...text.faq.items.map((item) => item.question),
  conversation.title,
  conversation.notice,
  conversation.privacy,
  ...BLOCKS.filter((block) => !text.faq.items.some((item) => item.answer === block)),
];

const CONTACT = {
  name: 'Pessoa de Teste',
  company: 'Incorporadora Fictícia E2E',
  email: 'pessoa.teste@exemplo.test',
  development: 'Empreendimento Fictício, Trancoso',
};

const textbox = (page: Page, name: keyof typeof CONTACT) =>
  page.locator('#conversa form').getByRole('textbox', { name: form.labels[name], exact: true });

async function fillContact(page: Page) {
  for (const [name, value] of Object.entries(CONTACT)) {
    await textbox(page, name as keyof typeof CONTACT).fill(value);
  }
  await page.getByRole('radio', { name: form.stages.construction_or_sales }).check();
}

const submitButton = (page: Page) => page.getByRole('button', { name: conversation.submit });

test.describe('Second Home Partners — copy, estrutura e navegação (REQ-105, catalog §20.1–20.2)', () => {
  test('[REQ-105] Master Copy verbatim, seções na ordem, três benefícios e três soluções com o mesmo peso (D-SHP-07, D-SHP-09)', async ({
    page,
  }) => {
    const response = await page.goto(PAGE);
    expect(response?.status()).toBe(200);

    const ids = await page
      .locator('main section[id]')
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(ids).toEqual([...SECOND_HOME_PARTNERS_SECTIONS]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_TITLE);
    await expect(page.locator('h1 em')).toHaveText(text.hero.title.turn);

    const main = normalized((await page.locator('main').textContent()) ?? '');
    for (const line of VISIBLE) expect(main, line).toContain(normalized(line));
    // Participação sem percentual, valor ou número (D-SHP-08), fora os ordinais decorativos das etapas; a gestão das
    // locações fica fora do Club (D-SHP-09).
    const copy = await page.locator('main').evaluate((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      for (const ordinal of clone.querySelectorAll('.lx-ordinal')) ordinal.remove();
      return clone.textContent ?? '';
    });
    expect(copy).not.toMatch(/%|R\$|\d/);
    await expect(page.locator('#beneficios .lx-siblings--trio > .lx-siblings__item')).toHaveCount(
      3,
    );
    // Três soluções com o mesmo peso na lista numerada; a nota separa o Club da gestão de locações (D-SHP-09).
    await expect(page.locator('#solucoes .lx-numbered > .lx-numbered__item')).toHaveCount(3);
    for (const line of text.solutions.note) {
      await expect(page.locator('#solucoes .lx-section-group')).toContainText(line);
    }
  });

  test('[REQ-105] CTA único leva ao formulário; o link secundário leva à oportunidade', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const ctas = page.locator('main').getByRole('link', { name: text.hero.action });
    await expect(ctas).toHaveCount(2);
    for (const href of await ctas.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('href')),
    )) {
      expect(href).toBe('#conversa');
    }
    await expect(page.getByRole('link', { name: text.hero.secondary })).toHaveAttribute(
      'href',
      '#oportunidade',
    );
  });

  test('[REQ-105] navegação própria: nenhum link leva às jornadas B2C ou Brand Partners (D-LX-13)', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    const outside = hrefs.filter((href) => !href.startsWith('#') && !href.startsWith(PAGE));
    expect(outside).toEqual([]);
    const nav = page.getByRole('navigation', { name: text.site.nav });
    for (const label of [text.site.benefits, text.site.howItWorks, text.site.questions]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('[REQ-105] SEO: title, description e canonical; fora de Production não indexável, em Production aberta indexável', async ({
    page,
    request,
  }) => {
    await page.goto(PAGE);
    await expect(page).toHaveTitle(text.metadata.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      text.metadata.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', PAGE);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const production = await request.get(`${PRODUCTION_SITE}${PAGE}`);
    expect(production.status()).toBe(200);
    const body = await production.text();
    expect(body).toMatch(/<meta name="robots" content="index, follow"/);
    expect(body).toContain(text.metadata.description);
  });
});

test.describe('Second Home Partners — gate de UI (ADR-0009, catalog §20.5)', () => {
  test('[REQ-105] nova seção mantém reflow e texto integral com fonte ampliada a 200%', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.evaluate(() => {
      const enlarged = new CSSStyleSheet();
      enlarged.replaceSync('html { font-size: 200%; }');
      document.adoptedStyleSheets.push(enlarged);
      return document.fonts.ready;
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflowing = await page.locator('#empreendimentos').evaluate((section) =>
        [...section.querySelectorAll('.lx-section-head > *, article, article h3, article p')]
          .filter((node) => {
            const box = node.getBoundingClientRect();
            return (
              box.left < 0 ||
              box.right > document.documentElement.clientWidth + 0.5 ||
              node.scrollWidth > node.clientWidth ||
              node.scrollHeight > node.clientHeight + 1
            );
          })
          .map((node) => node.textContent?.trim().slice(0, 60)),
      );
      expect(overflowing, `${width}px com fonte a 200%`).toEqual([]);
    }
  });

  test('[REQ-105] três fotografias correspondentes, cards informativos, enquadramento e reflow de 320 a 1920 px', async ({
    page,
    browser,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(PAGE);
    const section = page.locator('#empreendimentos');
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(
      'Da concepção à entrega. Seu empreendimento pode fazer parte.',
    );
    await expect(section.locator('h2 em')).toHaveText('Seu empreendimento pode fazer parte.');
    await expect(section.getByRole('heading', { level: 3 })).toHaveCount(3);
    await expect(section.locator('a, button, [tabindex]')).toHaveCount(0);
    const files = [
      'second-home-condominio-sob-demanda.webp',
      'empreendimento-em-desenvolvimento.webp',
      'empreendimento-entregue.webp',
    ];
    await expect(section.getByRole('img')).toHaveCount(3);
    for (const [index, file] of files.entries()) {
      const image = section.getByRole('img').nth(index);
      await expect(image).toHaveAttribute('alt', text.developments.items[index]?.alt ?? '');
      await expect(image).toHaveAttribute('width', '1448');
      await expect(image).toHaveAttribute('height', '1086');
      await expect(image).toHaveAttribute('loading', 'lazy');
      await expect(image).toHaveAttribute('sizes', /1024px/);
      const src = new URL((await image.getAttribute('src')) ?? '', 'http://localhost');
      expect(src.pathname).toBe('/_next/image');
      expect(src.searchParams.get('url')).toBe(`/images/second-home-partners/${file}`);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const image of await section.getByRole('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((node: HTMLImageElement) => node.decode());
      }
      const boxes = await section.locator('article').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const image = node.querySelector('img');
          const imageStyle = image === null ? null : getComputedStyle(image);
          const copy = node.querySelector('.lx-development__copy');
          const copyBox = copy?.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            bottom: box.bottom,
            objectFit: imageStyle?.objectFit,
            // A cover crop needs enough source pixels for its height, even when the card is narrow.
            sourceCoversFrame:
              image instanceof HTMLImageElement &&
              Number(new URL(image.currentSrc).searchParams.get('w')) >=
                Math.ceil(Math.max(box.width, box.height * (1448 / 1086))),
            copyFits:
              copyBox !== undefined &&
              copyBox.x >= box.x &&
              copyBox.right <= box.right + 0.5 &&
              copyBox.bottom <= box.bottom + 0.5,
            textFits: [...node.querySelectorAll('h3, p')].every(
              (text) =>
                text.scrollWidth <= text.clientWidth && text.scrollHeight <= text.clientHeight + 1,
            ),
          };
        }),
      );
      const first = boxes[0];
      expect(first).toBeDefined();
      for (const [index, box] of boxes.entries()) {
        expect(box.objectFit, `${width}px: imagem ${index}`).toBe('cover');
        expect(box.sourceCoversFrame, `${width}px: nitidez do recorte ${index}`).toBe(true);
        expect(box.copyFits && box.textFits, `${width}px: texto ${index}`).toBe(true);
        expect(box.width).toBeCloseTo(first?.width ?? 0, 0);
        if (width >= 1024) {
          expect(box.y).toBeCloseTo(first?.y ?? 0, 0);
          expect(box.height).toBeCloseTo(first?.height ?? 0, 0);
        } else if (index > 0) {
          expect(box.y).toBeGreaterThanOrEqual(boxes[index - 1]?.bottom ?? 0);
        }
      }
      if (width === 390 || width === 1440) {
        for (const index of [1, 2, 3]) {
          for (const selector of ['h3', 'p']) {
            expect(
              await worstContrastUnder(page, `#empreendimentos li:nth-child(${index}) ${selector}`),
              `${width}px: contraste card ${index} ${selector}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
        await section.screenshot({ path: test.info().outputPath(`empreendimentos-${width}.png`) });
      }
    }
    // A fresh context prevents a cached, larger tablet image from hiding undersampling below md.
    const coldPage = await browser.newPage({ viewport: { width: 767, height: 900 } });
    try {
      await coldPage.goto(page.url());
      for (const image of await coldPage.locator('#empreendimentos img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((node: HTMLImageElement) => node.decode());
        expect(
          await image.evaluate(
            (node: HTMLImageElement) =>
              Number(new URL(node.currentSrc).searchParams.get('w')) >=
              Math.max(node.clientWidth, node.clientHeight * (1448 / 1086)),
          ),
          '767px: nitidez em carregamento inicial',
        ).toBe(true);
      }
    } finally {
      await coldPage.close();
    }
  });

  test('[REQ-105] axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px, console limpo, CSP com nonce', async ({
    page,
  }) => {
    test.slow();
    const errors = collectConsoleErrors(page);
    const response = await page.goto(PAGE);
    expect(response?.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectResponsive(page, errors);
    await captureForReview(page, 'shp1-home');
  });

  test('[REQ-105] a 320 × 568 o H1 aparece inteiro sem rolagem', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(PAGE);
    const box = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
  });

  test('[REQ-105] blocos com até 3 linhas a 390 e 1440 px e até 4 a 320 px, com as fontes reais', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.locator('details').evaluateAll((nodes) => {
      for (const node of nodes) (node as HTMLDetailsElement).open = true;
    });
    await page.evaluate(() => document.fonts.ready);
    for (const [width, limit] of [
      [320, 4],
      [390, 3],
      [1440, 3],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const block of BLOCKS) {
        const lines = await page
          .locator('main p')
          .filter({ hasText: block })
          .first()
          .evaluate(
            (node) =>
              node.getBoundingClientRect().height /
              Number.parseFloat(getComputedStyle(node).lineHeight),
          );
        const allowed = FOUR_LINE_EXCEPTIONS.includes(block) ? Math.max(limit, 4) : limit;
        expect.soft(lines, `${width}px: ${block}`).toBeLessThanOrEqual(allowed + 0.05);
      }
    }
  });

  test('[WCAG 1.4.3] títulos em Deep e Blue no papel de headline (Warm Sand), com contraste AA no tamanho renderizado', async ({
    page,
  }) => {
    // Texto < 24 px (o peso não é bold) pede 4,5:1; ≥ 24 px é texto grande, 3:1 — o mesmo critério do Brand Partners.
    await page.goto(PAGE);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const titles = await page
        .locator('main :is([data-surface="deep"], [data-surface="blue"]) :is(h1, h2, h3)')
        .evaluateAll((nodes) => {
          const canvas = document.createElement('canvas').getContext('2d', {
            willReadFrequently: true,
          }) as CanvasRenderingContext2D;
          const rgb = (color: string): [number, number, number] => {
            canvas.clearRect(0, 0, 1, 1);
            canvas.fillStyle = color;
            canvas.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
            return [r, g, b];
          };
          const linear = (value: number) => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          };
          const luminance = (color: string) => {
            const [r, g, b] = rgb(color);
            return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
          };
          return nodes.map((node) => {
            const surface = node.closest('[data-surface]') as HTMLElement;
            const style = getComputedStyle(node);
            const roles = getComputedStyle(surface);
            const pair = [luminance(style.color), luminance(roles.backgroundColor)];
            const [high, low] = [Math.max(...pair), Math.min(...pair)];
            return {
              label: `${surface.dataset.surface} · ${node.textContent?.trim().slice(0, 30)}`,
              size: Number.parseFloat(style.fontSize),
              ratio: (high + 0.05) / (low + 0.05),
              color: rgb(style.color).join(),
              body: rgb(roles.getPropertyValue('--lx-color-fg')).join(),
            };
          });
        });
      expect(titles.length).toBeGreaterThanOrEqual(6);
      for (const title of titles) {
        const label = `${title.label} a ${width}px`;
        expect(title.ratio, label).toBeGreaterThanOrEqual(title.size >= 24 ? 3 : 4.5);
        expect(title.color, label).not.toBe(title.body);
      }
    }
  });
});

test.describe('Second Home Partners — formulário (REQ-105, TECH-057, catalog §20.3)', () => {
  test('[REQ-105] validação acessível: resumo, foco no primeiro erro e a fase com mensagem própria; sem envio', async ({
    page,
  }) => {
    let sent = 0;
    await page.route(`**${ENDPOINT}`, async (route) => {
      sent += 1;
      await route.continue();
    });
    await page.goto(PAGE);
    await submitButton(page).click();

    await expect(page.locator('#conversa [role="alert"]')).toContainText(form.errorSummary);
    await expect(textbox(page, 'name')).toBeFocused();
    await expect(textbox(page, 'name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#conversa')).toContainText(form.stageRequired);
    expect(sent).toBe(0);
  });

  test('[REQ-105] envio aceito (202) limpa o formulário e confirma; falha não confirmada preserva os dados', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.route(`**${ENDPOINT}`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ERR_UNAVAILABLE', message: 'x', correlation_id: 'e2e' }),
      }),
    );
    await fillContact(page);
    await submitButton(page).click();
    await expect(page.locator('#conversa')).toContainText(form.outcomes.unconfirmed);
    await expect(textbox(page, 'company')).toHaveValue(CONTACT.company);

    await page.unroute(`**${ENDPOINT}`);
    await submitButton(page).click();
    await expect(page.locator('#conversa')).toContainText(conversation.success);
    await expect(textbox(page, 'company')).toHaveValue('');
  });

  test('[REQ-105] fluxo principal a 390 px com toque: só teclado virtual e toque, aceite confirmado', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(PAGE);
    await page.locator('main').getByRole('link', { name: text.hero.action }).first().tap();
    await fillContact(page);
    await page.getByRole('radio', { name: form.stages.planning_or_launch }).tap();
    await submitButton(page).tap();
    await expect(page.locator('#conversa')).toContainText(conversation.success);
    await context.close();
  });
});

test.describe('Second Home Partners — endpoint e portão fechado (TECH-057, catalog §20.1)', () => {
  test('[TECH-057] a própria origem = 202 no-store; outra origem = 403', async ({
    request,
    baseURL,
  }) => {
    const body = { ...CONTACT, stage: 'delivered_or_operating' };
    const ok = await request.post(ENDPOINT, {
      data: body,
      headers: { origin: baseURL ?? '', 'idempotency-key': randomUUID() },
    });
    expect(ok.status()).toBe(202);
    expect(ok.headers()['cache-control']).toBe('no-store');
    expect(ok.headers()['access-control-allow-origin']).toBeUndefined();

    const foreign = await request.post(ENDPOINT, {
      data: body,
      headers: { origin: 'https://outro.test', 'idempotency-key': randomUUID() },
    });
    expect(foreign.status()).toBe(403);
  });

  test('[REQ-105] fechado: 404 da plataforma sem copy nem metadados no corpo bruto; endpoint 404', async ({
    request,
    page,
  }) => {
    const markers = [
      text.hero.title.lead.trim(),
      text.solutions.note[0] ?? '',
      conversation.title,
      text.metadata.title,
      text.metadata.description,
    ];
    const open = await (await request.get(PAGE)).text();
    for (const marker of markers) expect(open, marker).toContain(marker);

    const response = await request.get(`${CLOSED_SITE}${PAGE}`);
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).toContain(platformText.notFound.title);
    for (const marker of markers) expect(body, marker).not.toContain(marker);
    expect(body).not.toMatch(/rel="canonical"[^>]*second-home-partner/);

    const closedEndpoint = await request.post(`${CLOSED_SITE}${ENDPOINT}`, {
      data: { ...CONTACT, stage: 'planning_or_launch' },
      headers: { origin: CLOSED_SITE, 'idempotency-key': randomUUID() },
    });
    expect(closedEndpoint.status()).toBe(404);

    await page.goto(`${CLOSED_SITE}${PAGE}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(platformText.notFound.title);
  });
});
