import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Larguras de verificação do Design System (docs/specs/design-system.md): de 320 a 1920 px.
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];
const VIEWPORT_HEIGHT = 900;

test('[ADR-0003] /lab com axe 0 e sem overflow horizontal de 320 a 1920 px', async ({ page }) => {
  const response = await page.goto('/lab');
  expect(response?.status()).toBe(200);
  expect(page.url()).toMatch(/\/lab\/lab\/index\.html$/);
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(0);
  }
});
