import { expect, type Page } from '@playwright/test';

// Autenticação de teste (AUTH_MODE=test, ADR-0005 §7): código de login e TOTP determinísticos. Os usuários e o papel
// Admin do staff são criados por tests/support/e2e-server.mjs.
export const TEST_CODE = '123456';
export const STAFF_EMAIL = 'staff@luxtory.test';
export const VISITOR_EMAIL = 'visitante@luxtory.test';
// O adapter de teste simula o limite de envio do provedor para este endereço (TEST_RATE_LIMITED_EMAIL): só o primeiro
// envio do processo passa.
export const RATE_LIMITED_EMAIL = 'limite@luxtory.test';

/** Código por e-mail → segundo fator (cadastra o TOTP no primeiro acesso, senão só confirma o código). */
export async function signIn(page: Page, email: string) {
  await reachMfa(page, email);
  const enroll = page.getByRole('button', { name: 'Gerar QR Code' });
  const challenge = page.getByLabel('Código de 6 dígitos do aplicativo');
  await expect(enroll.or(challenge)).toBeVisible();
  if (await enroll.isVisible()) {
    await enroll.click();
    await expect(page.getByRole('img', { name: /QR Code/ })).toBeVisible();
  }
  await page.getByLabel('Código de 6 dígitos do aplicativo').fill(TEST_CODE);
  await page.getByRole('button', { name: /^Confirmar/ }).click();
}

/** Código por e-mail até a tela do segundo fator. */
export async function reachMfa(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
  await page.getByLabel('Código recebido por e-mail').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar\/mfa$/);
}
