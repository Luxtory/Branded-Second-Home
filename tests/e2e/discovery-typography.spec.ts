import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { discoveryMessages } from '../../src/features/catalog/presentation/i18n/discovery-pt-br';

const widths = [320, 360, 390, 768, 1024, 1440];
const panelCopy = discoveryMessages.home.rule.panel;

test('B2C: alternativas lado a lado, mesma escala dos resultados e seleção Warm Sand por teclado', async ({
  page,
}) => {
  test.slow();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const panel = page.locator('.lx-panel-switch');
    for (let index = 0; index < panelCopy.alternatives.length; index++) {
      const alternative = panelCopy.alternatives[index]!;
      const radio = panel.getByRole('radio', { name: alternative.label, exact: true });
      if (index === 0) await radio.focus();
      else await page.keyboard.press('ArrowRight');
      await expect(radio).toBeChecked();
      await expect(panel.locator('dd')).toHaveText([...alternative.values]);
      const layout = await panel.evaluate((node) => {
        const card = node.getBoundingClientRect();
        const options = [...node.querySelectorAll('.lx-panel-switch__option')];
        const texts = [...node.querySelectorAll('.lx-panel-switch__option > span, dt, dd')];
        const selected = node.querySelector('label:has(input:checked)')!;
        return {
          card: card.toJSON(),
          options: options.map((option) => option.getBoundingClientRect().toJSON()),
          sizes: texts.map((text) => Number.parseFloat(getComputedStyle(text).fontSize)),
          selected: getComputedStyle(selected).color,
          remaining: options
            .filter((option) => option !== selected)
            .map((option) => getComputedStyle(option).color),
        };
      });
      expect(new Set(layout.options.map((box) => box.top)).size, `${width}px: uma linha`).toBe(1);
      for (const box of layout.options) {
        expect(box.left).toBeGreaterThanOrEqual(layout.card.left);
        expect(box.right).toBeLessThanOrEqual(layout.card.right + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(new Set(layout.sizes).size, `${width}px: uma escala`).toBe(1);
      expect(layout.sizes[0]).toBeGreaterThanOrEqual(14);
      expect(layout.sizes[0]).toBeLessThanOrEqual(24);
      expect(layout.selected).toBe('rgb(205, 173, 142)');
      expect(layout.remaining.every((color) => color !== layout.selected)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
});

test('B2C: fechamentos menores e itálicos na Home, Como funciona e Coleção; B2B preservado', async ({
  page,
}) => {
  test.slow();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/', '/como-funciona', '/colecao']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
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
        expect(style.size, `${path}: ${style.text}`).toBeLessThanOrEqual(24);
        expect(style.size).toBeGreaterThanOrEqual(15);
      }
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
