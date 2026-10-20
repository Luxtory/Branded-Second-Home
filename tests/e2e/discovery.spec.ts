import { expect, test, type Locator, type Page } from '@playwright/test';
import { hasForbiddenTerm } from '../../src/features/catalog/domain/terminology';
import { HOME_SECTIONS } from '../../src/features/catalog/presentation/discovery/paths';
import { discoveryMessages } from '../../src/features/catalog/presentation/i18n/discovery-pt-br';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import {
  captureForReview,
  collectConsoleErrors,
  expectResponsive,
  worstContrastUnder,
} from './support/ui';

// Discovery público B2C (docs/specs/catalog.md §13, §17.8): Home, Como funciona, Coleção, Home Concept e Home Edition,
// lidos como `anon`, sobre o catálogo semeado por catalog.seed.ts (estado "há Home Edition publicada"; os outros estados
// do CTA são provados em
// tests/features/catalog/presentation/catalog-actions.test.tsx). Gate de UI do ADR-0009 em toda página.

// Preço por dia ou por noite no texto renderizado (REQ-100), além da guarda canônica de terminologia.
const PRICE_PER_DAY = /R\$\s?[\d.,]+\s*(\/|por)\s*(dia|noite)\b/i;

// O seed é lido dentro dos testes: o arquivo só existe depois do projeto `seed`.
const PAGE_NAMES = [
  'home',
  'howItWorks',
  'collection',
  'withHomeEdition',
  'withoutHomeEdition',
  'homeEdition',
  'homeEditionWithoutMedia',
] as const;
type PageName = (typeof PAGE_NAMES)[number];

function pathOf(name: PageName): string {
  const seed = readSeed();
  const paths: Record<PageName, string> = {
    home: '/',
    howItWorks: '/como-funciona',
    collection: '/colecao',
    withHomeEdition: `/colecao/${seed.withHomeEdition.id}`,
    withoutHomeEdition: `/colecao/${seed.withoutHomeEdition.id}`,
    homeEdition: `/colecao/${seed.withHomeEdition.id}/home-editions/${seed.withHomeEdition.homeEdition.id}`,
    homeEditionWithoutMedia: `/colecao/${seed.secondBrand.id}/home-editions/${seed.secondBrand.homeEdition.id}`,
  };
  return paths[name];
}

// textContent: inclui as respostas fechadas do FAQ.
const visibleText = async (page: Page) => (await page.locator('body').textContent()) ?? '';
const HOME_EDITIONS_CTA = 'Conheça as Home Editions';

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
    // A captura espera a entrada da gaveta terminar (sem animação a meio).
    const opened = () =>
      dialog.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
    if (process.env.UI_CAPTURE_DIR) {
      await opened();
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/w4-menu-390.png` });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    // Checkpoint Visual (390 e 1440 px): na Home o menu abre pelo ícone também no desktop.
    if (process.env.UI_CAPTURE_DIR) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await button.click();
      await expect(dialog).toBeVisible();
      await opened();
      await page.screenshot({ path: `${process.env.UI_CAPTURE_DIR}/w4-menu-1440.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('Discovery público — Como funciona: header da Home e scrim uniforme', () => {
  test('o Como funciona usa o header da Home: o menu abre pelo ícone oficial, também no desktop', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/como-funciona');
      await expect(page.locator('header .lx-header__link')).toHaveCount(0);
      const button = page.getByRole('button', { name: 'Abrir menu' });
      await button.click();
      const dialog = page.getByRole('dialog', { name: 'Menu' });
      await expect(dialog.getByRole('link', { name: 'Como funciona' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
    }
    expect(errors).toEqual([]);
  });

  test('[WCAG 1.4.3] Hero e CTA final com scrim uniforme: contraste medido nos pixels a 768 e 1440 px', async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Headline Warm Sand (texto grande) ≥ 3:1; texto branco ≥ 4,5:1 (D-B2C-20, scrim.display-alpha).
    const targets = [
      ['#inicio h1', 3],
      ['#inicio .lx-subheadline', 4.5],
      ['#proximo-passo h2', 3],
      ['#proximo-passo .lx-subheadline', 4.5],
    ] as const;
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
      await page.goto('/como-funciona', { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        // A foto do CTA é lazy: carregar e decodificar todas antes de medir.
        for (const image of document.images) {
          image.loading = 'eager';
          await image.decode().catch(() => undefined);
        }
      });
      for (const [selector, min] of targets) {
        const worst = await worstContrastUnder(page, selector);
        expect(worst, `${selector} a ${width}px`).toBeGreaterThanOrEqual(min);
      }
    }
  });
});

test.describe('Discovery público — jornada a 390 px com toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Home → Home Editions → Home Concept → Home Edition → Como funciona → Home Editions', async ({
    page,
  }) => {
    const seed = readSeed();
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: HOME_EDITIONS_CTA }).tap();
    await expect(page).toHaveURL(/\/colecao#home-editions$/);
    await page
      .getByRole('list', { name: 'Home Concepts com Home Edition' })
      .getByRole('link', { name: seed.withHomeEdition.title })
      .tap();
    await expect(page).toHaveURL(new RegExp(`/colecao/${seed.withHomeEdition.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.withHomeEdition.title);
    await page.getByRole('link', { name: seed.withHomeEdition.homeEdition.name }).tap();
    await expect(page).toHaveURL(
      new RegExp(
        `/colecao/${seed.withHomeEdition.id}/home-editions/${seed.withHomeEdition.homeEdition.id}$`,
      ),
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      seed.withHomeEdition.homeEdition.name,
    );
    await page.getByRole('link', { name: 'Entenda como funciona' }).tap();
    await expect(page).toHaveURL(/\/como-funciona$/);
    await page.getByRole('link', { name: HOME_EDITIONS_CTA }).tap();
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
    // Carrossel só com duas ou mais fotos (spec catalog §13.10): então anterior, próxima e pausa; com uma, nenhum.
    const slides = await hero.locator('.lx-home-hero__slide').count();
    const controls = hero.getByRole('button');
    if (slides < 2) {
      await expect(controls).toHaveCount(0);
      return;
    }
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
    // A resposta vem da copy aplicada (D-B2C-19): a última frase do "A Luxtory é timeshare?".
    const question = 'A Luxtory é timeshare?';
    const lastLine =
      discoveryMessages.home.faq.items.find((item) => item.question === question)?.answer.at(-1) ??
      '';
    expect(lastLine).not.toBe('');
    const timeshare = faq.locator('details', { hasText: question });
    await expect(timeshare.getByText(lastLine)).toBeHidden();
    await timeshare.locator('summary').click();
    await expect(timeshare.getByText(lastLine)).toBeVisible();
    const answers = (await faq.textContent()) ?? '';
    expect(hasForbiddenTerm(answers)).toBe(false);
    await questions.last().click();
    await expect(faq.getByRole('link', { name: 'Como Funciona' })).toHaveAttribute(
      'href',
      '/como-funciona',
    );
  });

  test('[REQ-022] [BR-031] Home Concept sem Home Edition publicada: só no grupo dele; com Home Edition, o card leva à página dela, sem localização, modalidade nem condições', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    const withHomeEditions = page.getByRole('list', {
      name: 'Home Concepts com Home Edition',
    });
    const withoutHomeEditions = page.getByRole('list', {
      name: 'Home Concepts sem Home Edition',
    });
    await expect(
      withHomeEditions.getByRole('link', { name: seed.withHomeEdition.title }),
    ).toBeVisible();
    await expect(
      withHomeEditions.getByRole('link', { name: seed.secondBrand.title }),
    ).toBeVisible();
    // Finalizada fora do site não conta como publicada (BR-036).
    await expect(
      withoutHomeEditions.getByRole('link', { name: seed.withoutHomeEdition.title }),
    ).toBeVisible();
    // Nenhum Home Concept nos dois grupos; Home Edition em preparação nunca aparece.
    await expect(
      withoutHomeEditions.getByRole('link', { name: seed.withHomeEdition.title }),
    ).toHaveCount(0);
    await expect(
      withHomeEditions.getByRole('link', { name: seed.withoutHomeEdition.title }),
    ).toHaveCount(0);
    await expect(page.getByText(seed.withHomeEdition.draftHomeEdition.name)).toHaveCount(0);
    await expect(page.getByText(seed.withHomeEdition.homeEdition.name)).toBeVisible();
    await expect(page.getByText(/Média projetada\sR\$\s4\.800\.000/)).toBeVisible();
    await expect(page.getByText(discoveryMessages.collection.projectedNote)).toBeVisible();

    await page.goto(pathOf('withoutHomeEdition'));
    await expect(page.getByText(discoveryMessages.homeConcept.homeEditions.none)).toBeVisible();
    await expect(page.getByText(seed.withoutHomeEdition.hiddenHomeEdition.name)).toHaveCount(0);

    await page.goto(pathOf('withHomeEdition'));
    await expect(page.locator('.lx-credit__name')).toHaveText(seed.withHomeEdition.brandName);
    await expect(
      page.getByRole('link', { name: seed.withHomeEdition.homeEdition.name }),
    ).toHaveAttribute('href', pathOf('homeEdition'));
    await expect(page.getByText(seed.withHomeEdition.draftHomeEdition.name)).toHaveCount(0);
    for (const removed of ['Condições comerciais', 'Modalidade', 'Região', 'Localização']) {
      await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
    }
    // "Manifestar interesse" só existe com o formulário (W6; D-B2C-10).
    await expect(page.getByText('Manifestar interesse')).toHaveCount(0);
  });

  test('[REQ-022] [BR-031] [BR-034] página da Home Edition: definição, galeria e plantas, média projetada com a explicação; sem formulário', async ({
    page,
  }) => {
    const seed = readSeed();
    const { homeEdition: copy } = discoveryMessages;
    await page.goto(pathOf('homeEdition'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      seed.withHomeEdition.homeEdition.name,
    );
    await expect(page.getByRole('navigation', { name: copy.breadcrumb })).toContainText(
      seed.withHomeEdition.title,
    );
    await expect(page.getByText('Casa térrea com pátio central').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.gallery.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.gallery.plans })).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.projected.title })).toBeVisible();
    for (const line of copy.projected.text) await expect(page.getByText(line)).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    expect(await page.title()).toContain(seed.withHomeEdition.homeEdition.name);

    // Sem média nem mídia: a página continua, sem os blocos (nada é presumido).
    await page.goto(pathOf('homeEditionWithoutMedia'));
    await expect(page.getByRole('heading', { name: copy.projected.title })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: copy.gallery.title })).toHaveCount(0);

    // Em preparação, finalizada fora do site, de outro Home Concept ou id inválido → 404.
    for (const path of [
      `/colecao/${seed.withHomeEdition.id}/home-editions/${seed.withHomeEdition.draftHomeEdition.id}`,
      `/colecao/${seed.withoutHomeEdition.id}/home-editions/${seed.withoutHomeEdition.hiddenHomeEdition.id}`,
      `/colecao/${seed.secondBrand.id}/home-editions/${seed.withHomeEdition.homeEdition.id}`,
      `/colecao/${seed.withHomeEdition.id}/home-editions/nao-e-um-id`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test('[REQ-103] Owner e Co-Owner com a mesma estrutura onde aparecem juntos', async ({
    page,
  }) => {
    for (const path of [pathOf('home'), pathOf('howItWorks')]) {
      await page.goto(path);
      // Core: Editorial Comparison dividida (spec design-system §13.10); o nome da modalidade é o título ou o eyebrow.
      const pairs = page.locator('[data-pair="modality"]');
      expect(await pairs.count(), path).toBeGreaterThan(0);
      for (const pair of await pairs.all()) {
        const items = pair.locator('.lx-comparison__item');
        await expect(items).toHaveCount(2);
        const owner = items.nth(0);
        const coOwner = items.nth(1);
        const shape = (side: Locator) =>
          side.evaluate((node) => [...node.children].map((child) => child.tagName));
        const name = (side: Locator) => side.locator(':scope > :first-child').textContent();
        expect(await name(owner), path).toBe('Owner');
        expect(await name(coOwner), path).toBe('Co-Owner');
        expect(await shape(owner), path).toEqual(await shape(coOwner));
      }
    }
  });

  test('[BR-015] [BR-021] Home Concept sem exposição, com encerramento eficaz ou sem versão aprovada não aparece e responde 404', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    for (const homeConcept of seed.hidden) {
      await expect(page.getByText(homeConcept.title)).toHaveCount(0);
      const response = await page.goto(`/colecao/${homeConcept.id}`);
      expect(response?.status(), homeConcept.title).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('não está aqui');
      await page.goto(pathOf('collection'));
    }
    const invalid = await page.goto('/colecao/nao-e-um-id');
    expect(invalid?.status()).toBe(404);
  });

  test('[D-B2C-16] [D-B2C-27] com Home Edition publicada, a Home e o Como funciona levam ao primeiro grupo da Coleção', async ({
    page,
  }) => {
    for (const path of ['/', '/como-funciona']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: HOME_EDITIONS_CTA }), path).toHaveAttribute(
        'href',
        '/colecao#home-editions',
      );
      await expect(page.getByRole('link', { name: 'Conheça os Home Concepts' })).toHaveCount(0);
    }
  });

  test('[REQ-103] [D-B2C-16] Como funciona: capítulos no Hero, condições sempre visíveis e fechamento por disponibilidade', async ({
    page,
  }) => {
    // Especificação Visual e Copy do fundador (D-B2C-20, spec catalog §13.11).
    const { howItWorks } = discoveryMessages;
    await page.goto(pathOf('howItWorks'));
    const hero = page.locator('section#inicio');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(howItWorks.hero.title);
    await expect(hero.getByRole('link', { name: howItWorks.hero.anchor })).toHaveAttribute(
      'href',
      '#conexao',
    );
    const chapters = hero
      .getByRole('navigation', { name: howItWorks.hero.chapters })
      .getByRole('link');
    await expect(chapters).toHaveCount(3);
    for (const [index, id] of ['patrimonio', 'liberdade', 'pertencimento'].entries()) {
      await expect(chapters.nth(index)).toHaveAttribute('href', `#${id}`);
      await expect(page.locator(`main > section#${id}`)).toHaveCount(1);
    }
    await chapters.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#liberdade$/);

    // As condições fazem parte da prova: todas visíveis, nenhuma dentro de um disclosure.
    const conditions = page.locator('section#condicoes');
    await expect(conditions.locator('details')).toHaveCount(0);
    await expect(conditions.getByRole('listitem')).toHaveCount(howItWorks.conditions.items.length);
    for (const item of howItWorks.conditions.items) await expect(conditions).toContainText(item);

    // As quatro configurações Co-Owner com a mesma geometria; as duas listas do PUSH com o mesmo peso.
    await expect(page.locator('.lx-figures__item')).toHaveCount(4);
    const fit = page.locator('section#para-quem .lx-comparison__item');
    await expect(fit).toHaveCount(2);
    await expect(fit.nth(0).getByRole('listitem')).toHaveCount(howItWorks.fit.fits.length);
    await expect(fit.nth(1).getByRole('listitem')).toHaveCount(howItWorks.fit.notFits.length);

    // Com Home Edition publicada: o apoio e o CTA do primeiro grupo, sobre a fotografia de fechamento.
    const next = page.locator('section#proximo-passo');
    await expect(next).toContainText(howItWorks.next.text);
    await expect(next.getByRole('link', { name: HOME_EDITIONS_CTA })).toBeVisible();
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
    await page.goto(
      `/admin/catalogo/home-concepts/${seed.withoutHomeEdition.id}/home-editions/nova`,
    );
    for (const label of ['Nome da Home Edition', 'Tipologia', 'Configuração dos espaços']) {
      await expect(page.getByLabel(label)).toBeVisible();
      await expect(page.locator('label', { hasText: label })).toContainText('Público no site');
    }
    for (const removed of ['Região', 'Condições comerciais', 'Modalidade']) {
      await expect(page.getByLabel(removed, { exact: true })).toHaveCount(0);
    }
    await expect(
      page.getByText(
        'A Home Edition não tem localização, modalidade, estrutura patrimonial nem condições comerciais',
      ),
    ).toBeVisible();
    await expectResponsive(page, errors);
    await captureForReview(page, 'w4-admin-home-edition');

    await page.goto(
      `/admin/catalogo/brand-partners/${seed.withHomeEdition.brandPartnerId}/home-concepts/novo`,
    );
    await expect(page.getByLabel('Nome do Home Concept')).toBeVisible();
    await expect(page.getByText('Uso interno: não aparece no site.').first()).toBeVisible();
    await captureForReview(page, 'w4-admin-home-concept');
  });
});
