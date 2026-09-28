import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Larguras de verificação do Design System (docs/specs/design-system.md): de 320 a 1920 px.
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];
const VIEWPORT_HEIGHT = 900;

test('[ADR-0003] /lab com axe 0 e sem overflow horizontal de 320 a 1920 px', async ({ page }) => {
  // O axe da página inteira do Lab, em paralelo com os fluxos longos do Admin, passa dos 30 s padrão.
  test.slow();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push(`${message.text()} @ ${message.location().url}`);
  });
  const response = await page.goto('/lab', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(page.url()).toMatch(/\/lab\/lab\/index\.html$/);
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(0);
  }
  // Antes do axe: ele rebaixa as folhas de estilo por XHR e resolve `@import` aninhado relativo à página,
  // gerando 404 que não existem no carregamento real.
  expect(consoleErrors).toEqual([]);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

test('[ADR-0009] Lab: App Shell e layout focado de demonstração com axe 0 e sem overflow de 320 a 1920 px', async ({
  context,
}) => {
  // Dois gates responsivos completos (varredura 320–1920 + axe) passam dos 30 s padrão com a suíte em paralelo.
  test.slow();
  for (const file of ['produto-app.html', 'produto-focado.html']) {
    // Página nova por arquivo: erros de console (e os 404 falsos do axe) não passam de uma para outra.
    const page = await context.newPage();
    const consoleErrors = collectConsoleErrors(page);
    const response = await page.goto(`/lab/lab/${file}`, { waitUntil: 'networkidle' });
    expect(response?.status(), file).toBe(200);
    await expectResponsive(page, consoleErrors);
    await page.close();
  }
});
