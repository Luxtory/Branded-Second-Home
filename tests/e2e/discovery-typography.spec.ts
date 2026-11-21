import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Home: os três pilares têm o mesmo peso no celular e no desktop', async ({ page }) => {
  const widths = [320, 390, 768, 1024, 1440, 1920];
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const pillars = page.locator('#possibilidade').getByRole('heading', { level: 3 });
  await expect(pillars).toHaveText(['Patrimônio', 'Liberdade', 'Pertencimento']);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await pillars.evaluateAll((nodes) =>
      nodes.map((node) => ({
        top: node.getBoundingClientRect().top,
        left: node.getBoundingClientRect().left,
        size: getComputedStyle(node).fontSize,
      })),
    );
    expect(new Set(layout.map((pillar) => pillar.size)).size, `${width}px`).toBe(1);
    expect(new Set(layout.map((pillar) => pillar.top)).size, `${width}px`).toBe(
      width < 768 ? 3 : 1,
    );
    expect(new Set(layout.map((pillar) => pillar.left)).size, `${width}px`).toBe(
      width < 768 ? 1 : 3,
    );
  }
});

test('Home: os títulos dos serviços têm duas linhas e alinham a primeira linha dos textos', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const headings = page.locator('#gestao').getByRole('heading', { level: 3 });
  await expect(headings).toHaveText([
    'Locação de temporada',
    'Second Home Development',
    'Second Home Partners',
  ]);

  for (const width of [390, 1024, 1265, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await headings.evaluateAll((nodes) =>
      nodes.map((node) => ({
        lines: Math.round(
          node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight),
        ),
        textTop: node.nextElementSibling?.getBoundingClientRect().top,
      })),
    );
    expect(
      layout.map((item) => item.lines),
      `${width}px`,
    ).toEqual([2, 2, 2]);
    if (width >= 1024) {
      expect(new Set(layout.map((item) => item.textTop)).size, `${width}px`).toBe(1);
    }
  }
});

test('Home: o fechamento aparece abaixo da foto, com o quadro inteiro', async ({ page }) => {
  await page.goto('/');
  const closing = page.locator('#convite');
  const photo = closing.locator('img');
  await photo.scrollIntoViewIfNeeded();
  await photo.evaluate((image) => (image as HTMLImageElement).decode());

  for (const width of [1265, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await closing.evaluate((section) => {
      const image = section.querySelector('img')!;
      const photoBox = image.getBoundingClientRect();
      return {
        photoBottom: photoBox.bottom,
        photoRatio: photoBox.width / photoBox.height,
        naturalRatio: image.naturalWidth / image.naturalHeight,
        titleTop: section.querySelector('h2')!.getBoundingClientRect().top,
        buttonTop: section.querySelector('a')!.getBoundingClientRect().top,
      };
    });
    expect(layout.titleTop, `${width}px`).toBeGreaterThanOrEqual(layout.photoBottom);
    expect(layout.buttonTop, `${width}px`).toBeGreaterThanOrEqual(layout.photoBottom);
    expect(layout.photoRatio, `${width}px`).toBeCloseTo(layout.naturalRatio, 2);
  }
});

test('B2C: fechamentos itálicos na escala de título de página; B2B preservado', async ({
  page,
}) => {
  test.slow();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    let referenceSize = 0;
    for (const path of ['/', '/como-funciona', '/colecao']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      if (path === '/') {
        referenceSize = await page
          .locator('#possibilidade .lx-display-m')
          .first()
          .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      }
      const closings = page.locator(
        'main :is(.lx-section-closing.lx-headline, .lx-section-closing :is(.lx-headline, .lx-subheadline, .lx-closing, .lx-body, .lx-lead), .lx-triad-statement__statement, .lx-triad-statement__closing, .lx-hero--closing :is(.lx-headline, .lx-subheadline, .lx-lead, .lx-body))',
      );
      expect(await closings.count(), path).toBeGreaterThan(0);
      const styles = await closings.evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return {
            text: node.textContent,
            size: Number.parseFloat(style.fontSize),
            italic: style.fontStyle,
          };
        }),
      );
      for (const style of styles) {
        expect(style.italic, `${path}: ${style.text}`).toBe('italic');
        expect(style.size, `${path}: ${style.text}`).toBe(referenceSize);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const accessibility = await new AxeBuilder({ page })
        .include('main')
        .exclude('.lx-eyebrow--accent')
        .analyze();
      expect(accessibility.violations, `${path} a ${width}px`).toEqual([]);
    }
    await page.goto('/brand-partner');
    const statement = page.locator('#expansao .lx-section-closing .lx-headline');
    await expect(statement).toHaveCSS('font-style', 'normal');
    expect(
      await statement.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThan(24);
  }
});
