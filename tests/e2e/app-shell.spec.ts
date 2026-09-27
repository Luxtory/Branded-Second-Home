import { expect, test, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// App Shell das superfícies de produto (ADR-0009), com o Admin como primeiro consumidor.
const NAV = 'Navegação da administração';
const MIN_TARGET_PX = 44;

const menuButton = (page: Page) => page.getByRole('button', { name: 'Abrir menu' });
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Menu da administração' });
const sideNav = (page: Page) => page.getByRole('banner').getByRole('navigation', { name: NAV });

async function expectTargets(page: Page, selector: string) {
  const boxes = await page.locator(selector).evaluateAll((elements) =>
    elements
      .filter((element) => element.checkVisibility())
      .map((element) => ({
        name: element.textContent?.trim() ?? element.getAttribute('aria-label') ?? '',
        height: element.getBoundingClientRect().height,
      })),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) expect(box.height, box.name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

test.describe('celular (390 px, toque)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('[ADR-0009] fluxo principal a 390 px com toque: login → Admin; gaveta modal, Esc devolve o foco; axe 0 e sem overflow', async ({
    page,
  }) => {
    test.slow();
    const consoleErrors = collectConsoleErrors(page);
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administração');
    await expect(sideNav(page)).toBeHidden();

    await menuButton(page).tap();
    await expect(drawer(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    // showModal(): o resto da página fica inerte e o foco não sai da gaveta.
    expect(await drawer(page).evaluate((element) => element.matches(':modal'))).toBe(true);
    await expect(drawer(page).getByRole('link', { name: 'Início', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(drawer(page)).toContainText('Papéis ativos');
    await expect(drawer(page).getByRole('button', { name: 'Sair' })).toBeVisible();
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Tab');
      expect(
        await drawer(page).evaluate((element) => element.contains(document.activeElement)),
      ).toBe(true);
    }
    await expectTargets(page, 'dialog[open] :is(a, button)');

    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expectTargets(page, '.lx-app__bar :is(a, button)');

    await expectResponsive(page, consoleErrors);
  });
});

test.describe('corte do lg (64rem)', () => {
  test('[ADR-0009] 1023 px → barra + gaveta; 1024 px → navegação lateral; gaveta aberta fecha ao cruzar o lg e o foco vai ao conteúdo', async ({
    page,
  }) => {
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);

    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(menuButton(page)).toBeVisible();
    await expect(sideNav(page)).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(menuButton(page)).toBeHidden();
    await expect(sideNav(page)).toBeVisible();
    await expect(sideNav(page).getByRole('link', { name: 'Início', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectTargets(page, '.lx-app__bar :is(a, button)');

    await page.setViewportSize({ width: 1023, height: 800 });
    await menuButton(page).click();
    await expect(drawer(page)).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(drawer(page)).toBeHidden();
    await expect(page.locator('#conteudo')).toBeFocused();
  });

  test('[ADR-0009] teclado: o skip link é o 1º foco e leva ao conteúdo; sem animação com movimento reduzido', async ({
    page,
  }) => {
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await menuButton(page).click();
    await expect(drawer(page)).toBeVisible();
    expect(
      await drawer(page).evaluate((element) => getComputedStyle(element).animationDuration),
    ).toBe('0s');
  });
});
