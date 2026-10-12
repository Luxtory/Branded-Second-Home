import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { hasForbiddenTerm } from '../../src/features/catalog/domain/terminology';
import { brandPartnersMessages as text } from '../../src/features/catalog/presentation/i18n/brand-partners-pt-br';
import {
  BRAND_PARTNERS_HOME_SECTIONS,
  BRAND_PARTNERS_HOW_SECTIONS,
} from '../../src/features/catalog/presentation/brand-partners/paths';
import { messages as platformText } from '../../src/features/platform/presentation/i18n/pt-br';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// Jornada pública Brand Partners (REQ-028, TECH-057; spec catalog §14). O servidor de E2E usa o envio e o limitador
// determinísticos (tests/support/e2e-server.mjs): nenhum e-mail real. Falhas do servidor são simuladas por
// interceptação; o servidor real responde aos envios bem-sucedidos.

const HOME = '/brand-partner';
const HOW = '/brand-partner/como-funciona';
const ENDPOINT = '/v1/brand-partner-contacts';
const CTA = 'Explore o potencial residencial da sua marca.';
const { conversation } = text.home;
/** H1 da Home: `lead` + a virada em itálico (`turn`). */
const HERO_TITLE = `${text.home.hero.title.lead}${text.home.hero.title.turn}`;
/** Lugares de fotografia em produção (D5, `P-BP-03`), na ordem do DOM: placeholders estruturais até o ensaio. */
const HOME_MEDIA = ['m1', 'm3', 'm2', 'm5'];
const HOW_MEDIA = ['m4'];

const CONTACT = {
  name: 'Pessoa de Teste',
  brand: 'Marca Fictícia E2E',
  email: 'pessoa.teste@exemplo.test',
  message: 'Primeira linha da mensagem.\nSegunda linha.',
  website: 'https://marca-ficticia.test',
};

/** O objeto sem a chave `key` (texto que não aparece na página carregada). */
const without = <T extends object>(value: T, key: keyof T) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

/** Todos os textos de um nó do i18n, sem a marcação de destaque (`**`). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value.replaceAll('**', '')];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();

async function mainText(page: Page) {
  return normalized((await page.locator('main').textContent()) ?? '');
}

type Field = keyof typeof text.form.labels;

/** Campo do formulário pelo rótulo (o "Site da marca" traz "(opcional)" no nome acessível). */
const field = (page: Page, name: Field) =>
  page
    .locator('#conversa form')
    .getByRole('textbox', { name: text.form.labels[name], exact: name !== 'website' });

async function fillContact(page: Page, values: Partial<typeof CONTACT> = CONTACT) {
  for (const [name, value] of Object.entries(values)) await field(page, name as Field).fill(value);
}

const submitButton = (page: Page) => page.getByRole('button', { name: conversation.submit });

/** Registra a chave e o corpo de cada envio; `respond` decide a resposta (padrão: segue para o servidor real). */
async function interceptContacts(
  page: Page,
  respond: (route: Route, call: number) => Promise<void> = (route) => route.continue(),
) {
  const sent: { key: string; body: string }[] = [];
  await page.route(`**${ENDPOINT}`, async (route) => {
    const request = route.request();
    sent.push({ key: request.headers()['idempotency-key'] ?? '', body: request.postData() ?? '' });
    await respond(route, sent.length);
  });
  return sent;
}

const errorBody = (code: string) =>
  JSON.stringify({ code, message: 'erro simulado', correlation_id: 'e2e-correlation' });

test.describe('Brand Partners — gate de UI (ADR-0009)', () => {
  for (const [name, path] of [
    ['home', HOME],
    ['how', HOW],
  ] as const) {
    test(`[REQ-028] ${name}: axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px, console limpo, CSP com nonce`, async ({
      page,
    }) => {
      test.slow();
      const errors = collectConsoleErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectResponsive(page, errors);
      await captureForReview(page, `bp1-${name}`);
    });
  }
});

test.describe('Brand Partners — copy, estrutura e navegação (REQ-028, catalog §14.1–14.2)', () => {
  test('[REQ-028] Home: copy BP1.1 verbatim, seções na ordem, só o diagrama como imagem, placeholders M1–M5 identificados', async ({
    page,
  }) => {
    await page.goto(HOME);
    const ids = await page
      .locator('main > section')
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(ids).toEqual([...BRAND_PARTNERS_HOME_SECTIONS]);
    const content = await mainText(page);
    // A mensagem de sucesso só aparece depois do aceite.
    for (const line of strings({ ...text.home, conversation: without(conversation, 'success') })) {
      expect(content, line).toContain(normalized(line));
    }
    expect(hasForbiddenTerm(content)).toBe(false);
    // Nenhuma fotografia aprovada ainda: a única imagem é o diagrama original de solução, com o alt aprovado no B2C.
    await expect(page.locator('main img')).toHaveCount(1);
    await expect(page.locator('main img')).toHaveAttribute('alt', text.media.solutionDiagram);
    const slots = await page
      .locator('[data-media-placeholder]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-media-placeholder')));
    expect(slots).toEqual(HOME_MEDIA);
    for (const slot of HOME_MEDIA) {
      await expect(
        page.getByText(text.media.placeholders[slot as keyof typeof text.media.placeholders]),
      ).toHaveCount(1);
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_TITLE);
  });

  test('[REQ-028] Como funciona: copy verbatim, índice com âncoras reais, Owner e Co-Owner com o mesmo peso', async ({
    page,
  }) => {
    await page.goto(HOW);
    const ids = await page
      .locator('main > section')
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(ids).toEqual([...BRAND_PARTNERS_HOW_SECTIONS]);
    const content = await mainText(page);
    // `indexLabel` é o nome acessível do índice, não texto visível.
    const opening = without(text.howItWorks.opening, 'indexLabel');
    for (const line of strings({ ...text.howItWorks, opening })) {
      expect(content, line).toContain(normalized(line));
    }
    expect(hasForbiddenTerm(content)).toBe(false);
    const slots = await page
      .locator('[data-media-placeholder]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-media-placeholder')));
    expect(slots).toEqual(HOW_MEDIA);
    const index = page.getByRole('navigation', { name: text.howItWorks.opening.indexLabel });
    const anchors = await index
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(anchors).toEqual(BRAND_PARTNERS_HOW_SECTIONS.slice(1).map((id) => `#${id}`));
    for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
    const sides = page.locator('[data-pair="modality"] .lx-comparison__item');
    await expect(sides).toHaveCount(2);
    const fonts = await sides
      .locator('h5')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontSize));
    expect(new Set(fonts).size).toBe(1);
  });

  test('[REQ-028] CTAs: Hero → PROBLEM; "Explore…" → formulário da Home nas duas páginas; links para o Como funciona', async ({
    page,
  }) => {
    await page.goto(HOME);
    await expect(page.locator('#inicio a.lx-button')).toHaveAttribute('href', '#expansao');
    await expect(page.getByRole('link', { name: CTA })).toHaveAttribute('href', '#conversa');
    await page.getByRole('link', { name: CTA }).click();
    await expect(page.getByRole('heading', { name: conversation.title })).toBeInViewport();
    await expect(page.getByRole('link', { name: text.home.mechanism.link })).toHaveAttribute(
      'href',
      `${HOW}#percurso`,
    );
    await expect(page.getByRole('link', { name: text.home.governance.link })).toHaveAttribute(
      'href',
      `${HOW}#governanca`,
    );

    await page.goto(HOW);
    await page.getByRole('link', { name: CTA }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME}#conversa$`));
    await expect(page.getByRole('heading', { name: conversation.title })).toBeInViewport();
  });

  test('[REQ-028] navegação B2B própria: header, menu e rodapé só levam a destinos Brand Partners', async ({
    page,
  }) => {
    for (const path of [HOME, HOW]) {
      await page.goto(path);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
      for (const href of hrefs) {
        expect(href.startsWith('#') || href.startsWith(HOME), href).toBe(true);
      }
      const nav = page.getByRole('navigation', { name: text.site.nav }).first();
      for (const label of [text.site.brandPartners, text.site.howItWorks, text.site.contact]) {
        await expect(nav.getByRole('link', { name: label, exact: true })).toBeAttached();
      }
      // D4: Contato é a ação da navegação (botão secundário), no fim da barra junto da nav.
      await expect(nav.getByRole('link', { name: text.site.contact, exact: true })).toHaveClass(
        /lx-button--secondary/,
      );
      await expect(page.locator('header.lx-header')).toHaveClass(/lx-header--nav-end/);
    }
  });

  test('[REQ-028] SEO: title, description, canonical e metadados sociais; Preview/local não indexáveis', async ({
    page,
  }) => {
    for (const [path, meta] of [
      [HOME, text.metadata.home],
      [HOW, text.metadata.howItWorks],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(meta.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        meta.description,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${path}$`),
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        meta.title,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    }
  });

  test('[TECH-057] CSP: páginas com nonce pelo proxy; o asset real do logo mantém a CSP própria', async ({
    request,
  }) => {
    for (const path of [HOME, HOW]) {
      const response = await request.get(path);
      expect(response.headers()['content-security-policy']).toContain("'nonce-");
    }
    const logo = await request.get('/brand/logo/horizontal/warm-sand');
    expect(logo.status()).toBe(200);
    expect(logo.headers()['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
  });

  test('menu do celular (MobileNav Core): Contato fecha o menu e leva ao formulário; Esc devolve o foco', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectConsoleErrors(page);
    await page.goto(HOME);
    const button = page.getByRole('button', { name: text.site.openMenu });
    await button.click();
    const dialog = page.getByRole('dialog', { name: text.site.menu });
    await expect(
      dialog.getByRole('link', { name: text.site.brandPartners, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    if (process.env.UI_CAPTURE_DIR) {
      await dialog.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/bp1-menu-390.png` });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await dialog.getByRole('link', { name: text.site.contact }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: conversation.title })).toBeInViewport();
    expect(errors).toEqual([]);
  });
});

test.describe('Brand Partners — formulário (REQ-028, TECH-057, catalog §14.3–14.5)', () => {
  test('[REQ-028] validação acessível: resumo, foco no primeiro erro, aria-invalid e aria-describedby; sem envio', async ({
    page,
  }) => {
    const sent = await interceptContacts(page);
    await page.goto(`${HOME}#conversa`);
    await submitButton(page).click();

    const summary = page.getByRole('alert').filter({ hasText: text.form.errorSummary });
    await expect(summary).toBeVisible();
    for (const label of ['name', 'brand', 'email', 'message'] as const) {
      await expect(summary.getByRole('link', { name: text.form.labels[label] })).toBeVisible();
    }
    const name = field(page, 'name');
    await expect(name).toBeFocused();
    // O campo focado não fica sob o header fixo (WCAG 2.4.11).
    const header = await page.locator('header').boundingBox();
    const focused = await name.boundingBox();
    expect(focused?.y ?? 0).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0));
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(text.form.fields.required);
    await expect(field(page, 'website')).not.toHaveAttribute('aria-invalid', 'true');

    await fillContact(page, { ...CONTACT, email: 'sem-arroba', website: 'marca.test' });
    await submitButton(page).click();
    await expect(field(page, 'email')).toBeFocused();
    await expect(field(page, 'email')).toHaveAccessibleDescription(text.form.fieldInvalid.email);
    await expect(field(page, 'website')).toHaveAccessibleDescription(
      text.form.fieldInvalid.website,
    );
    if (process.env.UI_CAPTURE_DIR) {
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/bp1-form-validation-1280.png` });
    }
    expect(sent).toHaveLength(0);
  });

  test('[TECH-057] só pelo teclado: Tab percorre os cinco campos e o botão (o honeypot fica fora); Enter envia e o foco termina no botão', async ({
    page,
  }) => {
    await page.goto(`${HOME}#conversa`);
    await field(page, 'name').focus();
    await page.keyboard.type(CONTACT.name);
    for (const name of ['brand', 'email', 'message', 'website'] as const) {
      await page.keyboard.press('Tab');
      await expect(field(page, name)).toBeFocused();
      await page.keyboard.type(CONTACT[name]);
    }
    await page.keyboard.press('Tab');
    await expect(submitButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(conversation.success)).toBeVisible();
    // Envio pelo botão: desabilitado durante o envio, ele recebe o foco de volta quando o envio termina.
    await expect(submitButton(page)).toBeFocused();

    // Envio pelo Enter num campo: o foco também termina no botão.
    await fillContact(page);
    const accepted = page.waitForResponse((r) => r.url().endsWith(ENDPOINT) && r.status() === 202);
    await field(page, 'website').press('Enter');
    await accepted;
    await expect(field(page, 'website')).toHaveValue('');
    await expect(submitButton(page)).toBeFocused();
  });

  test('[TECH-057] envio não confirmado (503): dados preservados; retry com a mesma chave e o mesmo conteúdo', async ({
    page,
  }) => {
    const sent = await interceptContacts(page, (route, call) =>
      call === 1
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: errorBody('ERR_UNAVAILABLE'),
          })
        : route.continue(),
    );
    await page.goto(`${HOME}#conversa`);
    await fillContact(page);
    await submitButton(page).click();

    await expect(page.getByText(text.form.outcomes.unconfirmed)).toBeVisible();
    for (const [name, value] of Object.entries(CONTACT)) {
      await expect(field(page, name as Field)).toHaveValue(value);
      await expect(field(page, name as Field)).toBeEditable();
    }
    await expect(submitButton(page)).toBeEnabled();
    await expect(submitButton(page)).toBeFocused();
    if (process.env.UI_CAPTURE_DIR) {
      await page.getByText(text.form.outcomes.unconfirmed).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/bp1-form-error-1280.png` });
    }
    await submitButton(page).click();
    await expect(page.getByText(conversation.success)).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[1]?.body).toBe(sent[0]?.body);
  });

  test('[TECH-057] falha de rede também não é sucesso; conteúdo alterado depois da falha = nova tentativa', async ({
    page,
  }) => {
    const sent = await interceptContacts(page, (route, call) =>
      call === 1 ? route.abort('failed') : route.continue(),
    );
    await page.goto(`${HOME}#conversa`);
    await fillContact(page);
    await submitButton(page).click();
    await expect(page.getByText(text.form.outcomes.unconfirmed)).toBeVisible();

    await field(page, 'message').fill('Mensagem revisada.');
    await submitButton(page).click();
    await expect(page.getByText(conversation.success)).toBeVisible();
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
  });

  test('[TECH-057] 429 e 409: mensagens próprias; o conflito não troca a chave sozinho', async ({
    page,
  }) => {
    const sent = await interceptContacts(page, (route, call) => {
      if (call === 1) {
        return route.fulfill({
          status: 429,
          headers: { 'retry-after': '30' },
          contentType: 'application/json',
          body: errorBody('ERR_RATE_LIMITED'),
        });
      }
      if (call === 2) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: errorBody('ERR_IDEMPOTENCY_CONFLICT'),
        });
      }
      return route.continue();
    });
    await page.goto(`${HOME}#conversa`);
    await fillContact(page);
    await submitButton(page).click();
    await expect(page.getByText(text.form.outcomes.rateLimited)).toBeVisible();
    await submitButton(page).click();
    await expect(page.getByText(text.form.outcomes.conflict)).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);

    await submitButton(page).click();
    await expect(page.getByText(conversation.success)).toBeVisible();
    expect(sent[2]?.key).not.toBe(sent[1]?.key);
  });

  test('[TECH-057] envio em curso: campos somente leitura, botão desabilitado, sem envio concorrente; o 202 limpa', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent = await interceptContacts(page, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${HOME}#conversa`);
    await fillContact(page);
    await submitButton(page).click();
    await expect(page.getByText(text.form.sending)).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();
    for (const name of Object.keys(CONTACT) as Field[]) {
      await expect(field(page, name)).not.toBeEditable();
    }
    // Digitar durante o envio não altera o conteúdo; nem o clique forçado nem o Enter num campo enviam de novo.
    await field(page, 'message').focus();
    await page.keyboard.type(' — alterado durante o envio');
    await expect(field(page, 'message')).toHaveValue(CONTACT.message);
    await submitButton(page).click({ force: true });
    await field(page, 'name').press('Enter');

    release();
    await expect(page.getByText(conversation.success)).toBeVisible();
    for (const name of Object.keys(CONTACT) as Field[]) {
      await expect(field(page, name)).toHaveValue('');
      await expect(field(page, name)).toBeEditable();
    }
    await expect(submitButton(page)).toBeEnabled();
    // O envio terminou com o foco num campo (Enter durante o envio); ainda assim o foco termina no botão.
    await expect(submitButton(page)).toBeFocused();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual(CONTACT);
  });
});

test.describe('Brand Partners — formulário no celular com toque (ADR-0009)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('[REQ-028] fluxo principal a 390 px com toque: aceite confirmado, campos limpos, nada em URL ou storage', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const sent = await interceptContacts(page);
    await page.goto(`${HOME}#conversa`);
    await expect(page.getByRole('textbox')).toHaveCount(5);
    await fillContact(page);
    await submitButton(page).tap();

    await expect(page.getByText(conversation.success)).toBeVisible();
    for (const name of Object.keys(text.form.labels) as Field[]) {
      await expect(field(page, name)).toHaveValue('');
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual(CONTACT);
    expect(new URL(page.url()).search).toBe('');
    const stored = await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: '' });
    if (process.env.UI_CAPTURE_DIR) {
      await page.getByText(conversation.success).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/bp1-form-success-390.png` });
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Brand Partners — endpoint público (TECH-057)', () => {
  const key = () => randomUUID();

  test('[TECH-057] origem ausente ou de outro domínio = 403; a própria origem = 202 no-store, sem CORS', async ({
    request,
    baseURL,
  }) => {
    const data = { ...CONTACT };
    const withoutOrigin = await request.post(ENDPOINT, {
      headers: { 'idempotency-key': key() },
      data,
    });
    expect(withoutOrigin.status()).toBe(403);
    const foreign = await request.post(ENDPOINT, {
      headers: { 'idempotency-key': key(), origin: 'https://evil.test' },
      data,
    });
    expect(foreign.status()).toBe(403);
    expect(foreign.headers()['access-control-allow-origin']).toBeUndefined();

    const accepted = await request.post(ENDPOINT, {
      headers: { 'idempotency-key': key(), origin: baseURL ?? '' },
      data,
    });
    expect(accepted.status()).toBe(202);
    expect(await accepted.json()).toEqual({ status: 'accepted' });
    expect(accepted.headers()['cache-control']).toBe('no-store');
    expect(accepted.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('[TECH-057] campo extra = 400; honeypot = 403; mesma chave com outro conteúdo = 409', async ({
    request,
    baseURL,
  }) => {
    const headers = (idempotency: string) => ({
      'idempotency-key': idempotency,
      origin: baseURL ?? '',
    });
    const extra = await request.post(ENDPOINT, {
      headers: headers(key()),
      data: { ...CONTACT, cnpj: '1' },
    });
    expect(extra.status()).toBe(400);
    const trapped = await request.post(ENDPOINT, {
      headers: headers(key()),
      data: { ...CONTACT, _trap: 'x' },
    });
    expect(trapped.status()).toBe(403);

    const reused = key();
    expect(
      (await request.post(ENDPOINT, { headers: headers(reused), data: CONTACT })).status(),
    ).toBe(202);
    expect(
      (await request.post(ENDPOINT, { headers: headers(reused), data: CONTACT })).status(),
    ).toBe(202);
    const changed = await request.post(ENDPOINT, {
      headers: headers(reused),
      data: { ...CONTACT, message: 'Outra mensagem.' },
    });
    expect(changed.status()).toBe(409);
  });
});

test.describe('Brand Partners — portão fechado (REQ-028, catalog §14.1)', () => {
  // Mesmo build servido com BRAND_PARTNERS_SITE=closed (playwright.config.ts → CLOSED_PORT).
  const CLOSED_SITE = 'http://127.0.0.1:3101';

  // Copy das duas páginas, metadados (title/description/OG/Twitter) e os marcadores exclusivos da BP1.1: o atributo
  // dos placeholders de mídia e os rótulos M1–M5.
  const MARKERS = {
    [HOME]: [
      text.home.hero.title.lead.trim(),
      text.home.problem.title.turn,
      text.home.brand.chain.statement,
      text.home.living.closing.statement,
      text.home.conversation.title,
      conversation.success,
      text.metadata.home.title,
      text.metadata.home.description,
      'data-media-placeholder',
      text.media.placeholders.m1,
    ],
    [HOW]: [
      text.howItWorks.opening.title,
      text.howItWorks.governance.title,
      text.howItWorks.club.limit,
      text.howItWorks.next.title,
      text.metadata.howItWorks.title,
      text.metadata.howItWorks.description,
      CTA,
      text.media.placeholders.m4,
    ],
  };

  test('[REQ-028] controle: com o portão aberto, os marcadores aparecem no corpo bruto da resposta', async ({
    request,
  }) => {
    for (const [path, markers] of Object.entries(MARKERS)) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const body = await response.text();
      for (const marker of markers) expect(body, `${path}: ${marker}`).toContain(marker);
    }
  });

  test('[REQ-028] fechado: 404 da plataforma sem copy, metadados nem payload da BP1 no corpo bruto', async ({
    request,
    page,
  }) => {
    for (const [path, markers] of Object.entries(MARKERS)) {
      const response = await request.get(`${CLOSED_SITE}${path}`);
      expect(response.status()).toBe(404);
      const body = await response.text();
      expect(body).toContain(platformText.notFound.title);
      for (const marker of markers) expect(body, `${path}: ${marker}`).not.toContain(marker);
      expect(body).not.toMatch(/rel="canonical"[^>]*brand-partner/);
    }

    await page.goto(`${CLOSED_SITE}${HOME}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(platformText.notFound.title);
    await expect(page).not.toHaveTitle(text.metadata.home.title);
    await expect(page.getByText(text.home.hero.title.lead.trim())).toHaveCount(0);
  });

  test('[TECH-057] fechado: o endpoint segue respondendo 404 no-store, antes de qualquer etapa', async ({
    request,
  }) => {
    const response = await request.post(`${CLOSED_SITE}${ENDPOINT}`, {
      headers: { 'idempotency-key': randomUUID(), origin: CLOSED_SITE },
      data: CONTACT,
    });
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('ERR_NOT_FOUND');
    expect(response.headers()['cache-control']).toBe('no-store');
  });
});
