import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { seedE2eCredits, setE2eCredits } from '../support/e2e-acquisition-database.mjs';
import { FLOW_TIMEOUT_MS, formalizedOwner, gate, job, MOBILE, titularFor } from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W17 E3 (spec credits §5.4; REQ-053, REQ-054, REQ-096, PD-008, TECH-044): Carteira do Titular com o PostgreSQL real.
// Nenhuma jornada origina ou gasta Créditos antes da W20–W23: o histórico é fato do fixture (`seedE2eCredits`). O
// Membership muda pela tela real do Admin (W15). A K4 `credits` liga só para o job `expire_credit_lots` registrar a
// expiração já vencida e desliga em seguida; nenhuma outra capability é tocada.
test.describe.configure({ mode: 'serial' });

const balance = (page: Page) => page.locator('section[aria-labelledby="carteira-saldo"]');
const lots = (page: Page) => page.getByRole('list', { name: 'Lotes' });
const statement = (page: Page) => page.getByRole('list', { name: 'Extrato' });
const situation = (page: Page, index: number) =>
  lots(page)
    .getByRole('listitem')
    .nth(index)
    .locator('.lx-record-list__meta-item')
    .filter({ hasText: 'Situação' })
    .locator('dd');
const balanceValue = (page: Page, label: string) =>
  balance(page).locator('.lx-evidence__item').filter({ hasText: label }).locator('dd');

async function activateMembership(page: Page, partyId: string) {
  await page.goto(`/admin/pessoas-e-empresas/${partyId}`);
  const membership = page.locator('section[aria-labelledby="party-membership"]');
  await membership.getByRole('link', { name: 'Ativar Membership' }).tap();
  await page.getByLabel('Base registrada').fill('Contrato de adesão W17');
  await page.getByRole('button', { name: 'Ativar Membership' }).tap();
  await expect(page.getByRole('status')).toContainText('Membership ativado.');
}

test.describe('W17 E3 — Carteira de Créditos na Área do Titular', () => {
  test.use(MOBILE);

  test('[REQ-053][REQ-054][REQ-096][PD-008][TECH-044] saldo por estado, lotes FEFO, extrato filtrável e Membership', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const { acquirer } = await formalizedOwner(page, `Second Home W17 ${randomUUID().slice(0, 6)}`);
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    const { lotA, lotB, lotC } = await seedE2eCredits(acquirer);
    const code = (id: string) => id.replaceAll('-', '').slice(0, 8).toUpperCase();

    try {
      // Área do Titular: a seção só aparece com lote visível; sem Membership, nada disponível para uso.
      await titular.goto('/titular');
      const area = titular.locator('section[aria-labelledby="titular-carteira"]');
      await expect(area).toContainText('Disponível agora');
      await expect(area).toContainText('0 Créditos');
      await area.getByRole('link', { name: 'Abrir a Carteira' }).tap();
      await expect(titular).toHaveURL(/\/titular\/carteira$/);

      // Sem Membership vigente: saldo válido "Indisponível por Membership", validade preservada [REQ-053][REQ-096].
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Carteira');
      await expect(balanceValue(titular, 'Indisponível por Membership')).toHaveText('89 Créditos');
      await expect(balanceValue(titular, 'Em Garantia')).toHaveText('20 Créditos');
      await expect(balanceValue(titular, 'Consumido')).toHaveText('11 Créditos');
      // Lote C vencido ontem e ainda sem o job: já é Expirado (TECH-044).
      await expect(balanceValue(titular, 'Expirado')).toHaveText('52,75 Créditos');
      await expect(balance(titular)).toContainText(
        'Uso indisponível enquanto o Membership não estiver vigente',
      );
      await expect(balance(titular).getByText('Disponível', { exact: true })).toHaveCount(0);
      // Unidade interna, não financeira: nenhum formato monetário, resgate, venda, cessão ou transferência.
      const main = titular.locator('main');
      await expect(main).not.toContainText('R$');
      await expect(main.getByRole('button', { name: /resgat|vend|ced|transfer/i })).toHaveCount(0);
      await gate(titular, errors, 'w17-01-carteira-sem-membership');

      // Lotes na ordem de uso (PD-008): vence antes primeiro.
      await expect(lots(titular).getByRole('heading', { level: 3 })).toHaveText([
        `Lote ${code(lotB)}`,
        `Lote ${code(lotC)}`,
        `Lote ${code(lotA)}`,
      ]);
      const first = lots(titular).getByRole('listitem').first();
      await expect(first).toContainText('Cessão em Request aceita');
      await expect(first).toContainText('40,5 Créditos');
      await expect(situation(titular, 0)).toHaveText('Expirado');
      await expect(situation(titular, 1)).toHaveText('Expirado');
      await expect(situation(titular, 2)).toHaveText('Indisponível por Membership');

      // Extrato [REQ-054]: data, tipo, quantidade, lote e operação; 27 movimentos em duas páginas.
      await expect(statement(titular).getByRole('listitem')).toHaveCount(20);
      const latest = statement(titular).getByRole('listitem').first();
      await expect(latest.getByRole('heading')).toHaveText('Entrada em Garantia');
      for (const label of ['Data', 'Quantidade', 'Lote', 'Operação'])
        await expect(latest).toContainText(label);
      await expect(latest).toContainText('20 Créditos');
      await expect(latest).toContainText(`Lote${code(lotA)}`);
      await expect(latest).toContainText('Envio de Request · ');
      await expect(titular.getByText('Página 1 de 2')).toBeVisible();
      await titular.getByRole('link', { name: 'Mais antigos' }).tap();
      await expect(titular).toHaveURL(/pagina=2/);
      await expect(statement(titular).getByRole('listitem')).toHaveCount(7);
      await expect(statement(titular).getByRole('listitem').last()).toContainText('Originação');
      await gate(titular, errors, 'w17-02-extrato-pagina-2');

      // Filtro por tipo, sem JavaScript obrigatório (formulário GET).
      await titular.getByLabel('Tipo de movimento').selectOption('expire');
      await titular.getByRole('button', { name: 'Filtrar' }).tap();
      await expect(titular).toHaveURL(/tipo=expire/);
      await expect(statement(titular).getByRole('listitem')).toHaveCount(1);
      await expect(statement(titular).getByRole('listitem')).toContainText(`Vencimento do lote · `);
      await expect(statement(titular)).toContainText(`Lote${code(lotB)}`);

      // O job registra a expiração do lote C sem mudar a validade [TECH-044]; K4 só durante o job.
      await setE2eCredits(true);
      try {
        await job(page, 'expire_credit_lots');
      } finally {
        await setE2eCredits(false);
      }
      await titular.reload();
      await expect(statement(titular).getByRole('listitem')).toHaveCount(2);
      await expect(statement(titular).getByRole('listitem').first()).toContainText(
        `Lote${code(lotC)}`,
      );
      await expect(statement(titular).getByRole('listitem').first()).toContainText(
        '12,25 Créditos',
      );
      await expect(balanceValue(titular, 'Expirado')).toHaveText('52,75 Créditos');

      // Admin ativa o Membership: o saldo válido volta a ser Disponível; nada vencido é restaurado [REQ-053].
      await activateMembership(page, acquirer);
      await titular.goto('/titular/carteira');
      await expect(balanceValue(titular, 'Disponível')).toHaveText('89 Créditos');
      await expect(balance(titular).getByText('Indisponível por Membership')).toHaveCount(0);
      await expect(balanceValue(titular, 'Expirado')).toHaveText('52,75 Créditos');
      await expect(situation(titular, 2)).toHaveText('Disponível');
      await gate(titular, errors, 'w17-03-carteira-vigente');
      await titular.goto('/titular');
      await expect(titular.locator('section[aria-labelledby="titular-carteira"]')).toContainText(
        '89 Créditos',
      );
      await gate(titular, errors, 'w17-04-area-titular');
    } finally {
      await context.close();
    }
  });

  test('sem lote: Carteira vazia e nenhuma seção na Área do Titular', async ({ page, browser }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const { acquirer } = await formalizedOwner(
      page,
      `Second Home W17b ${randomUUID().slice(0, 6)}`,
    );
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    try {
      await titular.goto('/titular');
      await expect(titular.locator('section[aria-labelledby="titular-carteira"]')).toHaveCount(0);
      await titular.goto('/titular/carteira');
      await expect(titular.getByText('Nenhum lote de Créditos.')).toBeVisible();
      await expect(titular.getByText('Nenhum movimento.')).toBeVisible();
      await expect(titular.getByLabel('Tipo de movimento')).toHaveCount(0);
      await gate(titular, errors, 'w17-05-carteira-vazia');
    } finally {
      await context.close();
    }
  });
});
