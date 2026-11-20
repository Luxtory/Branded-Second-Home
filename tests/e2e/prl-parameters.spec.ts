import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ensureE2eSuperAdmin } from '../support/e2e-acquisition-database.mjs';
import { signIn } from './support/auth';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedOwner,
  gate,
  MOBILE,
} from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W16 E4 (spec pricing §5, spec admin §14; ADR-0032): parâmetros econômicos e PRL pelas telas reais do Admin, com o
// PostgreSQL real. Valores de teste arbitrários (nenhum valor canônico). Nenhuma capability é ligada; o Super Admin é
// um usuário próprio deste spec (o staff compartilhado continua só Admin).
test.describe.configure({ mode: 'serial' });

const SUPER_EMAIL = 'super-w16@luxtory.test';
const civil = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const night = (page: Page, date: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: civil(date) })
    .first();

async function publishPrl(
  page: Page,
  form: string,
  submit: string,
  values: { first: string; last: string; amount: string },
) {
  const region = page.getByRole('form', { name: form });
  await region.getByLabel('Primeira noite').fill(values.first);
  await region.getByLabel('Última noite').fill(values.last);
  await region.getByLabel('PRL por noite (R$)').fill(values.amount);
  await region.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
  await region.getByRole('button', { name: submit }).tap();
}

test.describe('W16 E4 — PRL e parâmetros econômicos no Admin', () => {
  test.use(MOBILE);

  test('[REQ-013][REQ-052][TECH-030][TECH-001] Admin publica parâmetro e PRL inicial; Super Admin altera; ausente, vigente e histórico distintos', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    const label = `Second Home W16 ${randomUUID().slice(0, 6)}`;
    const { home } = await formalizedOwner(page, label);

    // Parâmetros econômicos: ausentes até a primeira versão; formato inválido recusado no campo.
    await page.goto('/admin/parametros');
    const multiplier = page.locator('section#credit_multiplier');
    for (const key of [
      'credit_validity_months',
      'luxchange_fee_rate',
      'membership_base_annual_price',
    ])
      await expect(page.locator(`section#${key}`)).toContainText('Ausente');
    await expect(multiplier).toContainText('Ausente');
    await gate(page, errors, 'w16-01-parametros-ausentes');
    await multiplier.getByText('Publicar nova versão').tap();
    await multiplier.getByLabel('Multiplicador', { exact: true }).fill('1,1234567');
    await multiplier.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
    await multiplier.getByRole('button', { name: 'Publicar versão' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Revise os campos destacados.' }),
    ).toBeVisible();
    await multiplier.getByLabel('Multiplicador', { exact: true }).fill('2,5');
    await multiplier.getByRole('button', { name: 'Publicar versão' }).tap();
    await expect(page.getByRole('status')).toContainText(
      'Versão publicada: Multiplicador de Créditos',
    );
    await expect(page.locator('section#credit_multiplier')).toContainText('Vigente');
    await expect(page.locator('section#credit_multiplier')).toContainText('2,5');
    await expect(page.locator('section#luxchange_fee_minimum')).toContainText('Ausente');
    await gate(page, errors, 'w16-02-parametro-vigente');

    // PRL: cobertura, noites sem PRL, alteração restrita ao Super Admin.
    await page.goto('/admin/prl');
    const item = page.getByRole('listitem').filter({ hasText: label });
    await expect(item).toContainText('Com PRL vigente');
    await gate(page, errors, 'w16-03-prl-lista');
    await item.getByRole('link', { name: label }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`PRL — ${label}`);
    const first = addDays(civilToday(), 1);
    const last = addDays(civilToday(), 3);
    await page.goto(`/admin/prl/${home}?mes=${first.slice(0, 7)}`);
    await expect(night(page, first)).toContainText('Sem PRL');
    await expect(page.locator('section[aria-labelledby="alterar"]')).toContainText(
      'Somente o Super Admin altera PRL já publicado',
    );
    await gate(page, errors, 'w16-04-prl-sem-versao');

    await publishPrl(page, 'Publicar PRL inicial', 'Publicar PRL inicial', {
      first,
      last,
      amount: '1.234,56',
    });
    await expect(page.getByRole('status')).toContainText('PRL inicial publicado');
    await expect(night(page, first)).toContainText('PRL vigente');
    await expect(night(page, first)).toContainText(/R\$\s1\.234,56/);
    await gate(page, errors, 'w16-05-prl-inicial');
    // Publicação inicial sobre noite publicada: recusada inteira.
    await publishPrl(page, 'Publicar PRL inicial', 'Publicar PRL inicial', {
      first,
      last: first,
      amount: '1.000,00',
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'alguma noite já tem PRL' }),
    ).toBeVisible();

    // Super Admin (usuário próprio): vê o PRL, não o Catálogo; altera e o histórico mostra as duas versões.
    await ensureE2eSuperAdmin(SUPER_EMAIL);
    const context = await browser.newContext({ ...MOBILE });
    const superPage = await context.newPage();
    const superErrors = collectConsoleErrors(superPage);
    try {
      await signIn(superPage, SUPER_EMAIL);
      await expect(superPage).toHaveURL(/\/admin$/);
      await expect(superPage.getByRole('main')).toContainText('PRL');
      await expect(superPage.getByRole('main')).not.toContainText('Catálogo');
      await superPage.goto(`/admin/prl/${home}?mes=${first.slice(0, 7)}`);
      await publishPrl(superPage, 'Alterar PRL publicado', 'Registrar alteração', {
        first,
        last: first,
        amount: '1.300,00',
      });
      await expect(superPage.getByRole('status')).toContainText('PRL alterado');
      const changed = night(superPage, first);
      await expect(changed).toContainText(/R\$\s1\.300,00/);
      await changed.getByText('Ver as 2 versões').tap();
      await expect(changed).toContainText('Alteração');
      await expect(changed).toContainText('Super Admin');
      await expect(night(superPage, addDays(first, 1))).toContainText(/R\$\s1\.234,56/);
      await gate(superPage, superErrors, 'w16-06-prl-alterado-super-admin');
    } finally {
      await context.close();
    }
  });
});
