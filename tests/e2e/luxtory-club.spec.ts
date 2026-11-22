import { expect, test } from '@playwright/test';
import { discoveryMessages } from '../../src/features/catalog/presentation/i18n/discovery-pt-br';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

const CLUB = '/Luxtory-Club';
const LEGACY = '/como-funciona';
const CLOSED_B2C = 'http://127.0.0.1:3102';

test('apresenta a proposta e distingue os caminhos do intercâmbio (catalog §22)', async ({
  page,
}) => {
  const response = await page.goto(CLUB);
  expect(response?.status()).toBe(200);
  const hero = page.locator('#inicio');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'Sua casa. Mais lugares para viver.',
  );
  await expect(hero).toContainText('clube de intercâmbio de estadias');
  await expect(hero).toContainText('créditos para pedir estadias em outros destinos');
  await expect(page.locator('#como-funciona ol > li')).toHaveCount(5);
  expect(
    await page.locator('main > section').evaluateAll((sections) => sections.map(({ id }) => id)),
  ).toEqual([
    'inicio',
    'como-funciona',
    'condicoes',
    'luxchange',
    'outras-possibilidades',
    'duvidas',
    'proximo-passo',
  ]);
  const exchange = page.locator('#luxchange');
  await expect(exchange).toContainText(/depósito/i);
  await expect(exchange).toContainText('taxa de intercâmbio em dinheiro');
  await expect(exchange.getByRole('heading', { name: 'Pedido a outro membro' })).toBeVisible();
  await expect(
    exchange.getByRole('heading', { name: 'Reserva direta com a Luxtory' }),
  ).toBeVisible();
  await expect(exchange).toContainText('Seus créditos são usados quando a reserva se confirma');
  await expect(page.locator('#proximo-passo')).toContainText('ainda está em definição');
  await expect(page.locator('#proximo-passo p')).toHaveCSS('font-style', 'normal');
  await expect(page.locator('main form')).toHaveCount(0);
});

test('URL canônica, Preview sem indexação e legado redirecionado (ADR-0014)', async ({
  page,
  request,
}) => {
  await page.goto(CLUB);
  await expect(page).toHaveTitle(/Luxtory Club/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', CLUB);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /intercâmbio/);

  const legacy = await request.get(LEGACY, { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(new URL(legacy.headers().location!, legacy.url()).pathname).toBe(CLUB);
  expect(await legacy.text()).not.toContain(discoveryMessages.howItWorks.hero.title);

  const lowercase = await request.get(CLUB.toLowerCase(), { maxRedirects: 0 });
  expect(lowercase.status()).toBe(404);
});

test('portão B2C fechado protege as duas rotas inclusive com prefetch', async ({ request }) => {
  const representations: readonly Record<string, string>[] = [
    {},
    { RSC: '1' },
    { RSC: '1', 'Next-Router-Prefetch': '1' },
  ];
  for (const path of [CLUB, LEGACY]) {
    for (const headers of representations) {
      const response = await request.get(`${CLOSED_B2C}${path}`, {
        headers,
        maxRedirects: headers.RSC === '1' ? 1 : 0,
      });
      const body = await response.text();
      expect(new URL(response.url()).pathname).toBe(path);
      if (headers.RSC === '1') {
        expect([200, 404], path).toContain(response.status());
        if (headers['Next-Router-Prefetch'] !== '1') {
          expect(body).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
        }
      } else {
        expect(response.status(), path).toBe(404);
      }
      expect(body).not.toContain('Mais lugares para viver');
      expect(body).not.toContain('Como funciona o intercâmbio de estadias');
      expect(body).not.toContain(discoveryMessages.howItWorks.hero.title);
    }
  }
});

test('acessibilidade e reflow de 320 a 1920 px (ADR-0009)', async ({ page }) => {
  test.slow();
  const errors = collectConsoleErrors(page);
  await page.goto(CLUB);
  await expectResponsive(page, errors);
  await captureForReview(page, 'luxtory-club');
});

test.describe('jornada do Club a 390 px com toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Home → Luxtory Club → etapas → dúvidas → Home', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await page.getByRole('dialog').getByRole('link', { name: 'Luxtory Club' }).tap();
    await expect(page).toHaveURL(/\/Luxtory-Club$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await page.getByRole('link', { name: 'Veja como funciona' }).tap();
    await expect(page).toHaveURL(/#como-funciona$/);
    await expect(page.locator('#como-funciona h2')).toBeInViewport();

    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await page.getByRole('dialog').getByRole('link', { name: 'Dúvidas' }).tap();
    await expect(page).toHaveURL(/#duvidas$/);
    const answer = page.locator('#duvidas details').first();
    await answer.locator('summary').tap();
    await expect(answer).toHaveAttribute('open');
    await page.getByRole('link', { name: 'Veja as condições' }).tap();
    await expect(page).toHaveURL(/#condicoes$/);
    await expect(page.locator('#condicoes h2')).toBeInViewport();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document.querySelector('header');
          const title = document.querySelector('#condicoes h2');
          return title!.getBoundingClientRect().top >= header!.getBoundingClientRect().bottom;
        }),
      )
      .toBe(true);
    await page.getByRole('banner').getByRole('link', { name: 'Luxtory — página inicial' }).tap();
    await expect(page).toHaveURL(/\/$/);
    expect(errors).toEqual([]);
  });
});
