import { expect, test, type Locator } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { FLOW_TIMEOUT_MS, gate, MOBILE } from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W18 E3 (spec pricing §5 "Políticas comerciais"; ADR-0034): políticas comerciais pela tela real do Admin, com o
// PostgreSQL real e toque a 390 px. Todos os mecanismos começam ausentes (nenhuma política presumida); a publicação passa
// por campos em branco recusados (nada vira zero), regra estrutural recusada (faixas sem cobertura até o check-in),
// revisão com a política como o Titular a verá, o aceite em prévia e as consequências, e confirmação. Valores de TESTE
// arbitrários, só no banco efêmero do E2E; nenhuma capability é ligada.
test.describe.configure({ mode: 'serial' });

const field = (section: Locator, name: string) => section.locator(`#luxplus-${name}`);

test.describe('W18 E3 — políticas comerciais no Admin', () => {
  test.use(MOBILE);

  test('[PD-009][REQ-082][REQ-104][TECH-032] ausente por padrão; publicação revisada, regras recusadas e versão vigente', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    test.setTimeout(FLOW_TIMEOUT_MS);
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/politicas');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Políticas comerciais' }),
    ).toBeVisible();
    for (const mechanism of ['luxchange_request', 'luxchange_direct', 'rental_external'])
      await expect(page.locator(`section#${mechanism}`)).toContainText(
        'Nenhuma operação deste mecanismo pode confirmar.',
      );
    await gate(page, errors, 'w18-01-politicas-ausentes');

    const luxplus = page.locator('section#luxplus');
    await luxplus.getByText('Publicar nova versão').tap();
    await expect(luxplus).toContainText('não configurável');
    // Faixa sem os efeitos de no-show e exceção: campos em branco nunca viram zero.
    await field(luxplus, 't0_hours').fill('24');
    await field(luxplus, 't0_money').fill('50');
    await luxplus.getByLabel('Base registrada').fill('Ata sintética W18 E2E');
    await luxplus.getByRole('button', { name: 'Revisar' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Revise os campos indicados.' }),
    ).toBeVisible();
    await expect(field(luxplus, 'no_show_money')).toHaveAttribute('aria-invalid', 'true');

    // REQ-104: a última faixa precisa cobrir até o check-in (0 hora).
    await field(luxplus, 'no_show_money').fill('0');
    await field(luxplus, 'exception_money').fill('100');
    await luxplus.getByRole('button', { name: 'Revisar' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'A última faixa precisa ter 0 hora' }),
    ).toBeVisible();

    await field(luxplus, 't1_hours').fill('0');
    await field(luxplus, 't1_money').fill('12,5');
    await luxplus.getByRole('button', { name: 'Revisar' }).tap();
    await expect(luxplus).toContainText('Revise antes de publicar');
    await expect(luxplus).toContainText(
      'Com pelo menos 24 horas (1 dia) de antecedência do check-in',
    );
    await expect(luxplus).toContainText('12,5% do valor pago é devolvido.');
    await expect(luxplus).toContainText(
      'As noites ainda não iniciadas voltam à sua origem imediatamente anterior.',
    );
    await expect(luxplus).toContainText('nenhum mecanismo é ativado por esta publicação.');
    await expect(luxplus.getByRole('checkbox')).toBeDisabled();
    await gate(page, errors, 'w18-02-politica-revisao');

    await luxplus.getByRole('button', { name: 'Confirmar publicação' }).tap();
    await expect(page.getByRole('status')).toContainText('Versão publicada: Luxplus');
    const published = page.locator('section#luxplus');
    await expect(published).toContainText('Vigente');
    await expect(published).toContainText('50% do valor pago é devolvido.');
    await expect(
      published.getByRole('checkbox', { name: /Li e aceito a política comercial/ }),
    ).toBeVisible();
    await expect(page.locator('section#luxchange_request')).toContainText('Ausente');
    await gate(page, errors, 'w18-03-politica-vigente');
  });
});
