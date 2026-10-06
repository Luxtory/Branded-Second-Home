import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Lab do Core Design System (docs/specs/design-system.md §13.8): axe 0 a 390 e 1440 px, sem overflow de 320 a 1920 px,
// teclado e dialog, carrossel pausável, movimento reduzido, alvos ≥ 44 px e contraste do hero medido nos pixels.
const PAGES = ['core.html', 'core-auth.html', 'core-admin.html'] as const;
const MIN_TARGET_PX = 44;
const MIN_TEXT = 4.5;
const MIN_LARGE = 3;

for (const name of PAGES) {
  test(`[ADR-0003] Lab do Core ${name}: axe 0, sem overflow de 320 a 1920 px, console limpo`, async ({
    page,
  }) => {
    test.slow();
    // Página assentada: sem autoplay do carrossel nem o giro infinito do botão ocupado (demo do estado aria-busy).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const consoleErrors = collectConsoleErrors(page);
    const response = await page.goto(`/lab/lab/${name}`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('html')).toHaveAttribute('data-lx', 'core');
    await expectResponsive(page, consoleErrors);
  });

  test(`[ADR-0009] Lab do Core ${name}: todo alvo interativo tem ≥ 44 px (exceto link dentro de texto)`, async ({
    page,
  }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/lab/lab/${name}`, { waitUntil: 'networkidle' });
      const small = await page.evaluate((min) => {
        const visible = (element: Element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        // WCAG 2.5.8: um link no meio de uma frase é exceção (o texto ao redor define a altura da linha).
        const inline = (element: Element) =>
          element.tagName === 'A' &&
          [...(element.parentElement?.childNodes ?? [])].some(
            (node) =>
              node !== element && node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
        const targets = document.querySelectorAll(
          'a[href], button, input:not([type="radio"]):not([type="checkbox"]), select, textarea, summary, label.lx-choice',
        );
        return [...targets]
          .filter(
            (element) =>
              !element.closest('dialog:not([open])') && !element.matches('.lx-skip-link'),
          )
          .filter((element) => visible(element) && !inline(element))
          .map((element) => {
            // Links esticados: o alvo é o card ou o item inteiro.
            const target = element.closest('.lx-collection-card, .lx-record-list__item') ?? element;
            const rect = target.getBoundingClientRect();
            return {
              text: (element.textContent ?? '').trim().slice(0, 40),
              width: rect.width,
              height: rect.height,
            };
          })
          .filter((target) => target.width < min || target.height < min)
          .map(
            (target) => `${target.text} (${Math.round(target.width)}×${Math.round(target.height)})`,
          );
      }, MIN_TARGET_PX);
      expect(small, `${name} a ${width}px`).toEqual([]);
    }
  });
}

test('[ADR-0009] Lab do Core: menu em dialog — foco entra, Esc fecha e devolve o foco ao gatilho', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lab/lab/core.html', { waitUntil: 'networkidle' });
  const trigger = page.locator('[data-lab-menu-open]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#menu-core');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.id)).toBe(
    'menu-core',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('[ADR-0009] Lab do Core (Admin): a gaveta fecha ao cruzar o lg e o foco vai ao conteúdo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lab/lab/core-admin.html', { waitUntil: 'networkidle' });
  await page.locator('[data-lab-menu-open]').click();
  await expect(page.locator('#menu-admin')).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(page.locator('#menu-admin')).not.toHaveAttribute('open', '');
  await expect(page.locator('#conteudo')).toBeFocused();
});

test('[WCAG 2.2.2] Cinematic Hero: carrossel pausável e navegável pelos controles', async ({
  page,
}) => {
  await page.goto('/lab/lab/core.html', { waitUntil: 'networkidle' });
  const toggle = page.locator('[data-lab-toggle]');
  await expect(toggle).toHaveAttribute('aria-label', 'Pausar carrossel');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Reproduzir carrossel');
  await page.locator('[data-lab-next]').click();
  await expect(page.locator('[data-lab-counter]')).toHaveText('02 / 03');
  await page.locator('[data-lab-prev]').click();
  await expect(page.locator('[data-lab-counter]')).toHaveText('01 / 03');
});

test('[WCAG 2.3.3] movimento reduzido: sem autoplay, sem animação, sem transform', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab/lab/core.html', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-lab-toggle]')).toHaveAttribute(
    'aria-label',
    'Reproduzir carrossel',
  );
  const state = await page.evaluate(() => {
    const reveals = [...document.querySelectorAll('[data-reveal]')].map((element) =>
      getComputedStyle(element),
    );
    return {
      running: document.getAnimations().filter((animation) => animation.playState === 'running')
        .length,
      hidden: reveals.filter((style) => style.opacity !== '1').length,
      moved: reveals.filter((style) => style.transform !== 'none').length,
    };
  });
  expect(state).toEqual({ running: 0, hidden: 0, moved: 0 });
});

/** Menor contraste entre a cor do texto e cada pixel do fundo real sob a caixa do texto (texto oculto na captura). */
async function worstContrastUnder(page: Page, selector: string): Promise<number> {
  const locator = page.locator(selector);
  const color = await locator.evaluate((element) => getComputedStyle(element).color);
  await locator.evaluate((element) => element.setAttribute('data-lab-measure', ''));
  await page.addStyleTag({
    content: '[data-lab-measure], [data-lab-measure] * { color: transparent !important; }',
  });
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`no box for ${selector}`);
  const png = await page.screenshot({ clip: box });
  return page.evaluate(
    async ({ data, textColor }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const [tr = 0, tg = 0, tb = 0] = (textColor.match(/\d+/g) ?? []).map(Number);
      const text = luminance(tr, tg, tb);
      let worst = Infinity;
      for (let i = 0; i < pixels.length; i += 4) {
        const background = luminance(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
        const [hi, lo] = text > background ? [text, background] : [background, text];
        worst = Math.min(worst, (hi + 0.05) / (lo + 0.05));
      }
      return worst;
    },
    { data: png.toString('base64'), textColor: color },
  );
}

test('[WCAG 1.4.3] Cinematic Hero: contraste medido nos pixels reais, em cada imagem, a 390 e 1440 px', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results: string[] = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const slide of [0, 1, 2]) {
      await page.goto('/lab/lab/core.html', { waitUntil: 'networkidle' });
      for (let step = 0; step < slide; step += 1) await page.locator('[data-lab-next]').click();
      await expect(page.locator('[data-lab-counter]')).toHaveText(`0${slide + 1} / 03`);
      await page
        .locator('.lx-hero__slide[data-active] img')
        .evaluate((image: HTMLImageElement) => image.decode());
      const headline = await worstContrastUnder(page, '#hero-title');
      const subheadline = await worstContrastUnder(page, '.lx-hero__copy .lx-subheadline');
      results.push(
        `${width}px slide ${slide + 1}: headline ${headline.toFixed(2)} · subheadline ${subheadline.toFixed(2)}`,
      );
      expect(
        headline,
        `headline Warm Sand (texto grande) ${width}px slide ${slide + 1}`,
      ).toBeGreaterThanOrEqual(MIN_LARGE);
      expect(
        subheadline,
        `subheadline Pure White ${width}px slide ${slide + 1}`,
      ).toBeGreaterThanOrEqual(MIN_TEXT);
    }
  }
  test.info().annotations.push({ type: 'hero-contrast', description: results.join(' | ') });
});
