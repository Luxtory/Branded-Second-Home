import { expect, test } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { FLOW_TIMEOUT_MS, gate, MOBILE } from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W19 E3 (spec billing §4.4; ADR-0035 §10): relatório financeiro do Admin com o PostgreSQL real e toque a 390 px. Sem
// PSP configurado e com a K5 fechada: cobrança desativada, nenhum lançamento, toda categoria visível no próprio grupo e
// nenhum total consolidado.
test.describe('W19 E3 — financeiro no Admin', () => {
  test.use(MOBILE);

  test('[REQ-094][TECH-083][TECH-101] categorias separadas, sem total consolidado; cobrança desativada', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    test.setTimeout(FLOW_TIMEOUT_MS);
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/financeiro');
    await expect(page.getByRole('heading', { level: 1, name: 'Financeiro' })).toBeVisible();
    await expect(page.getByText('Cobrança: Desativada')).toBeVisible();
    await expect(
      page.locator('.lx-pricing__fact').filter({ hasText: 'Registro de pagamentos' }),
    ).toContainText('Fechado');
    for (const group of ['Receitas da Luxtory', 'Despesas', 'Obrigações com terceiros'])
      await expect(page.getByRole('heading', { level: 2, name: group })).toBeVisible();
    await expect(page.locator('section#luxchange_fee')).toContainText('Sem lançamentos');
    await expect(page.locator('section#luxchange_fee')).toContainText(
      'Apurado quando a Request é aceita',
    );
    for (const kind of ['brand_partner_obligation', 'investor_margin', 'titular_net'])
      await expect(page.locator(`section#${kind}`)).toContainText('Sem lançamento possível');
    await expect(page.getByText('Valores de categorias diferentes não se somam.')).toBeVisible();
    await expect(page.getByText(/^Total/)).toHaveCount(0);
    await gate(page, errors, 'w19-01-financeiro');
  });
});
