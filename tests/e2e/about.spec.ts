import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { aboutMessages as text } from '../../src/features/catalog/presentation/i18n/about-pt-br';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

const { hero, history, purpose, founder, invitation } = text.content;
const journeys = [
  { name: 'B2C', path: '/sobre', home: '/', how: '/como-funciona' },
  {
    name: 'B2B',
    path: '/brand-partner/sobre',
    home: '/brand-partner',
    how: '/brand-partner/como-funciona',
  },
] as const;
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const plain = (s: string) => s.replaceAll('**', '');

for (const journey of journeys) {
  test.describe(`Sobre ${journey.name}`, () => {
    test('copy completa, hierarquia, destaques e fotografia original', async ({
      page,
      request,
    }) => {
      await page.goto(journey.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(hero.title);
      await expect(page.locator('main > div > section')).toHaveCount(5);
      await expect(page.locator('#historia h3')).toHaveText(history.acts.map((act) => act.title));
      await expect(page.locator('#historia .lx-body')).toHaveText(
        history.acts.flatMap((act) => act.paragraphs.map(plain)),
      );
      await expect(page.locator('#o-que-nos-move h3')).toHaveText(
        purpose.values.map((value) => value.title),
      );
      await expect(page.locator('#o-que-nos-move .lx-body')).toHaveText(
        purpose.values.map((value) => value.text),
      );
      await expect(page.locator('#fundador blockquote')).toHaveText(founder.quote);
      await expect(page.locator('#fundador figcaption')).toHaveText(founder.signature);
      await expect(page.locator('#convite h2')).toHaveText(invitation.title);
      await expect(page.locator('#convite .lx-subheadline')).toHaveText(invitation.lead);
      await expect(page.locator('main strong')).toHaveText([
        '13 empreendimentos de alto padrão',
        'patrimônio, liberdade e pertencimento.',
        '2019',
        'Branded Second Homes com identidade de marca, patrimônio, liberdade e pertencimento.',
      ]);
      const image = page.getByRole('img', { name: text.photoAlt });
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (node: HTMLImageElement) =>
              node.complete && node.naturalWidth === 884 && node.naturalHeight === 990,
          ),
        )
        .toBe(true);
      const photo = await request.get('/images/about/marcos-rodopiano.jpg');
      expect(photo.headers()['content-type']).toContain('image/jpeg');
      expect(
        createHash('sha256')
          .update(await photo.body())
          .digest('hex'),
      ).toBe('fd9a0683cbdd862eedcbf5e736940324bea4f2339f85a6badc467202905b82cc');
    });

    test('gate de UI: axe, contraste, console e reflow; foto e citação responsivas', async ({
      page,
    }) => {
      test.slow();
      const errors = collectConsoleErrors(page);
      const response = await page.goto(journey.path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self' 'nonce-");
      await expectResponsive(page, errors);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const photo = await page.locator('.lx-about__portrait').boundingBox();
        const quote = await page.locator('.lx-about__quote').boundingBox();
        expect(photo).not.toBeNull();
        expect(quote).not.toBeNull();
        if (photo && quote) {
          if (width < 1024) expect(quote.y).toBeGreaterThanOrEqual(photo.y + photo.height);
          else expect(quote.x).toBeGreaterThan(photo.x + photo.width);
        }
        for (const closing of await page.locator('.lx-section-closing').all()) {
          const style = await closing.evaluate((node) => {
            const line = getComputedStyle(node, '::before');
            const text = getComputedStyle(node.querySelector('.lx-headline')!);
            return {
              line: line.borderTopWidth,
              width: line.width,
              italic: text.fontStyle,
              size: Number.parseFloat(text.fontSize),
            };
          });
          expect(style).toMatchObject({ line: '1px', width: '96px', italic: 'italic' });
          expect(style.size).toBeGreaterThanOrEqual(24);
          expect(style.size).toBeLessThanOrEqual(36);
        }
      }
      // Full-page screenshots do not trigger native lazy loading below the viewport.
      const founderPhoto = page.getByRole('img', { name: text.photoAlt });
      await founderPhoto.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          founderPhoto.evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth === 884,
          ),
        )
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureForReview(page, `sobre-${journey.name.toLowerCase()}`);
    });

    test('navegação ativa, logo, CTAs, teclado e foco em desktop/celular', async ({ page }) => {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(journey.path);
        await expect(page.locator('.lx-header__inner > .lx-logo')).toHaveAttribute(
          'href',
          journey.home,
        );
        for (const link of await page.locator('main a').all())
          await expect(link).toHaveAttribute('href', journey.how);
        await expect(page.locator('main a')).toHaveCount(3);
        await expect(
          page.locator('footer').getByRole('link', { name: text.navLabel, exact: true }),
        ).toHaveAttribute('aria-current', 'page');
        await page.keyboard.press('Tab');
        const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
        await expect(skip).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('main')).toBeFocused();
        if (width === 390) {
          const button = page.getByRole('button', { name: 'Abrir menu' });
          await button.focus();
          await page.keyboard.press('Enter');
          const menu = page.getByRole('dialog', { name: 'Menu' });
          const about = menu.getByRole('link', { name: text.navLabel, exact: true });
          await expect(about).toHaveAttribute('href', journey.path);
          await expect(about).toHaveAttribute('aria-current', 'page');
          await about.focus();
          expect(await about.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe(
            'none',
          );
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(button).toBeFocused();
          await button.click();
          await menu.getByRole('link', { name: 'Como funciona', exact: true }).click();
          await expect(page).toHaveURL(journey.how);
        } else {
          await expect(
            page.locator('header nav').getByRole('link', { name: text.navLabel, exact: true }),
          ).toHaveAttribute('aria-current', 'page');
          await page.locator('#convite').getByRole('link', { name: hero.action }).click();
          await expect(page).toHaveURL(journey.how);
        }
      }
    });

    test('SEO autorreferente, social e noindex local/Preview', async ({ page }) => {
      await page.goto(journey.path);
      await expect(page).toHaveTitle(hero.eyebrow);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', hero.lead);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${journey.path}$`),
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        'content',
        new RegExp(`${journey.path}$`),
      );
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        hero.eyebrow,
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    });

    test('conteúdo e navegação acessíveis sem JavaScript', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 320, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:3100${journey.path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(hero.title);
      await expect(
        page.locator('footer').getByRole('link', { name: text.navLabel, exact: true }),
      ).toBeVisible();
      await context.close();
    });
  });
}

test('duas jornadas têm texto idêntico em ordem, com parágrafos e hierarquia iguais', async ({
  page,
}) => {
  const bodies = [];
  for (const journey of journeys) {
    await page.goto(journey.path);
    bodies.push(
      await page
        .locator('main :is(p,h1,h2,h3,figcaption,a)')
        .evaluateAll((nodes) => nodes.map((node) => node.textContent)),
    );
  }
  expect(bodies[0]).toEqual(bodies[1]);
});

test('[TECH-100] portões: 404 sem copy em HTML/RSC/metadata; jornada independente permanece aberta', async ({
  request,
}) => {
  for (const [port, closed, open] of [
    [3101, '/brand-partner/sobre', '/sobre'],
    [3102, '/sobre', '/brand-partner/sobre'],
  ] as const) {
    const representations: readonly Record<string, string>[] = [
      {},
      { RSC: '1' },
      { RSC: '1', 'Next-Router-Prefetch': '1' },
    ];
    for (const headers of representations) {
      const response = await request.get(`http://127.0.0.1:${port}${closed}`, { headers });
      const body = normalize(await response.text());
      // After streaming starts, App Router carries notFound in the RSC envelope with HTTP 200.
      if (headers.RSC === '1') {
        expect([200, 404]).toContain(response.status());
        if (headers['Next-Router-Prefetch'] !== '1')
          expect(body).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
      } else expect(response.status()).toBe(404);
      expect(body).not.toContain(hero.title);
      expect(body).not.toContain(hero.lead);
      expect(body).not.toContain('marcos-rodopiano');
      expect(body).not.toMatch(/rel="canonical"[^>]*sobre/);
    }
    expect((await request.get(`http://127.0.0.1:${port}${open}`)).status()).toBe(200);
  }
});

test('fluxo a 390 px com toque: Home → Sobre → Como funciona → Home, em cada jornada', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  for (const journey of journeys) {
    await page.goto(`http://127.0.0.1:3100${journey.home}`);
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await page
      .getByRole('dialog', { name: 'Menu' })
      .getByRole('link', { name: text.navLabel, exact: true })
      .tap();
    await expect(page).toHaveURL(`http://127.0.0.1:3100${journey.path}`);
    await page.locator('#sobre').getByRole('link', { name: hero.action }).tap();
    await expect(page).toHaveURL(`http://127.0.0.1:3100${journey.how}`);
    await page.locator('.lx-header__inner > .lx-logo').tap();
    await expect(page).toHaveURL(`http://127.0.0.1:3100${journey.home}`);
  }
  await context.close();
});
