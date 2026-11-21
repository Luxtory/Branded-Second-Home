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
