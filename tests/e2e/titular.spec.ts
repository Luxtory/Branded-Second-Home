import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { maskOfCpf, punctuatedCpf, randomCpf, validCnpj } from '../support/documents';
import { signIn, STAFF_EMAIL, TEST_CODE, VISITOR_EMAIL } from './support/auth';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// W7 (spec identity §13): party cifrada, convite pendente até a ativação e Área do Titular sob RLS. Autenticação de
// teste (AUTH_MODE=test): código e convite determinísticos. O banco é compartilhado: cada teste usa documentos e
// e-mails próprios.
const FLOW_TIMEOUT_MS = 300_000;
const MOBILE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  timezoneId: 'America/Sao_Paulo',
  locale: 'pt-BR',
} as const;

const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@luxtory.test`;

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext(MOBILE);
  return context.newPage();
}

/** API do Admin com a sessão da página (origem, Idempotency-Key): só para preparar dados que o teste não exercita. */
async function adminPost(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data,
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
  return response.json();
}

/** Primeiro acesso de conta convidada: e-mail + código do convite. */
async function acceptInvite(page: Page, email: string) {
  await page.goto('/titular/ativar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Código do convite').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Continuar' }).tap();
  await expect(page).toHaveURL(/\/titular$/);
}

/** Login na Área do Titular por código (sem segundo fator: TECH-050 só exige MFA do staff). */
async function titularSignIn(page: Page, email: string) {
  await page.goto('/titular/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).tap();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
  await page.getByLabel('Código recebido por e-mail').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Entrar' }).tap();
  await expect(page).toHaveURL(/\/titular$/);
}

test.describe('Representações a 390 px com toque', () => {
  test.use(MOBILE);

  test('[TECH-050] [TECH-052] [TECH-100] Admin cadastra e convida; o convidado ativa e vê só a própria party; revogação vale na hora', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const consoleErrors = collectConsoleErrors(page);
    const heading = page.getByRole('heading', { level: 1 });
    const gate = async (target: Page, errors: readonly string[], name: string) => {
      await expectResponsive(target, errors);
      await captureForReview(target, name);
    };
    const cpf = randomCpf();
    const email = uniqueEmail('titular-a');

    // Admin: cadastro da pessoa (CPF com pontuação) → dados com o documento só mascarado.
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/pessoas-e-empresas');
    await expect(heading).toHaveText('Pessoas e empresas');
    await gate(page, consoleErrors, 'w7-01-pessoas-e-empresas');
    await page.getByRole('link', { name: 'Cadastrar pessoa ou empresa' }).tap();
    await page.getByLabel('CPF ou CNPJ').fill('123');
    await page.getByRole('button', { name: 'Cadastrar' }).tap();
    await expect(page.getByText('CPF ou CNPJ inválido. Confira os dígitos.')).toBeVisible();
    await gate(page, consoleErrors, 'w7-02-cadastro-erro');
    await page.getByLabel('CPF ou CNPJ').fill(punctuatedCpf(cpf));
    await page.getByRole('button', { name: 'Cadastrar' }).tap();
    await expect(page.getByRole('status')).toContainText('Pessoa ou empresa cadastrada.');
    await expect(heading).toHaveText(maskOfCpf(cpf));
    await expect(page.getByText(cpf)).toHaveCount(0);
    await gate(page, consoleErrors, 'w7-03-pessoa-ou-empresa');
    const partyUrl = page.url();

    // Convite em dois passos: e-mail conferido e documento mascarado no resumo.
    await page.getByRole('link', { name: 'Convidar representante' }).tap();
    await page.getByLabel('E-mail do representante').fill(email);
    await page.getByLabel('Confirme o e-mail').fill(`x${email}`);
    await page.getByLabel('Base registrada').fill('Procuração E2E');
    await page.getByRole('button', { name: 'Revisar convite' }).tap();
    await expect(page.getByText('Os e-mails não conferem.')).toBeVisible();
    await page.getByLabel('Confirme o e-mail').fill(email);
    await page.getByRole('button', { name: 'Revisar convite' }).tap();
    await expect(page.getByRole('heading', { name: 'Confira antes de convidar' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(maskOfCpf(cpf))).toBeVisible();
    await gate(page, consoleErrors, 'w7-04-convite-resumo');
    await page.getByRole('button', { name: 'Confirmar convite' }).tap();
    await expect(page.getByRole('status')).toContainText('Convite registrado.');
    await expect(page.getByText('Convite pendente')).toBeVisible();

    // Outra party (empresa, CNPJ alfanumérico): B.
    const other = await adminPost(page, '/v1/admin/parties', {
      document: validCnpj(
        `${randomUUID()
          .slice(0, 4)
          .toUpperCase()
          .replace(/[^0-9A-Z]/g, 'Z')}55667788`,
      ),
    });

    // Convidado: primeiro acesso pelo código do convite → convite pendente, sem nenhum dado da party.
    const titular = await newPage(browser);
    const titularErrors = collectConsoleErrors(titular);
    await titular.goto('/titular/ativar');
    await gate(titular, titularErrors, 'w7-05-primeiro-acesso');
    await acceptInvite(titular, email);
    await expect(titular.getByRole('heading', { name: 'Convites pendentes' })).toBeVisible();
    await expect(titular.getByText(maskOfCpf(cpf))).toHaveCount(0);
    await gate(titular, titularErrors, 'w7-06-convite-pendente');
    await titular.getByRole('button', { name: 'Ativar representação' }).tap();
    await expect(titular.getByRole('status')).toContainText('Representação ativada.');
    await expect(titular.getByText(`CPF ${maskOfCpf(cpf)}`)).toBeVisible();
    await gate(titular, titularErrors, 'w7-07-area-do-titular');
    await titular.getByRole('link', { name: `CPF ${maskOfCpf(cpf)}` }).tap();
    await expect(titular.getByRole('heading', { level: 1 })).toHaveText(`CPF ${maskOfCpf(cpf)}`);
    await gate(titular, titularErrors, 'w7-08-representacao');

    // A não abre a party de B nem um id qualquer: 404, sem oráculo.
    const forbidden = await titular.goto(`/titular/representacoes/${other.id as string}`);
    expect(forbidden?.status()).toBe(404);
    expect((await titular.goto(`/titular/representacoes/${randomUUID()}`))?.status()).toBe(404);

    // Revogação pelo Admin: a próxima navegação do Titular já não mostra a party.
    await page.goto(partyUrl);
    await page.getByRole('link', { name: 't***@luxtory.test' }).tap();
    await expect(heading).toHaveText('Revogar representação');
    await gate(page, consoleErrors, 'w7-09-revogacao');
    await page.getByLabel('Base da revogação').fill('Fim da procuração E2E');
    await page.getByRole('button', { name: 'Revogar' }).tap();
    await expect(page.getByRole('status')).toContainText('Representação revogada.');
    await titular.goto('/titular');
    await expect(
      titular.getByRole('heading', {
        name: 'Esta conta não representa nenhuma pessoa ou empresa na Luxtory.',
      }),
    ).toBeVisible();
  });

  test('[TECH-050] usuário autenticado sem delegação é negado, sem dado; conta existente ativa ao entrar', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const consoleErrors = collectConsoleErrors(page);
    await titularSignIn(page, VISITOR_EMAIL);
    await expect(page.getByText('Acesso negado', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Esta conta não representa nenhuma pessoa ou empresa na Luxtory.',
      }),
    ).toBeVisible();
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, 'w7-10-acesso-negado');

    // Conta existente (já entrou por código): o convite não cria conta nem envia e-mail; fica pendente até ativar.
    const staff = await newPage(browser);
    await signIn(staff, STAFF_EMAIL);
    await expect(staff).toHaveURL(/\/admin$/);
    const party = await adminPost(staff, '/v1/admin/parties', { document: randomCpf() });
    const delegation = await adminPost(
      staff,
      `/v1/admin/parties/${party.id as string}/delegations`,
      {
        email: VISITOR_EMAIL,
        basis: 'Contrato social E2E',
      },
    );
    expect(delegation).toMatchObject({ state: 'pending' });

    await page.goto('/titular');
    await expect(page.getByRole('heading', { name: 'Convites pendentes' })).toBeVisible();
    await page.getByRole('button', { name: 'Ativar representação' }).tap();
    await expect(page.getByRole('status')).toContainText('Representação ativada.');
    await expect(page.getByRole('link', { name: /^CPF \*\*\*\./ })).toBeVisible();

    await adminPost(staff, `/v1/admin/party-delegations/${delegation.id as string}/revoke`, {
      revocation_basis: 'Encerramento E2E',
    });
    await page.goto('/titular');
    await expect(page.getByText('Acesso negado', { exact: true })).toBeVisible();
  });
});

test.describe('Representações a 1440 px', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
  });

  test('[TECH-050] sem sessão a Área do Titular leva ao login do Titular; primeiro acesso com código errado é genérico', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/titular');
    await expect(page).toHaveURL(/\/titular\/entrar$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Área do Titular');
    await expectResponsive(page, consoleErrors);

    await page.getByRole('link', { name: /primeiro acesso/ }).click();
    await page.getByLabel('E-mail').fill(uniqueEmail('sem-convite'));
    await page.getByLabel('Código do convite').fill(TEST_CODE);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#invite-error')).toContainText('Código inválido ou expirado.');
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, 'w7-11-primeiro-acesso-erro');
  });
});
