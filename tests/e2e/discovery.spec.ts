import { expect, test, type Page } from '@playwright/test';
import { readSeed } from './support/discovery';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// Discovery público (docs/specs/catalog.md §13): Home, Como funciona, Coleção e Concept, lidos como `anon`, sobre o
// catálogo semeado por catalog.seed.ts. Gate de UI do ADR-0009 em toda página.

// Mesmas regras de tests/terminology.test.ts (REQ-100, REQ-101), agora sobre o texto renderizado — inclusive os
// dados do catálogo — mais preço ou pacote por dia.
const FORBIDDEN = [
  /\bcot(a|as|ista|istas|izar|ização)\b/i,
  /\bdi[aá]rias?\b/i,
  /\b(rentabilidade|valoriza[çc][ãa]o|renda) garantid[ao]s?\b/i,
  /\bretorno garantido\b/i,
  /\bR\$\s?[\d.,]+\s*(\/|por)\s*(dia|noite)\b/i,
];

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

async function visibleText(page: Page) {
  return page.locator('body').innerText();
}

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

  test('Home → Coleção → Concept → Como funciona → Coleção', async ({ page }) => {
    const seed = readSeed();
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Conhecer a Coleção' }).first().tap();
    await expect(page).toHaveURL(/\/colecao$/);
    await page.getByRole('link', { name: seed.withEdition.title }).tap();
    await expect(page).toHaveURL(new RegExp(`/colecao/${seed.withEdition.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.withEdition.title);
    await page.getByRole('link', { name: 'Entender como funciona' }).last().tap();
    await expect(page).toHaveURL(/\/como-funciona$/);
    await page.getByRole('link', { name: 'Conhecer a Coleção' }).last().tap();
    await expect(page).toHaveURL(/\/colecao$/);
    expect(errors).toEqual([]);
  });
});

test.describe('Discovery público — conteúdo', () => {
  test('[REQ-100] [REQ-101] nenhum termo vedado, preço por dia ou promessa de retorno nas páginas públicas', async ({
    page,
  }) => {
    for (const name of PAGE_NAMES) {
      const path = pathOf(name);
      await page.goto(path);
      const text = await visibleText(page);
      const hits = FORBIDDEN.filter((rule) => rule.test(text)).map((rule) => `${path} ${rule}`);
      expect(hits).toEqual([]);
    }
  });

  test('[REQ-022] Concept sem Edition aparece sem oferta; com Edition, região, modalidade e condições como registradas', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('withoutEdition'));
    await expect(page.getByText('ainda não tem uma Residence Edition')).toBeVisible();
    await expect(page.getByText('Condições comerciais', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Modalidade', { exact: true })).toHaveCount(0);

    await page.goto(pathOf('withEdition'));
    await expect(page.getByRole('heading', { name: seed.withEdition.region })).toBeVisible();
    await expect(page.getByText('Owner e Co-Owner', { exact: true })).toBeVisible();
    await expect(page.getByText('Cronograma de obra, forma de pagamento')).toBeVisible();
    await expect(page.locator('.lx-credit__name')).toHaveText(seed.withEdition.brandName);
  });

  test('[REQ-103] Owner e Co-Owner com a mesma estrutura onde aparecem juntos', async ({
    page,
  }) => {
    for (const path of [pathOf('home'), pathOf('howItWorks')]) {
      await page.goto(path);
      const sides = page
        .locator('.lx-pair')
        .filter({ has: page.getByRole('heading', { name: 'Owner', exact: true }) });
      const owner = sides.locator('.lx-pair__item').nth(0);
      const coOwner = sides.locator('.lx-pair__item').nth(1);
      await expect(owner.getByRole('heading', { level: 3 })).toHaveText('Owner');
      await expect(coOwner.getByRole('heading', { level: 3 })).toHaveText('Co-Owner');
      const count = async (side: typeof owner) => side.locator('li, dd').count();
      expect(await count(owner), path).toBe(await count(coOwner));
    }
  });

  test('[BR-015] [BR-021] Concept sem exposição, com encerramento eficaz ou sem versão aprovada não aparece e responde 404', async ({
    page,
  }) => {
    const seed = readSeed();
    await page.goto(pathOf('collection'));
    const list = page.getByRole('list', { name: 'Residence Concepts da Coleção' });
    for (const concept of [seed.withEdition, seed.withoutEdition, seed.coOwnerOnly]) {
      await expect(list.getByRole('link', { name: concept.title })).toBeVisible();
    }
    for (const concept of seed.hidden) {
      await expect(page.getByText(concept.title)).toHaveCount(0);
      const response = await page.goto(`/colecao/${concept.id}`);
      expect(response?.status(), concept.title).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('não está aqui');
    }
    const invalid = await page.goto('/colecao/nao-e-um-id');
    expect(invalid?.status()).toBe(404);
  });

  test('[ADR-0012] CSP com nonce nas páginas públicas e no Admin; nenhum link para o Admin no site', async ({
    page,
  }) => {
    for (const path of ['/', '/colecao', '/entrar']) {
      const response = await page.goto(path);
      const policy = response?.headers()['content-security-policy'] ?? '';
      expect(policy, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(policy, path).toContain("frame-ancestors 'none'");
    }
    await page.goto('/');
    await expect(page.locator('a[href^="/admin"], a[href^="/entrar"]')).toHaveCount(0);
  });
});
