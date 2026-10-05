import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasForbiddenTerm } from '../../src/features/catalog/domain/terminology';
import { HOME_SECTIONS } from '../../src/features/catalog/presentation/discovery/paths';
import { discoveryMessages } from '../../src/features/catalog/presentation/i18n/discovery-pt-br';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// Discovery público B2C (docs/specs/catalog.md §13): Home, Como funciona, Coleção e Concept, lidos como `anon`, sobre o
// catálogo semeado por catalog.seed.ts (estado "há Edition publicada"; os outros estados do CTA são provados em
// tests/features/catalog/presentation/catalog-actions.test.tsx). Gate de UI do ADR-0009 em toda página.

// Preço por dia ou por noite no texto renderizado (REQ-100), além da guarda canônica de terminologia.
const PRICE_PER_DAY = /R\$\s?[\d.,]+\s*(\/|por)\s*(dia|noite)\b/i;

// O seed é lido dentro dos testes: o arquivo só existe depois do projeto `seed`.
const PAGE_NAMES = ['home', 'howItWorks', 'collection', 'withEdition', 'withoutEdition'] as const;
type PageName = (typeof PAGE_NAMES)[number];

function pathOf(name: PageName): string {
  const seed = readSeed();
  const paths: Record<PageName, string> = {
    home: '/',
    howItWorks: '/como-funciona',
    collection: '/colecao',
    withEdition: `/colecao/${seed.withEdition.id}`,
    withoutEdition: `/colecao/${seed.withoutEdition.id}`,
  };
  return paths[name];
}

// textContent: inclui as respostas fechadas do FAQ.
const visibleText = async (page: Page) => (await page.locator('body').textContent()) ?? '';
const EDITIONS_CTA = 'Conheça as Home Editions';

test.describe('Hero congelada — comportamento acessível', () => {
  const counter = (page: Page) => page.locator('.lx-home-hero__counter');
  const hero = (page: Page) => page.locator('.lx-home-hero');

  async function openHero(page: Page, reduced = false) {
    const start = new Date('2026-10-04T00:00:00Z');
    await page.clock.install({ time: start });
    // Pause before navigation, leaving headroom for install's running clock.
    await page.clock.pauseAt(new Date(start.getTime() + 60_000));
    await page.goto('/');
    await expect(counter(page)).toHaveAttribute(
      'aria-label',
      reduced ? 'Reproduzir carrossel' : 'Pausar carrossel',
    );
  }

  async function leaveHero(page: Page) {
    await page.locator(`section#${HOME_SECTIONS[1]} h2`).hover();
  }

  test('avança a cada 8000 ms e percorre os três slides na ordem, voltando ao primeiro', async ({
    page,
  }) => {
    await openHero(page);
    await page.clock.runFor(7999);
    await expect(counter(page)).toHaveText('01');
    await page.clock.runFor(1);
    await expect(counter(page)).toHaveText('02');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('03');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('01');
  });

  test('o contador pausa e só a reprodução explícita retoma após a pausa manual', async ({
    page,
  }) => {
    await openHero(page);
    await counter(page).click();
    await expect(counter(page)).toHaveAttribute('aria-pressed', 'true');
    await leaveHero(page);
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await counter(page).focus();
    await counter(page).press('Enter');
    await expect(counter(page)).toHaveAttribute('aria-label', 'Pausar carrossel');
    await leaveHero(page);
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('02');
    await counter(page).press('Space');
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
  });

  test('setas por teclado navegam com retorno circular e conservam foco visível', async ({
    page,
  }) => {
    await openHero(page);
    const previous = hero(page).getByRole('button', { name: 'Imagem anterior' });
    const next = hero(page).getByRole('button', { name: 'Próxima imagem' });
    await previous.focus();
    await previous.press('Enter');
    await expect(counter(page)).toHaveText('03');
    await next.focus();
    await next.press('Space');
    await expect(counter(page)).toHaveText('01');
    await expect(next).toBeFocused();
    expect(await next.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    expect(await next.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
  });

  test('entrar por teclado pausa e sair da região não reinicia automaticamente', async ({
    page,
  }) => {
    await openHero(page);
    await hero(page).getByRole('link').focus();
    await page.keyboard.press('Tab');
    await expect(hero(page).getByRole('button', { name: 'Imagem anterior' })).toBeFocused();
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.getByRole('button', { name: 'Abrir menu' }).focus();
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await counter(page).focus();
    await counter(page).press('Space');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('02');
  });

  test('hover suspende temporariamente e não desfaz a pausa manual ou de foco', async ({
    page,
  }) => {
    await openHero(page);
    await hero(page).getByRole('heading', { level: 1 }).hover();
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await leaveHero(page);
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('02');
    await counter(page).click();
    await hero(page).getByRole('heading', { level: 1 }).hover();
    await leaveHero(page);
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('02');
    await counter(page).focus();
    await counter(page).press('Enter');
    await hero(page).getByRole('link').focus();
    await page.keyboard.press('Tab');
    await hero(page).getByRole('heading', { level: 1 }).hover();
    await leaveHero(page);
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('02');
  });

  test('preferência nativa reduzida inicial impede autoplay, drift e fade e permite setas', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHero(page, true);
    await page.clock.runFor(24000);
    await expect(counter(page)).toHaveText('01');
    await hero(page).getByRole('button', { name: 'Próxima imagem' }).click();
    await expect(counter(page)).toHaveText('02');
    expect(
      await hero(page)
        .locator('.lx-home-hero__slide--active .lx-home-hero__image')
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    expect(
      await hero(page)
        .locator('.lx-home-hero__slide--active')
        .evaluate((node) => getComputedStyle(node).transitionDuration),
    ).toBe('0s');
  });

  test('alteração da preferência nativa suspende autoplay e preserva a pausa escolhida', async ({
    page,
  }) => {
    await openHero(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(counter(page)).toHaveAttribute('aria-label', 'Pausar carrossel');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('02');
    await counter(page).click();
    await leaveHero(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('02');
  });

  test('opt-in inicial do DS e sua remoção preservam a pausa escolhida por teclado', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener(
        'DOMContentLoaded',
        () => document.documentElement.setAttribute('data-motion', 'reduce'),
        { once: true },
      );
    });
    await openHero(page, true);
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
    await expect(counter(page)).toHaveAttribute('aria-label', 'Pausar carrossel');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('02');
    await hero(page).getByRole('link').focus();
    await page.keyboard.press('Tab');
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduce'));
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('02');
  });

  test('opt-in do DS em runtime interrompe timer e movimento sem afetar navegação manual', async ({
    page,
  }) => {
    await openHero(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduce'));
    await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
    await page.clock.runFor(16000);
    await expect(counter(page)).toHaveText('01');
    await hero(page).getByRole('button', { name: 'Próxima imagem' }).click();
    await expect(counter(page)).toHaveText('02');
    expect(
      await hero(page)
        .locator('.lx-home-hero__slide--active .lx-home-hero__image')
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    expect(
      await hero(page)
        .locator('.lx-home-hero__slide--active')
        .evaluate((node) => getComputedStyle(node).transitionDuration),
    ).toBe('0s');
    await leaveHero(page);
    await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
    await expect(counter(page)).toHaveAttribute('aria-label', 'Pausar carrossel');
    await page.clock.runFor(8000);
    await expect(counter(page)).toHaveText('03');
  });

  for (const width of [390, 1440]) {
    test(`alvos invisíveis a ${width}px têm ao menos 44px, funcionam fora da caixa visível e não se sobrepõem`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await openHero(page);
      const regions = await hero(page)
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect();
            const hit = getComputedStyle(button, '::after');
            if (hit.content === 'none') {
              return {
                visibleWidth: box.width,
                visibleHeight: box.height,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              };
            }
            const transform = new DOMMatrix(hit.transform);
            return {
              visibleWidth: box.width,
              visibleHeight: box.height,
              x: box.x + parseFloat(hit.left) + transform.m41,
              y: box.y + parseFloat(hit.top) + transform.m42,
              width: parseFloat(hit.width),
              height: parseFloat(hit.height),
            };
          }),
        );
      await testInfo.attach('hero-hit-regions', {
        body: JSON.stringify({ viewportWidth: width, regions }, null, 2),
        contentType: 'application/json',
      });
      for (const [index, region] of regions.entries()) {
        expect(region.visibleWidth).toBe(32);
        expect(region.visibleHeight).toBe(32);
        expect(region.width).toBeGreaterThanOrEqual(44);
        expect(region.height).toBeGreaterThanOrEqual(44);
        for (const other of regions.slice(index + 1)) {
          const overlap =
            region.x < other.x + other.width &&
            other.x < region.x + region.width &&
            region.y < other.y + other.height &&
            other.y < region.y + region.height;
          expect(overlap).toBe(false);
        }
      }
      const [previous, pause, next] = regions;
      await page.mouse.click(previous!.x + 1, previous!.y + previous!.height / 2);
      await expect(counter(page)).toHaveText('03');
      await page.mouse.click(next!.x + 1, next!.y + next!.height / 2);
      await expect(counter(page)).toHaveText('01');
      await page.mouse.click(pause!.x + 1, pause!.y + pause!.height / 2);
      await expect(counter(page)).toHaveAttribute('aria-label', 'Reproduzir carrossel');
      await leaveHero(page);
      await page.clock.runFor(16000);
      await expect(counter(page)).toHaveText('01');
    });
  }
});

test.describe('Discovery público — gate de UI (ADR-0009)', () => {
  for (const name of PAGE_NAMES) {
    test(`${name}: axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px, console limpo`, async ({
      page,
    }) => {
      test.slow();
      const errors = collectConsoleErrors(page);
      const response = await page.goto(pathOf(name));
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectResponsive(page, errors);
      await captureForReview(page, `w4-${name}`);
    });
  }

  test('menu do celular: foco preso, Esc fecha e devolve o foco ao botão', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Abrir menu' });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Coleção' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Como funciona' })).toBeVisible();
    if (process.env.UI_CAPTURE_DIR) {
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/w4-menu-390.png` });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    expect(errors).toEqual([]);
  });
});

test.describe('Discovery público — jornada a 390 px com toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Home → Home Editions → Concept → Como funciona → Home Editions', async ({ page }) => {
    const seed = readSeed();
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: EDITIONS_CTA }).tap();
    await expect(page).toHaveURL(/\/colecao#home-editions$/);
    await page
      .getByRole('list', { name: 'Home Concepts com Home Edition' })
      .getByRole('link', { name: seed.withEdition.title })
      .tap();
    await expect(page).toHaveURL(new RegExp(`/colecao/${seed.withEdition.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.withEdition.title);
    await page.getByRole('link', { name: 'Entenda como funciona' }).tap();
    await expect(page).toHaveURL(/\/como-funciona$/);
    await page.getByRole('link', { name: EDITIONS_CTA }).tap();
    await expect(page).toHaveURL(/\/colecao#home-editions$/);
    expect(errors).toEqual([]);
  });
});

test.describe('Discovery público — conteúdo', () => {
  test('[REQ-100] [REQ-101] o texto renderizado, com os dados do catálogo, passa pela guarda canônica de terminologia', async ({
    page,
  }) => {
    for (const name of PAGE_NAMES) {
      const path = pathOf(name);
      await page.goto(path);
      const text = await visibleText(page);
      expect(hasForbiddenTerm(text), path).toBe(false);
      expect(PRICE_PER_DAY.test(text), path).toBe(false);
    }
  });

  test('Hero com função de desejo: abre a página; seu único convite desce para a renúncia, sem ação comercial', async ({
    page,
  }) => {
    await page.goto('/');
    const sections = await page
      .locator('main > section[id]')
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    // A ordem da copy do fundador (D-B2C-18): PICTURE (Hero) → PROBLEM → PROMISE → PROOF → PUSH → dúvidas.
    expect(sections).toEqual([...HOME_SECTIONS]);

    const hero = page.locator(`section#${HOME_SECTIONS[0]}`);
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    const invite = hero.getByRole('link');
    await expect(invite).toHaveCount(1);
    await expect(invite).toHaveAttribute('href', `#${HOME_SECTIONS[1]}`);
    const controls = hero.getByRole('button');
    await expect(controls).toHaveCount(3);
    await expect(hero.getByRole('button', { name: 'Imagem anterior' })).toBeVisible();
    await expect(
      hero.getByRole('button', { name: /Pausar carrossel|Reproduzir carrossel/ }),
    ).toBeVisible();
    await expect(hero.getByRole('button', { name: 'Próxima imagem' })).toBeVisible();
  });

  test('[REQ-100] [REQ-101] FAQ da Home: perguntas abrem no lugar e as respostas passam pela guarda de terminologia', async ({
    page,
  }) => {
    await page.goto('/');
    const faq = page.locator(`section#${HOME_SECTIONS.at(-1)}`);
    const questions = faq.locator('summary');
    await expect(questions).toHaveCount(discoveryMessages.home.faq.items.length + 1);
    const expectedNames = [
      ...discoveryMessages.home.faq.items.map((item) => item.question),
      discoveryMessages.home.faq.details.question,
    ];
    for (const [index, name] of expectedNames.entries()) {
      const question = questions.nth(index);
      const disclosure = faq.locator('details').nth(index);
      await expect(question).toHaveAccessibleName(name);
      await question.focus();
      await expect(question).toBeFocused();
      expect(await question.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
      expect(await question.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
      await question.press('Enter');
      await expect(disclosure).toHaveAttribute('open', '');
      await question.press('Space');
      await expect(disclosure).not.toHaveAttribute('open');
      if (index < expectedNames.length - 1) {
        await page.keyboard.press('Tab');
        await expect(questions.nth(index + 1)).toBeFocused();
      }
    }
    const timeshare = faq.locator('details', { hasText: 'A Luxtory é timeshare?' });
    await expect(
      timeshare.getByText(
        'Como Co-Owner, você adquire uma Ação da SPE proprietária do imóvel, com Direito de Uso.',
      ),
    ).toBeHidden();
    await timeshare.locator('summary').click();
    await expect(
      timeshare.getByText(
        'Como Co-Owner, você adquire uma Ação da SPE proprietária do imóvel, com Direito de Uso.',
      ),
    ).toBeVisible();
    const answers = (await faq.textContent()) ?? '';
    expect(hasForbiddenTerm(answers)).toBe(false);
    await questions.last().focus();
    await questions.last().press('Enter');
    await page.keyboard.press('Tab');
    await expect(faq.getByRole('link', { name: 'Como Funciona' })).toBeFocused();
    await expect(faq.getByRole('link', { name: 'Como Funciona' })).toHaveAttribute(
      'href',
      '/como-funciona',
    );
  });

  test('[REQ-022] Concept sem Edition: só no grupo Home Concepts e sem oferta; com Edition, região, modalidade e condições como registradas', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    const withEditions = page.getByRole('list', {
      name: 'Home Concepts com Home Edition',
    });
    const withoutEditions = page.getByRole('list', {
      name: 'Home Concepts sem Home Edition',
    });
    await expect(withEditions.getByRole('link', { name: seed.withEdition.title })).toBeVisible();
    await expect(withEditions.getByRole('link', { name: seed.coOwnerOnly.title })).toBeVisible();
    await expect(
      withoutEditions.getByRole('link', { name: seed.withoutEdition.title }),
    ).toBeVisible();
    // Nenhum Concept nos dois grupos.
    await expect(withoutEditions.getByRole('link', { name: seed.withEdition.title })).toHaveCount(
      0,
    );
    await expect(withEditions.getByRole('link', { name: seed.withoutEdition.title })).toHaveCount(
      0,
    );

    await page.goto(pathOf('withoutEdition'));
    await expect(page.getByText(discoveryMessages.concept.offer.none)).toBeVisible();
    await expect(page.getByText('Condições comerciais', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Modalidade', { exact: true })).toHaveCount(0);

    await page.goto(pathOf('withEdition'));
    await expect(page.getByRole('heading', { name: seed.withEdition.region })).toBeVisible();
    await expect(page.getByText('Owner ou Co-Owner', { exact: true })).toBeVisible();
    await expect(page.getByText('Cronograma de obra, forma de pagamento')).toBeVisible();
    await expect(page.locator('.lx-credit__name')).toHaveText(seed.withEdition.brandName);
    // "Manifestar interesse" só existe com o formulário (W6; D-B2C-10).
    await expect(page.getByText('Manifestar interesse')).toHaveCount(0);
  });

  test('[REQ-103] Owner e Co-Owner com a mesma estrutura onde aparecem juntos', async ({
    page,
  }) => {
    for (const path of [pathOf('home'), pathOf('howItWorks')]) {
      await page.goto(path);
      const pairs = page
        .locator('.lx-pair')
        .filter({ has: page.getByRole('heading', { name: 'Owner', exact: true }) });
      expect(await pairs.count(), path).toBeGreaterThan(0);
      for (const pair of await pairs.all()) {
        const items = pair.locator('.lx-pair__item');
        await expect(items).toHaveCount(2);
        const owner = items.nth(0);
        const coOwner = items.nth(1);
        const shape = (side: Locator) =>
          side.evaluate((node) => [...node.children].map((child) => child.tagName));
        await expect(owner.getByRole('heading')).toHaveText('Owner');
        await expect(coOwner.getByRole('heading')).toHaveText('Co-Owner');
        expect(await shape(owner), path).toEqual(await shape(coOwner));
      }
    }
  });

  test('[BR-015] [BR-021] Concept sem exposição, com encerramento eficaz ou sem versão aprovada não aparece e responde 404', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    for (const concept of seed.hidden) {
      await expect(page.getByText(concept.title)).toHaveCount(0);
      const response = await page.goto(`/colecao/${concept.id}`);
      expect(response?.status(), concept.title).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('não está aqui');
      await page.goto(pathOf('collection'));
    }
    const invalid = await page.goto('/colecao/nao-e-um-id');
    expect(invalid?.status()).toBe(404);
  });

  test('[D-B2C-16] com Edition publicada, a Home e o Como funciona levam à primeira oferta da Coleção', async ({
    page,
  }) => {
    for (const path of ['/', '/como-funciona']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: EDITIONS_CTA }), path).toHaveAttribute(
        'href',
        '/colecao#home-editions',
      );
      await expect(page.getByRole('link', { name: 'Conheça os Home Concepts' })).toHaveCount(0);
    }
  });

  test('[TECH-100] CSP com nonce nas páginas públicas e no Admin; nenhum link para o Admin nem para Brand Partners', async ({
    page,
  }) => {
    for (const path of ['/', '/colecao', '/entrar']) {
      const response = await page.goto(path);
      const policy = response?.headers()['content-security-policy'] ?? '';
      expect(policy, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(policy, path).toContain("frame-ancestors 'none'");
    }
    for (const name of PAGE_NAMES) {
      await page.goto(pathOf(name));
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
      expect(
        hrefs.filter((href) => /^\/(admin|entrar)|brand-partner|parceir/i.test(href)),
        name,
      ).toEqual([]);
    }
  });
});

test.describe('Admin — conteúdo público identificado (spec catalog §13.5)', () => {
  test('campos publicados levam "Público no site" e a tela diz a consequência antes de confirmar', async ({
    page,
  }) => {
    test.slow();
    const seed = readSeed();
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);

    const errors = collectConsoleErrors(page);
    await page.goto(`/admin/catalogo/concepts/${seed.withoutEdition.id}/editions/nova`);
    for (const label of ['Região', 'Condições comerciais']) {
      await expect(page.getByLabel(label)).toBeVisible();
      await expect(page.locator('label', { hasText: label })).toContainText('Público no site');
    }
    await expect(page.locator('legend', { hasText: 'Modalidade' })).toContainText(
      'Público no site',
    );
    await expect(
      page.getByText('Ao registrar, a região e a modalidade passam a aparecer'),
    ).toBeVisible();
    await expectResponsive(page, errors);
    await captureForReview(page, 'w4-admin-edition');

    await page.goto(
      `/admin/catalogo/brand-partners/${seed.withEdition.brandPartnerId}/concepts/novo`,
    );
    await expect(page.getByLabel('Nome do Concept')).toBeVisible();
    await expect(page.getByText('Uso interno: não aparece no site.').first()).toBeVisible();
    await captureForReview(page, 'w4-admin-concept');
  });
});
