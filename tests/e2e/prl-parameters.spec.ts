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
// PostgreSQL real. Calendário de precificação em lote (seleção individual, valor comum e valores próprios por noite,
// revisão calculada no servidor). Valores de teste arbitrários (nenhum valor canônico). Nenhuma capability é ligada;
// o Super Admin é um usuário próprio deste spec (o staff compartilhado continua só Admin).
test.describe.configure({ mode: 'serial' });

const SUPER_EMAIL = 'super-w16@luxtory.test';
const civil = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const night = (page: Page, date: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: civil(date) })
    .first();
const day = (page: Page, date: string) =>
  page.locator(`button.lx-calendar__day[data-date="${date}"]`);

/** Três noites seguidas no mesmo mês, a partir de amanhã (ou do dia 1 do mês seguinte, no fim do mês). */
function threeNights(): [string, string, string] {
  let start = addDays(civilToday(), 1);
  if (addDays(start, 2).slice(0, 7) !== start.slice(0, 7))
    start = `${addDays(start, 3).slice(0, 7)}-01`;
  return [start, addDays(start, 1), addDays(start, 2)];
}

test.describe('W16 E4 — PRL e parâmetros econômicos no Admin', () => {
  test.use(MOBILE);

  test('[REQ-013][REQ-052][TECH-030][TECH-033] Admin publica parâmetro e PRL inicial em lote; Super Admin altera; estados e histórico distintos', async ({
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

    // PRL: cobertura e consulta; o Admin não vê o modo de alteração.
    await page.goto('/admin/prl');
    const item = page.getByRole('listitem').filter({ hasText: label });
    await expect(item).toContainText('Com PRL vigente');
    await gate(page, errors, 'w16-03-prl-lista');
    await item.getByRole('link', { name: label }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`PRL — ${label}`);
    const [first, second, third] = threeNights();
    const month = first.slice(0, 7);
    await page.goto(`/admin/prl/${home}?mes=${month}`);
    const modes = page.getByRole('navigation', { name: 'Modo' });
    await expect(modes.getByRole('link')).toHaveText(['Consultar', 'Publicar PRL inicial']);
    await expect(modes).toContainText('Somente o Super Admin altera PRL já publicado');
    await expect(night(page, first)).toContainText('Sem PRL');
    await gate(page, errors, 'w16-04-prl-consulta-sem-versao');

    // Publicação inicial em lote: valor comum em três noites, valor próprio na segunda; revisão no servidor.
    await modes.getByRole('link', { name: 'Publicar PRL inicial' }).tap();
    await page.getByLabel('Valor comum (R$)').fill('1.234,56');
    for (const date of [first, second, third]) {
      await day(page, date).tap();
      await expect(day(page, date)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(
      page.getByRole('status').filter({ hasText: '3 noites selecionadas.' }),
    ).toBeVisible();
    await page.getByLabel(new RegExp(`PRL de .*${civil(second)}`)).fill('1.500,00');
    await page.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
    await gate(page, errors, 'w16-05-prl-selecao-em-lote');
    await page.getByRole('button', { name: 'Revisar publicação' }).tap();
    const review = page.locator('section[aria-labelledby="prl-revisao"]');
    await expect(review).toContainText('Publicar PRL inicial');
    await expect(review).toContainText('3 noites');
    await expect(review).toContainText(/R\$\s3\.969,12/);
    await expect(review).toContainText('9.922,8 Créditos');
    await gate(page, errors, 'w16-06-prl-revisao-inicial');
    await page.getByRole('button', { name: 'Confirmar publicação inicial' }).tap();
    await expect(page.getByRole('status')).toContainText('PRL inicial publicado');
    await expect(night(page, first)).toContainText(/R\$\s1\.234,56/);
    await expect(night(page, second)).toContainText(/R\$\s1\.500,00/);
    await expect(night(page, second)).toContainText('Média/Baixa');
    await gate(page, errors, 'w16-07-prl-consulta-vigente');

    // A publicação inicial não alcança noite publicada: o dia explica o motivo e não entra no lote.
    await page.goto(`/admin/prl/${home}?modo=inicial&mes=${month}`);
    await expect(day(page, first)).toHaveAttribute('aria-disabled', 'true');
    // O dia inerte continua tocável para explicar o motivo (o Playwright o trata como desabilitado).
    await day(page, first).tap({ force: true });
    await expect(page.getByRole('status').filter({ hasText: 'já tem PRL' })).toBeVisible();
    // O Admin não abre o modo de alteração nem pela URL.
    await page.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
    await expect(page.locator('section[aria-labelledby="alterar"]')).toHaveCount(0);

    // Super Admin (usuário próprio): vê o PRL, não o Catálogo; altera uma noite comparando vigente e novo.
    await ensureE2eSuperAdmin(SUPER_EMAIL);
    const context = await browser.newContext({ ...MOBILE });
    const superPage = await context.newPage();
    const superErrors = collectConsoleErrors(superPage);
    try {
      await signIn(superPage, SUPER_EMAIL);
      await expect(superPage).toHaveURL(/\/admin$/);
      await expect(superPage.getByRole('main')).toContainText('PRL');
      await expect(superPage.getByRole('main')).not.toContainText('Catálogo');
      await superPage.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
      // Na alteração só noites publicadas são selecionáveis; as sem PRL ficam inertes.
      await expect(day(superPage, second)).toHaveAttribute('aria-pressed', 'false');
      await expect(
        superPage.locator('button.lx-calendar__day[aria-disabled="true"]').first(),
      ).toBeVisible();
      await day(superPage, second).tap();
      await superPage.getByLabel(new RegExp(`PRL de .*${civil(second)}`)).fill('1.600,00');
      await superPage.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
      await superPage.getByRole('button', { name: 'Revisar publicação' }).tap();
      const changeReview = superPage.locator('section[aria-labelledby="prl-revisao"]');
      await expect(changeReview).toContainText('Alterar PRL publicado');
      await expect(changeReview).toContainText(/R\$\s1\.500,00\s→\sR\$\s1\.600,00/);
      await gate(superPage, superErrors, 'w16-08-prl-revisao-alteracao');
      await superPage.getByRole('button', { name: 'Confirmar alteração' }).tap();
      await expect(superPage.getByRole('status')).toContainText('PRL alterado');
      const changed = night(superPage, second);
      await expect(changed).toContainText(/R\$\s1\.600,00/);
      await changed.getByText('Ver as 2 versões').tap();
      await expect(changed).toContainText('Alteração');
      await expect(changed).toContainText('Super Admin');
      await expect(night(superPage, first)).toContainText(/R\$\s1\.234,56/);
      await gate(superPage, superErrors, 'w16-09-prl-alterado-super-admin');
    } finally {
      await context.close();
    }
  });
});
