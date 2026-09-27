import { expect, test } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { expectNoDocumentOverflow } from './support/ui';

// Smoke Playwright WebKit (ADR-0009): motor do Safari em emulação de iPhone (390 px, toque). Não equivale a
// Safari/iOS real — aparelhos reais ficam na QA de release/go-live.
test('[ADR-0009] WebKit: login com código e TOTP chega ao Admin; gaveta abre e fecha; sem overflow', async ({
  page,
}) => {
  test.slow();
  await page.goto('/entrar');
  await expectNoDocumentOverflow(page);

  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administração');

  const drawer = page.getByRole('dialog', { name: 'Menu da administração' });
  await page.getByRole('button', { name: 'Abrir menu' }).tap();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Início', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Fechar menu' }).tap();
  await expect(drawer).toBeHidden();
  await expectNoDocumentOverflow(page);
});
