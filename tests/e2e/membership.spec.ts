import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { randomCpf } from '../support/documents';
import {
  FLOW_TIMEOUT_MS,
  formalizedOwner,
  gate,
  job,
  MOBILE,
  post,
  titularFor,
} from './support/own-use';
import { signIn, STAFF_EMAIL } from './support/auth';
import { collectConsoleErrors } from './support/ui';

// W15 E4 (spec identity §15, ADR-0031): ciclo do Membership pelas telas reais do Admin e visão do Titular, com o
// PostgreSQL real e os jobs reais (outbox → central de notificações). Nenhuma capability (K1/K2/K3) é ligada.
test.describe.configure({ mode: 'serial' });

const membership = (page: Page) => page.locator('section[aria-labelledby="party-membership"]');

/** Mudança pela tela de confirmação, com a base registrada; volta ao detalhe com o aviso. */
async function changeMembership(page: Page, action: string, submit: string, notice: string) {
  await membership(page).getByRole('link', { name: action, exact: true }).tap();
  await page.getByLabel('Base registrada').fill('Decisão registrada da Luxtory W15');
  await page.getByRole('button', { name: submit }).tap();
  await expect(page.getByRole('status')).toContainText(notice);
}

test.describe('W15 E4 — Membership: Admin e Área do Titular', () => {
  test.use(MOBILE);

  test('[REQ-095][TECH-055][REQ-097][REQ-050] Admin ativa, suspende, reativa e encerra; Titular vê a situação e os avisos', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    const { acquirer } = await formalizedOwner(page, `Second Home W15 ${randomUUID().slice(0, 6)}`);

    await page.goto(`/admin/pessoas-e-empresas/${acquirer}`);
    await expect(membership(page)).toContainText('Sem Membership');
    await expect(membership(page).getByRole('link')).toHaveText(['Ativar Membership']);
    await gate(page, errors, 'w15-01-admin-sem-membership');

    // Ativação: base com forma de dado pessoal é recusada no campo; depois confirma.
    await membership(page).getByRole('link', { name: 'Ativar Membership' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ativar Membership');
    await gate(page, errors, 'w15-02-ativar');
    await page.getByLabel('Base registrada').fill('Pedido de contato@exemplo.test');
    await page.getByRole('button', { name: 'Ativar Membership' }).tap();
    // O anunciador de rotas do Next também é `role="alert"`: filtra pelo texto.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Confira os campos destacados.' }),
    ).toBeVisible();
    await page.getByLabel('Base registrada').fill('Contrato de adesão W15');
    await page.getByRole('button', { name: 'Ativar Membership' }).tap();
    await expect(page.getByRole('status')).toContainText('Membership ativado.');
    await expect(membership(page)).toContainText('Vigente');
    await expect(membership(page).getByRole('link')).toHaveText(['Suspender', 'Encerrar']);
    await gate(page, errors, 'w15-03-admin-vigente');

    await changeMembership(page, 'Suspender', 'Suspender Membership', 'Membership suspenso.');
    await expect(
      membership(page).getByRole('list', { name: 'Histórico do Membership' }).getByRole('listitem'),
    ).toHaveCount(2);
    await gate(page, errors, 'w15-04-admin-suspenso');

    // Titular: situação na Área e na representação, com o texto de que direitos e compromissos não mudam.
    const { titular, context } = await titularFor(page, browser, acquirer);
    const titularErrors = collectConsoleErrors(titular);
    await titular.goto('/titular');
    await expect(titular.getByText('Suspenso')).toBeVisible();
    await gate(titular, titularErrors, 'w15-05-titular-area');
    await titular.goto(`/titular/representacoes/${acquirer}`);
    const section = titular.locator('section[aria-labelledby="titular-membership"]');
    await expect(section).toContainText('Suspenso');
    await expect(section).toContainText(
      'não altera a propriedade, o Direito de Uso nem as reservas e compromissos',
    );
    await gate(titular, titularErrors, 'w15-06-titular-representacao');

    // Reativação e encerramento; os avisos chegam pela central depois do job do outbox.
    await changeMembership(page, 'Reativar', 'Reativar Membership', 'Membership reativado.');
    await changeMembership(page, 'Encerrar', 'Encerrar Membership', 'Membership encerrado.');
    await expect(membership(page)).toContainText('Encerrado');
    await expect(membership(page).getByRole('link')).toHaveText(['Reativar']);
    await job(page, 'outbox');
    await titular.goto('/titular/notificacoes');
    for (const title of [
      'Membership ativado',
      'Membership suspenso',
      'Membership reativado',
      'Membership encerrado',
    ])
      await expect(titular.getByText(title, { exact: true })).toBeVisible();
    await gate(titular, titularErrors, 'w15-07-titular-notificacoes');
    await titular.goto(`/titular/representacoes/${acquirer}`);
    await expect(section).toContainText('Encerrado');
    await context.close();
  });

  test('[PD-001][D2] pessoa ou empresa sem Second Home vigente não ativa: recusa clara, nada gravado', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    const party = (await post(page, '/v1/admin/parties', { document: randomCpf() })).id;
    await page.goto(`/admin/pessoas-e-empresas/${party}/membership/ativar`);
    await page.getByLabel('Base registrada').fill('Contrato de adesão W15');
    await page.getByRole('button', { name: 'Ativar Membership' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'não tem Second Home vigente' }),
    ).toBeVisible();
    await gate(page, errors, 'w15-08-admin-recusa-sem-holding');
    await page.goto(`/admin/pessoas-e-empresas/${party}`);
    await expect(membership(page)).toContainText('Sem Membership');
    // Mudança fora da TECH-055 não tem tela (404 sem oráculo).
    await page.goto(`/admin/pessoas-e-empresas/${party}/membership/suspender`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registro não encontrado.');
  });
});
