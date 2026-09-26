import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Autenticação de teste (AUTH_MODE=test, ADR-0005 §7): código de login e TOTP determinísticos. Os usuários e o papel
// Admin do staff são criados por tests/support/e2e-server.mjs.
const TEST_CODE = '123456';
const STAFF_EMAIL = 'staff@luxtory.test';
const VISITOR_EMAIL = 'visitante@luxtory.test';
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`);
  });
  return errors;
}

/** Erros de console conferidos antes do axe: ele gera 404 falsos ao reler as folhas de estilo (NOTES §4). */
async function expectAccessible(page: Page, consoleErrors: readonly string[]) {
  expect(consoleErrors).toEqual([]);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((violation) => `${viewport.width}: ${violation.id}`)).toEqual([]);
  }
}

async function signIn(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
  await page.getByLabel('Código recebido por e-mail').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar\/mfa$/);
  await page.getByRole('button', { name: 'Configurar aplicativo autenticador' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  await page.getByLabel('Código do aplicativo autenticador').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Confirmar' }).click();
}

test('[TECH-050] sem sessão, o Admin leva ao login; a tela de login tem axe 0', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entrar na Luxtory');
  await expectAccessible(page, consoleErrors);
});

test('[TECH-050] código inválido é recusado com mensagem acessível', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(STAFF_EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código recebido por e-mail').fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // O Next.js tem o próprio `role="alert"` (anunciador de rota): filtra pelo texto.
  await expect(
    page.getByRole('alert').filter({ hasText: 'Código inválido ou expirado' }),
  ).toBeVisible();
  await expect(page.getByLabel('Código recebido por e-mail')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expectAccessible(page, consoleErrors);
});

test('[TECH-050] staff entra com código e TOTP (AAL2) e chega ao Admin; axe 0 e saída', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await signIn(page, STAFF_EMAIL);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administração');
  await expect(page.getByRole('definition')).toHaveText('Admin');
  await expectAccessible(page, consoleErrors);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('[REQ-014] Admin logado chama a API pelo navegador: sessão aceita, e na W2 nenhum grant é criável', async ({
  page,
}) => {
  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);

  // Mesma origem e cookies do navegador: a sessão emitida pela tela vale na rota da API.
  const response = await page.evaluate(async () => {
    const result = await fetch('/v1/admin/authorization-grants', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'e2e-grant-1' },
      body: JSON.stringify({
        grantee_party_id: '00000000-0000-4000-8000-0000000000c1',
        commands: ['formalize_acquisition'],
        scope: { type: 'concept', id: 'concept-1' },
        valid_from: '2026-09-01T00:00:00Z',
        valid_until: '2026-10-01T00:00:00Z',
        basis: 'Instrumento de teste',
      }),
    });
    return { status: result.status, body: (await result.json()) as { code: string } };
  });

  // D-W2-1: nenhuma operação é concedível na W2 → recusa de validação, nunca 401/500.
  expect(response).toEqual({
    status: 400,
    body: expect.objectContaining({ code: 'ERR_VALIDATION' }),
  });
});

test('[TECH-050] sessão AAL1 não alcança o Admin: volta ao segundo fator', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(STAFF_EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código recebido por e-mail').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar\/mfa$/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/entrar\/mfa$/);
});

test('[REQ-014] existir não concede acesso: usuário autenticado sem papel vê 403, sem dado', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await signIn(page, VISITOR_EMAIL);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Esta área é restrita à equipe administrativa da Luxtory.',
  );
  await expect(page.getByText('Papéis ativos')).toHaveCount(0);
  await expectAccessible(page, consoleErrors);
});
