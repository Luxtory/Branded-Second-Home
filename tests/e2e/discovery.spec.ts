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

const visibleText = (page: Page) => page.locator('body').innerText();
const EDITIONS_CTA = 'Conheça as Residence Editions';

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

  test('Home → Residence Editions → Concept → Como funciona → Residence Editions', async ({
    page,
  }) => {
    const seed = readSeed();
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: EDITIONS_CTA }).tap();
    await expect(page).toHaveURL(/\/colecao#residence-editions$/);
    await page
      .getByRole('list', { name: 'Residence Concepts com Residence Edition' })
      .getByRole('link', { name: seed.withEdition.title })
      .tap();
    await expect(page).toHaveURL(new RegExp(`/colecao/${seed.withEdition.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.withEdition.title);
    await page.getByRole('link', { name: 'Entenda como funciona' }).tap();
    await expect(page).toHaveURL(/\/como-funciona$/);
    await page.getByRole('link', { name: EDITIONS_CTA }).tap();
    await expect(page).toHaveURL(/\/colecao#residence-editions$/);
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

  test('Hero com função de desejo: abre a página, sem ação, antes do conflito, da categoria e da oferta', async ({
    page,
  }) => {
    await page.goto('/');
    const sections = await page
      .locator('main > section[aria-labelledby]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-labelledby')));
    // A ordem dos 5Ps no DOM: PICTURE (Hero) → PROBLEM → PROMISE → PROOF → … → PUSH.
    expect(sections.filter((id) => HOME_SECTIONS.includes(id as never))).toEqual([
      ...HOME_SECTIONS,
    ]);
    expect(sections[0]).toBe(HOME_SECTIONS[0]);

    const hero = page.locator(`section[aria-labelledby="${HOME_SECTIONS[0]}"]`);
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    // O desejo se sustenta sozinho: nenhum link nem botão no Hero, e a categoria só aparece na virada (PROMISE).
    await expect(hero.getByRole('link')).toHaveCount(0);
    await expect(hero.getByRole('button')).toHaveCount(0);
    const firstCategory = page.getByText('Branded Second Home', { exact: false }).first();
    await expect(firstCategory).toBeVisible();
    expect(
      await firstCategory.evaluate((node) =>
        node.closest('section')?.getAttribute('aria-labelledby'),
      ),
    ).toBe(HOME_SECTIONS[2]);
  });

  test('[REQ-022] Concept sem Edition: só no grupo Residence Concepts e sem oferta; com Edition, região, modalidade e condições como registradas', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    const withEditions = page.getByRole('list', {
      name: 'Residence Concepts com Residence Edition',
    });
    const withoutEditions = page.getByRole('list', {
      name: 'Residence Concepts sem Residence Edition',
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
        '/colecao#residence-editions',
      );
      await expect(page.getByRole('link', { name: 'Conheça os Residence Concepts' })).toHaveCount(
        0,
      );
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
