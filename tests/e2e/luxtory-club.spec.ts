import { expect, test } from '@playwright/test';
import { discoveryMessages } from '../../src/features/catalog/presentation/i18n/discovery-pt-br';
import {
  captureForReview,
  collectConsoleErrors,
  expectResponsive,
  TEXT_ZOOM_WIDTHS,
} from './support/ui';

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
    'Hoje a sua casa de campo. Amanhã uma casa na praia.',
  );
  await expect(hero.locator('.lx-split__text p')).toHaveText([
    'As datas da sua casa que entram no intercâmbio geram créditos para pedir estadias em outros destinos.',
  ]);
  const steps = page.locator('#como-funciona');
  await expect(steps.locator('.lx-section-head p')).toHaveText(
    'Para participar do intercâmbio, seu imóvel passa por uma avaliação da Luxtory.',
  );
  await expect(steps.locator('ol > li')).toHaveCount(5);
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
  const control = page.locator('#condicoes');
  await expect(
    control.getByRole('heading', { name: 'Propriedade e direito de uso' }),
  ).toBeVisible();
  await expect(control.locator('p')).toHaveText([
    'O intercâmbio não altera sua propriedade ou participação no imóvel, nem seus direitos de uso.',
    'Você escolhe quais datas disponibilizar. Após cedidas ou reservadas, elas ficam comprometidas e indisponíveis para outros usos.',
  ]);

  const exchange = page.locator('#luxchange');
  await expect(exchange.getByRole('heading', { name: 'Origem dos créditos' })).toBeVisible();
  await expect(exchange).toContainText(
    'Pelo depósito: ao disponibilizar datas para intercâmbio, você recebe os créditos após a confirmação da Luxtory.',
  );
  await expect(exchange).toContainText(
    'Pelo Luxchange Request: você também recebe créditos ao aceitar uma solicitação para seu imóvel, após a confirmação da reserva pela Luxtory.',
  );
  await expect(exchange.locator('.lx-columns strong')).toHaveText([
    'Pelo depósito:',
    'Pelo Luxchange Request:',
    'Preço de Referência Luxtory',
    'Mais liberdade para escolher suas estadias.',
  ]);
  await expect(exchange.getByRole('heading', { name: 'Intercâmbio por dia' })).toBeVisible();
  await expect(exchange).toContainText('a partir de apenas um dia');
  await expect(exchange.getByRole('heading', { name: 'Luxchange Request' })).toBeVisible();
  await expect(exchange.getByRole('heading', { name: 'Luxchange Direct' })).toBeVisible();
  const methodLabels = exchange.locator('.lx-comparison__item .lx-eyebrow');
  await expect(methodLabels).toHaveText([
    'Solicitação de reserva a outro membro.',
    'Reserva direta com a Luxtory.',
  ]);
  await expect(methodLabels.first()).toHaveCSS('font-style', 'normal');
  await expect(methodLabels.last()).toHaveCSS('font-style', 'normal');
  await expect(exchange.getByRole('heading', { name: 'Associação, créditos e taxa' })).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(exchange).toContainText('Os créditos são utilizados quando a reserva é confirmada.');
  await expect(exchange).toContainText('transferidos ao membro que disponibilizou as datas.');
  await expect(exchange).toContainText(
    'Escolha entre as datas disponíveis no inventário da Luxtory.',
  );

  const example = page.locator('#taxa-de-intercambio');
  await expect(example.getByRole('heading')).toHaveText('Taxa de intercâmbio — 12%');
  await expect(example.locator('p').first()).toHaveText(
    'Em uma estadia com preço de mercado de R$ 10.500, a taxa de intercâmbio seria de apenas R$ 1.260.',
  );
  await expect(example.locator('strong')).toHaveText([
    'R$ 10.500',
    'R$ 1.260',
    'R$ 9.240 a menos em relação ao preço de mercado — 88% de diferença.',
  ]);
  await expect(example.locator('em')).toHaveText(
    'Simulação referente exclusivamente à taxa de intercâmbio, sem considerar créditos utilizados, associação e eventuais custos adicionais.',
  );
  const services = page.locator('#outras-possibilidades');
  await expect(services).toContainText('preservando seus créditos Luxchange para outra viagem.');
  await expect(services).toContainText('Exclusiva para associados ativos');
  await expect(services).toContainText('Você escolhe quais datas disponíveis deseja monetizar.');
  await expect(page.locator('main')).not.toContainText('paga em dinheiro');
  const closing = page.locator('#proximo-passo');
  await expect(closing.locator('h2 em')).toHaveText('O Club faz sentido para o seu imóvel?');
  await expect(closing.locator('p')).toHaveText(
    'O primeiro passo é avaliar seu imóvel. O processo para apresentá-lo à Luxtory ainda está em definição.',
  );
  await expect(closing.locator('p')).toHaveCSS('font-style', 'normal');
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
      expect(body).not.toContain('Amanhã uma casa na praia');
      expect(body).not.toContain('Como funciona o intercâmbio de estadias');
      expect(body).not.toContain(discoveryMessages.howItWorks.hero.title);
    }
  }
});

test('a abertura usa os tipos da Home e os títulos em Blue usam Warm Sand', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const homeHero = page.locator('#inicio');
    const heading = await homeHero.locator('h1').evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight };
    });
    const subheadline = await homeHero.locator('.lx-home-hero__lead').evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight };
    });
    await page.goto(CLUB);
    const clubHero = page.locator('#inicio');
    const clubHeading = clubHero.locator('h1');
    const clubSubheadline = clubHero.locator('.lx-split__text p');
    for (const [element, style] of [
      [clubHeading, heading],
      [clubSubheadline, subheadline],
    ] as const) {
      await expect(element).toHaveCSS('font-family', style.family);
      await expect(element).toHaveCSS('font-size', style.size);
      await expect(element).toHaveCSS('line-height', style.lineHeight);
    }
    await expect(clubHeading).toHaveCSS('color', 'rgb(205, 173, 142)');
    await expect(clubHeading.locator('em')).toHaveCSS('color', 'rgb(205, 173, 142)');
    await expect(page.locator('#proximo-passo h2')).toHaveCSS('color', 'rgb(205, 173, 142)');
  }
});

test('acessibilidade e reflow de 320 a 1920 px (ADR-0009)', async ({ page }) => {
  test.slow();
  const errors = collectConsoleErrors(page);
  await page.goto(CLUB);
  await expectResponsive(page, errors);
  await captureForReview(page, 'luxtory-club');
});

test('mantém o símbolo e o valor juntos na simulação da taxa', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(CLUB);
  await page.evaluate(() => document.fonts.ready);
  const amounts = page.locator('#taxa-de-intercambio p').first().locator('strong');
  expect(
    await amounts.evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }),
    ),
  ).toEqual([1, 1]);
});

test('acomoda texto a 200% sem extrapolar a largura do celular', async ({ page }) => {
  await page.goto(CLUB);
  await page.evaluate(() => document.fonts.ready);
  const [base, zoomed] = await page.evaluate(() => {
    const root = document.documentElement;
    const before = parseFloat(getComputedStyle(root).fontSize);
    root.style.setProperty('font-size', '200%', 'important');
    return [before, parseFloat(getComputedStyle(root).fontSize)];
  });
  expect(zoomed).toBe(base * 2);

  for (const width of TEXT_ZOOM_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, `overflow com ampliação de texto em ${width}px`).toBe(0);
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeInViewport({ ratio: 1 });
  }
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
