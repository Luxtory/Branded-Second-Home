import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('página 404 em pt-BR, com o Design System e axe 0', async ({ page }) => {
  // O 404 do próprio documento é esperado; qualquer outro erro de console (ex.: favicon) não.
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/pagina-que-nao-existe')) {
      consoleErrors.push(`${message.text()} @ ${message.location().url}`);
    }
  });
  const response = await page.goto('/pagina-que-nao-existe', { waitUntil: 'networkidle' });

  expect(response?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página não encontrada.');
  const fontFamily = await page
    .getByRole('heading', { level: 1 })
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain('Newsreader');

  expect(consoleErrors).toEqual([]);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});
