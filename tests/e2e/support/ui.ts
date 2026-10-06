import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// Gate de UI de toda tela nova (ADR-0009): axe a 390 e 1440 px e varredura de overflow de 320 a 1920 px, incluindo
// os dois lados do `lg` (1023/1024), onde o shell troca a gaveta pela navegação lateral.
export const AXE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
export const OVERFLOW_WIDTHS = [320, 360, 390, 768, 1023, 1024, 1440, 1920] as const;
const SWEEP_HEIGHT = 900;

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`);
  });
  return errors;
}

/** Ponteiro fora dos controles e nenhuma transição em curso: o axe mede a página assentada, não o hover. */
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/**
 * Exceção registrada (decisão do fundador, 2026-10-06; spec catalog §13.10): os eyebrows Warm Sand sobre Moroccan Blue
 * da Home (`.lx-eyebrow--accent`) medem 4,32:1 a 12 px. Só a regra `color-contrast` e só esses elementos são
 * tolerados; qualquer outro nó ou regra continua reprovando.
 */
const CONTRAST_EXCEPTION = 'lx-eyebrow--accent';

type AxeViolation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

function withoutRecordedException(violations: readonly AxeViolation[]) {
  return violations
    .map((violation) =>
      violation.id === 'color-contrast'
        ? {
            ...violation,
            nodes: violation.nodes.filter(
              (node) => !node.target.some((target) => String(target).includes(CONTRAST_EXCEPTION)),
            ),
          }
        : violation,
    )
    .filter((violation) => violation.nodes.length > 0);
}

/**
 * Erros de console conferidos antes do axe: ele gera 404 falsos ao reler as folhas de estilo (NOTES §4). O título
 * precisa estar aplicado (a metadata chega em streaming depois da navegação). Devolve o viewport original.
 */
export async function expectAccessible(page: Page, consoleErrors: readonly string[]) {
  const original = page.viewportSize();
  expect(consoleErrors).toEqual([]);
  await expect(page).toHaveTitle(/\S/);
  for (const viewport of AXE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      withoutRecordedException(violations).map((violation) => `${viewport.width}: ${violation.id}`),
    ).toEqual([]);
  }
  if (original !== null) await page.setViewportSize(original);
}

/**
 * Sem overflow horizontal **não intencional** do documento (ADR-0009). Rolagem deliberada dentro de um componente de
 * dados não conta: ela fica contida e não alarga o documento.
 */
export async function expectNoDocumentOverflow(page: Page) {
  const original = page.viewportSize();
  for (const width of OVERFLOW_WIDTHS) {
    await page.setViewportSize({ width, height: SWEEP_HEIGHT });
    // WebKit pode resolver o resize antes do reflow completo (especialmente quando <picture> troca de source).
    // Aguarda dois frames para medir o layout assentado, sem mascarar overflow real.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow horizontal do documento em ${width}px`).toBeLessThanOrEqual(0);
  }
  if (original !== null) await page.setViewportSize(original);
}

/** Gate completo de uma tela: overflow de 320 a 1920 px, console limpo e axe 0 a 390 e 1440 px. */
export async function expectResponsive(page: Page, consoleErrors: readonly string[]) {
  await expectNoDocumentOverflow(page);
  await expectAccessible(page, consoleErrors);
}

/**
 * Capturas de revisão dos checkpoints (material do PR, não baseline — ADR-0009): só com `UI_CAPTURE_DIR`, a 390 e
 * 1440 px, página inteira e assentada.
 */
export async function captureForReview(page: Page, name: string) {
  const dir = process.env.UI_CAPTURE_DIR;
  if (dir === undefined || dir === '') return;
  const original = page.viewportSize();
  for (const viewport of AXE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await settle(page);
    await page.screenshot({ path: `${dir}/${name}-${viewport.width}.png`, fullPage: true });
  }
  if (original !== null) await page.setViewportSize(original);
}
