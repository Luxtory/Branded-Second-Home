import { expect, test } from '@playwright/test';
import {
  RATE_LIMITED_EMAIL,
  reachMfa,
  signIn,
  STAFF_EMAIL,
  TEST_CODE,
  VISITOR_EMAIL,
} from './support/auth';
import { collectConsoleErrors, expectAccessible, expectResponsive } from './support/ui';

test('[TECH-050] sem sessão, o Admin leva ao login; a tela de login tem axe 0', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entrar na Luxtory');
  // Layout focado (ADR-0009): o logo oficial leva o nome; sem overflow de 320 a 1920 px.
  await expect(page.getByRole('img', { name: 'Luxtory' })).toBeVisible();
  await expectResponsive(page, consoleErrors);
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

test('[TECH-050] "Reenviar código" reenvia para o mesmo e-mail e mantém o formulário do código; axe 0', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(STAFF_EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');

  await page.getByRole('button', { name: 'Reenviar código' }).click();
  await expect(page.getByRole('status')).toContainText('Novo código enviado');
  const code = page.getByLabel('Código recebido por e-mail');
  await expect(code).toBeVisible();
  await expect(code).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('input[name="email"]')).toHaveValue(STAFF_EMAIL);
  await expectAccessible(page, consoleErrors);

  // Enter no campo confirma o código (não reenvia) e o login segue para o segundo fator.
  await code.fill(TEST_CODE);
  await code.press('Enter');
  await expect(page).toHaveURL(/\/entrar\/mfa$/);
});

test('[TECH-050] reenvio barrado pelo limite do provedor: pede para aguardar e mantém o código; axe 0', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(RATE_LIMITED_EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');

  await page.getByRole('button', { name: 'Reenviar código' }).click();
  const notice = page.getByRole('status');
  await expect(notice).toContainText('Aguarde para pedir outro código');
  await expect(notice).toContainText('Espere antes de tentar de novo');
  const code = page.getByLabel('Código recebido por e-mail');
  await expect(code).toBeVisible();
  await expect(code).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('input[name="email"]')).toHaveValue(RATE_LIMITED_EMAIL);
  await expect(page.getByRole('button', { name: 'Reenviar código' })).toBeEnabled();
  await expectAccessible(page, consoleErrors);
});

test('[TECH-050] staff entra com código e TOTP (AAL2) e chega ao Admin; axe 0 e saída', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await signIn(page, STAFF_EMAIL);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administração');
  await expect(
    page
      .getByRole('term')
      .filter({ hasText: 'Papéis ativos' })
      .locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('Admin');
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
        scope: { type: 'home_concept', id: 'home-concept-1' },
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

test('[TECH-050] primeiro cadastro do TOTP é guiado: 3 passos, apps oficiais, chave manual copiável, axe 0', async ({
  page,
  context,
}) => {
  // Fluxo longo (login, cadastro e quatro análises do axe): tempo triplicado.
  test.slow();
  const consoleErrors = collectConsoleErrors(page);
  // Usuário novo (sem fator): o cadastro começa do passo 1.
  await reachMfa(page, 'novo-staff@luxtory.test');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Proteja sua conta com um aplicativo autenticador',
  );
  await expect(page.getByText(/além do código que chegou por e-mail/)).toBeVisible();
  await expect(page.getByText(/instale um destes aplicativos compatíveis/)).toBeVisible();
  for (const step of [
    '1. Instale ou abra um aplicativo autenticador',
    '2. Adicione a Luxtory ao aplicativo',
    '3. Digite o código do aplicativo',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible();
  }
  // Só páginas oficiais dos fornecedores ou das lojas; nenhuma recebe a chave.
  const hosts = await page
    .getByRole('link', { name: /Authenticator|1Password/ })
    .evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).host));
  expect(hosts).toEqual([
    'play.google.com',
    'apps.apple.com',
    'www.microsoft.com',
    'support.1password.com',
    'bitwarden.com',
  ]);
  await expectResponsive(page, consoleErrors);

  await page.getByRole('button', { name: 'Gerar QR Code' }).click();
  await expect(page.getByRole('img', { name: /QR Code/ })).toBeVisible();
  // A chave manual fica oculta até ser pedida.
  const copyButton = page.getByRole('button', { name: 'Copiar chave' });
  await expect(copyButton).toBeHidden();
  await page.getByText('Não consegue escanear?').click();
  await expect(
    page.getByText(/Inserir chave de configuração → Tipo baseado em tempo \(TOTP\)/),
  ).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'Chave copiada' })).toBeVisible();
  // A cópia é a chave exibida, sem os espaços de leitura.
  const shown = await page.locator('details code').textContent();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^[A-Z2-7]+$/);
  expect(copied).toBe(shown?.replaceAll(' ', ''));
  await expect(page.getByText(/muda a cada 30 segundos/)).toBeVisible();
  await expectResponsive(page, consoleErrors);

  // Código do aplicativo (6 dígitos) conclui o cadastro e leva ao Admin (usuário sem papel → 403).
  await page.getByLabel('Código de 6 dígitos do aplicativo').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Confirmar e entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('[TECH-050] sessão AAL1 não alcança o Admin: volta ao segundo fator', async ({ page }) => {
  await reachMfa(page, STAFF_EMAIL);

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
  await expect(page.getByText('Acesso negado')).toBeVisible();
  await expectResponsive(page, consoleErrors);
});
