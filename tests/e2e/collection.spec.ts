import { expect, test, type Page } from '@playwright/test';
import { hasForbiddenTerm } from '../../src/features/catalog/domain/terminology';
import { readSeed } from './support/discovery';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// Coleção final (docs/specs/catalog.md §13.12, D-B2C-21): discovery curatorial sobre o catálogo semeado por
// catalog.seed.ts — Casa Alpendre (Natureza; Edition Owner e Co-Owner no Litoral Sul da Bahia; capa e destaque),
// Casa Mirante (Natureza; sem Edition) e Casa Varanda (Bem-estar; Edition só Co-Owner no Litoral Norte). O banco é
// compartilhado com outros specs em paralelo: as asserções olham os Concepts do seed, nunca contagens exatas.
const PRICE_PER_DAY = /R\$\s?[\d.,]+\s*(\/|por)\s*(dia|noite)\b/i;
const titles = () => readSeed();

const withEditions = (page: Page) =>
  page.getByRole('list', { name: 'Home Concepts com Home Edition' });
const withoutEditions = (page: Page) =>
  page.getByRole('list', { name: 'Home Concepts sem Home Edition' });

async function apply(
  page: Page,
  facet: string,
  choose: (panel: ReturnType<Page['locator']>) => Promise<void>,
) {
  const details = page.locator('#busca details', {
    has: page.locator('summary', { hasText: facet }),
  });
  await details.locator('summary').click();
  await choose(details);
  await details.getByRole('button', { name: 'Aplicar' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Resultados da sua busca' }),
  ).toBeVisible();
}

test.describe('desktop (1440)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('[REQ-020] [REQ-022] [REQ-100] [REQ-103] curadoria: um card por Concept, Editions dentro com valor por base, sem Edition sem oferta', async ({
    page,
  }) => {
    const seed = titles();
    const errors = collectConsoleErrors(page);
    await page.goto('/colecao');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'As suas próximas histórias começam antes mesmo de a casa existir.',
    );
    await expect(
      page.getByText(
        'Home Concept é a ideia. Home Edition é o lançamento dessa ideia em uma região.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Encontre uma Second Home que tenha a ver com você.',
      }),
    ).toBeVisible();

    const alpendre = withEditions(page)
      .getByRole('listitem')
      .filter({ hasText: seed.withEdition.title });
    await expect(alpendre).toHaveCount(1);
    await expect(alpendre.getByText('Litoral Sul da Bahia', { exact: true })).toBeVisible();
    await expect(alpendre.getByText(/^Owner · a partir de R\$\s4\.800\.000$/)).toBeVisible();
    await expect(alpendre.getByText(/^Co-Owner · Ação a partir de R\$\s620\.000$/)).toBeVisible();
    await expect(alpendre.getByText('Até 10 pessoas · 5 suítes · 520 m²')).toBeVisible();
    await expect(alpendre.getByRole('img')).toHaveAttribute(
      'srcset',
      /\/media\/concept-covers\/.+ 480w/,
    );

    const mirante = withoutEditions(page)
      .getByRole('listitem')
      .filter({ hasText: seed.withoutEdition.title });
    await expect(
      mirante.getByText('Ainda sem Home Edition — por enquanto, sem oferta comercial.'),
    ).toBeVisible();
    await expect(mirante.getByText(/R\$/)).toHaveCount(0);
    // Nenhum Concept nos dois grupos (REQ-022).
    await expect(withoutEditions(page).getByText(seed.withEdition.title)).toHaveCount(0);
    await expect(withEditions(page).getByText(seed.withoutEdition.title)).toHaveCount(0);
    // No máximo um destaque, sempre com capa (spec §13.12).
    const featured = page.locator('.lx-concept-card--featured');
    expect(await featured.count()).toBeLessThanOrEqual(1);
    if ((await featured.count()) === 1) await expect(featured.locator('img')).toHaveCount(1);

    const body = (await page.locator('main').textContent()) ?? '';
    expect(hasForbiddenTerm(body)).toBe(false);
    expect(body).not.toMatch(PRICE_PER_DAY);
    await expectResponsive(page, errors);
    await captureForReview(page, 'colecao-01-curadoria');
  });

  test('busca e filtros principais: lifestyle, Localização em dois grupos e Faixa de valor em duas etapas', async ({
    page,
  }) => {
    const seed = titles();
    await page.goto('/colecao');
    // Busca livre: GET, URL estável, resultados.
    await page.getByRole('searchbox', { name: 'Buscar na Coleção' }).first().fill('varanda');
    await page.getByRole('button', { name: 'Explorar a Coleção' }).first().click();
    await expect(page).toHaveURL(/\/colecao\?q=varanda#resultados$/);
    await expect(page.getByRole('status')).toContainText('encontrado');
    await expect(page.getByRole('link', { name: seed.coOwnerOnly.title })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withoutEdition.title })).toHaveCount(0);

    // Lifestyle.
    await page.goto('/colecao');
    await apply(page, 'Lifestyle', (panel) => panel.getByLabel('Natureza').check());
    await expect(page).toHaveURL(/\?lifestyle=natureza#resultados$/);
    await expect(page.getByRole('link', { name: 'Remover filtro: Natureza' })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withEdition.title })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withoutEdition.title })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.coOwnerOnly.title })).toHaveCount(0);

    // [REQ-020] [REQ-022] Localização: na região, depois os que combinam e ainda não têm Edition nela — nenhum some.
    await page.goto('/colecao');
    await apply(page, 'Localização', (panel) => panel.getByLabel('Litoral Sul da Bahia').check());
    const inRegion = page.getByRole('list', {
      name: 'Home Concepts com Home Edition em Litoral Sul da Bahia',
    });
    const others = page.getByRole('list', {
      name: 'Outros Home Concepts que combinam com suas escolhas',
    });
    await expect(inRegion.getByRole('link', { name: seed.withEdition.title })).toBeVisible();
    await expect(others.getByRole('link', { name: seed.withoutEdition.title })).toBeVisible();
    await expect(others.getByRole('link', { name: seed.coOwnerOnly.title })).toBeVisible();
    await expect(
      page.getByText('Ainda sem Home Edition em Litoral Sul da Bahia.', { exact: false }),
    ).toBeVisible();

    // [REQ-020] [REQ-100] [REQ-103] Faixa de valor: 1) Co-Owner (uma Ação), 2) até R$ 600.000 — só com Edition e valor.
    await page.goto('/colecao');
    await apply(page, 'Faixa de valor', async (panel) => {
      await panel.getByLabel(/^Co-Owner/).check();
      await panel.getByLabel('Até').fill('600.000');
    });
    await expect(page).toHaveURL(/\?base=co-owner&valor-ate=600000#resultados$/);
    await expect(page.getByRole('status')).toContainText(
      'Considera só Concepts com Home Edition e valor vigente para Co-Owner.',
    );
    await expect(page.getByRole('link', { name: seed.coOwnerOnly.title })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withEdition.title })).toHaveCount(0);
    await expect(page.getByRole('link', { name: seed.withoutEdition.title })).toHaveCount(0);
  });

  test('filtros avançados, sem resultado, ordenação e barra fixa', async ({ page }) => {
    const seed = titles();
    await page.goto('/colecao');
    await apply(page, 'Mais filtros', (panel) => panel.getByLabel('Maison Nérée').check());
    await expect(page.getByRole('link', { name: seed.coOwnerOnly.title })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withEdition.title })).toHaveCount(0);

    await page.goto('/colecao?lifestyle=natureza&base=co-owner&valor-ate=100');
    await expect(
      page.getByText('Nenhum Home Concept combina com todas essas escolhas.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Limpar filtros' }).first().click();
    await expect(page).toHaveURL(/\/colecao#resultados$/);

    // Parâmetro vazio ou fora de ordem: a URL volta à forma estável.
    await page.goto('/colecao?q=&pessoas=&ordem=recentes&lifestyle=natureza');
    await expect(page).toHaveURL(/\/colecao\?lifestyle=natureza&ordem=recentes$/);
    await expect(page.getByRole('link', { name: 'Mais recentes' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.goto('/colecao');
    await page.locator('#resultados').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    await expect(page.locator('.lx-discovery-sticky')).toBeVisible();
    await page.locator('#busca').scrollIntoViewIfNeeded();
    await expect(page.locator('.lx-discovery-sticky')).toBeHidden();

    // Barra fixa com filtro: rótulos com a quantidade, numa linha só a 1440; "Filtros (n)" leva aos chips.
    await page.goto('/colecao?lifestyle=natureza');
    await page.locator('#resultados').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    const sticky = page.locator('.lx-discovery-sticky');
    await expect(sticky).toBeVisible();
    await expect(sticky.locator('summary', { hasText: 'Lifestyle' })).toContainText('(1)');
    await expect(sticky.getByRole('link', { name: 'Filtros (1)' })).toHaveAttribute(
      'href',
      '#resultados',
    );
    expect((await sticky.boundingBox())?.height ?? 0).toBeLessThan(80);
  });
});

test.describe('celular (390 px, toque)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('[REQ-022] busca com envio inequívoco, filtros no diálogo em tela cheia, cards 4:3; sem overflow e com axe 0', async ({
    page,
  }) => {
    const seed = titles();
    const errors = collectConsoleErrors(page);
    await page.goto('/colecao');
    const submit = page.getByRole('button', { name: 'Explorar a Coleção' }).first();
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(box?.width ?? 0).toBeGreaterThan(300);
    await expectResponsive(page, errors);
    await captureForReview(page, 'colecao-02-celular');

    await page.getByRole('button', { name: 'Filtros' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Filtros' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Natureza').check();
    await dialog.getByRole('button', { name: 'Ver resultados' }).tap();
    await expect(page).toHaveURL(/\?lifestyle=natureza#resultados$/);
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: seed.withoutEdition.title })).toBeVisible();

    const media = page.locator('.lx-concept-card__media').first();
    const ratio = await media.evaluate(
      (el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height,
    );
    expect(ratio).toBeCloseTo(4 / 3, 1);
    await expectResponsive(page, errors);
  });
});
