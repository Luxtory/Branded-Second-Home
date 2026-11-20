import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ensureE2eSuperAdmin } from '../support/e2e-acquisition-database.mjs';
import { signIn } from './support/auth';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedOwner,
  gate,
  MOBILE,
  post,
} from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W16 E4 (spec pricing §5, spec admin §14; ADR-0032): parâmetros econômicos e PRL pelas telas reais do Admin, com o
// PostgreSQL real. Jornada de precificação em lote: seleção acumulada entre meses (toque e teclado), valor comum e
// exceção individual, revisão no servidor revalidada na confirmação, alterações agendadas em sequência. Valores de teste
// arbitrários (nenhum valor canônico). Nenhuma capability é ligada; o Super Admin é um usuário próprio deste spec.
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
const nextMonth = (month: string) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7);
};

/** Duas noites seguidas no mesmo mês, a partir de amanhã (ou do dia 1 do mês seguinte, no último dia do mês). */
function twoNights(): [string, string] {
  let start = addDays(civilToday(), 1);
  if (addDays(start, 1).slice(0, 7) !== start.slice(0, 7)) start = addDays(start, 1);
  return [start, addDays(start, 1)];
}

async function publishParameter(
  section: Locator,
  page: Page,
  label: string,
  value: string,
  start = '',
) {
  await section.getByText('Publicar nova versão').tap();
  await section.getByLabel(label, { exact: true }).fill(value);
  await section.getByLabel('Início da vigência (opcional)').fill(start);
  await section.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
  await section.getByRole('button', { name: 'Revisar versão' }).tap();
  return section;
}

test.describe('W16 E4 — PRL e parâmetros econômicos no Admin', () => {
  test.use(MOBILE);

  test('[REQ-013][REQ-052][TECH-030][TECH-033] jornada de precificação: parâmetros revisados, lote entre meses, revalidação e alterações agendadas', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    const label = `Second Home W16 ${randomUUID().slice(0, 6)}`;
    const { home } = await formalizedOwner(page, label);

    // Parâmetros econômicos: ausentes; revisão "vigente → novo" com base e autoridade antes de confirmar.
    await page.goto('/admin/parametros');
    const multiplier = page.locator('section#credit_multiplier');
    for (const key of [
      'credit_validity_months',
      'luxchange_fee_rate',
      'membership_base_annual_price',
    ])
      await expect(page.locator(`section#${key}`)).toContainText('Ausente');
    await gate(page, errors, 'w16-01-parametros-ausentes');
    await publishParameter(multiplier, page, 'Multiplicador', '1,1234567');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Revise os campos destacados.' }),
    ).toBeVisible();
    await multiplier.getByLabel('Multiplicador', { exact: true }).fill('2,5');
    await multiplier.getByRole('button', { name: 'Revisar versão' }).tap();
    await expect(multiplier).toContainText('Revisão antes de confirmar');
    await expect(multiplier).toContainText('Vigente agora');
    await expect(multiplier).toContainText('Ausente');
    await expect(multiplier).toContainText('Ata sintética W16 E2E');
    await multiplier.getByRole('button', { name: 'Confirmar publicação' }).tap();
    await expect(page.getByRole('status')).toContainText(
      'Versão publicada: Multiplicador de Créditos',
    );
    await expect(page.locator('section#credit_multiplier')).toContainText('2,5');
    const minimum = page.locator('section#luxchange_fee_minimum');
    await publishParameter(minimum, page, 'Valor (R$)', '43,21');
    await minimum.getByRole('button', { name: 'Confirmar publicação' }).tap();
    await expect(page.getByRole('status')).toContainText('Mínimo do Luxchange Fee');
    // Versão agendada para amanhã (UTC); depois, a imediata é recusada já na revisão e a posterior compara com a
    // agendada — não com a vigente agora.
    const fee = () => page.locator('section#luxchange_fee_minimum');
    await publishParameter(fee(), page, 'Valor (R$)', '50,00', `${addDays(civilToday(), 1)}T15:00`);
    await expect(fee()).toContainText(/R\$\s43,21\s→\sR\$\s50,00/);
    await fee().getByRole('button', { name: 'Confirmar publicação' }).tap();
    await expect(page.getByRole('status')).toContainText('Mínimo do Luxchange Fee');
    await publishParameter(fee(), page, 'Valor (R$)', '55,00');
    await expect(
      page.getByRole('alert').filter({ hasText: 'versão existente (inclusive agendada)' }),
    ).toBeVisible();
    await fee()
      .getByLabel('Início da vigência (opcional)')
      .fill(`${addDays(civilToday(), 2)}T15:00`);
    await fee().getByRole('button', { name: 'Revisar versão' }).tap();
    await expect(fee()).toContainText('Vigente agora');
    await expect(fee()).toContainText(/R\$\s43,21/);
    await expect(fee()).toContainText(/R\$\s50,00 a partir de/);
    await expect(fee()).toContainText(/R\$\s50,00\s→\sR\$\s55,00/);
    await gate(page, errors, 'w16-02-parametro-revisao');
    await fee().getByRole('button', { name: 'Voltar e editar' }).tap();

    // PRL: cobertura e consulta; o Admin não vê o modo de alteração.
    await page.goto('/admin/prl');
    const item = page.getByRole('listitem').filter({ hasText: label });
    await expect(item).toContainText('Com PRL vigente');
    await gate(page, errors, 'w16-03-prl-lista');
    await item.getByRole('link', { name: label }).tap();
    const [first, second] = twoNights();
    const month = first.slice(0, 7);
    const later = `${nextMonth(month)}-10`;
    await page.goto(`/admin/prl/${home}?mes=${month}`);
    const modes = page.getByRole('navigation', { name: 'Modo' });
    await expect(modes.getByRole('link')).toHaveText(['Consultar', 'Publicar PRL inicial']);
    await expect(night(page, first)).toContainText('Sem PRL');
    await gate(page, errors, 'w16-04-prl-consulta-sem-versao');

    // Lote: valor comum; segunda noite por teclado; noite do mês seguinte acumulada; exceção individual.
    await modes.getByRole('link', { name: 'Publicar PRL inicial' }).tap();
    await page.getByLabel('Valor comum (R$)').fill('1.234,56');
    await day(page, first).tap();
    await day(page, first).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(':focus')).toHaveAttribute('data-date', second);
    await page.keyboard.press('Enter');
    await expect(day(page, second)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Próximo mês' }).tap();
    await day(page, later).tap();
    await expect(
      page.getByRole('status').filter({ hasText: '3 noites selecionadas.' }),
    ).toBeVisible();
    await page.getByLabel(new RegExp(`PRL de .*${civil(second)}`)).fill('1.500,00');
    await page.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
    await gate(page, errors, 'w16-05-prl-selecao-em-lote');
    await page.getByRole('button', { name: 'Revisar publicação' }).tap();
    const review = page.locator('section[aria-labelledby="prl-revisao"]');
    await expect(review).toContainText('Publicar PRL inicial');
    await expect(review).toContainText('Autoridade exercida');
    await expect(review).toContainText('Admin');
    await expect(review).toContainText('Ata sintética W16 E2E');
    await expect(review).toContainText('3 noites');
    await expect(review).toContainText(/R\$\s3\.969,12/);
    await expect(review).toContainText('9.922,8 Créditos');
    await gate(page, errors, 'w16-06-prl-revisao-inicial');

    // Outro operador publica a primeira noite pela API durante a revisão: a confirmação revalida e recusa o lote.
    await post(page, '/v1/admin/prl', {
      second_home_id: home,
      nights: [{ stay_date: first, amount_minor: '99900' }],
      effective_from: null,
      basis: 'Ata concorrente W16 E2E',
    });
    await page.getByRole('button', { name: 'Confirmar publicação inicial' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Revise o lote antes de continuar.' }),
    ).toContainText(civil(first));
    // Remoção individual pela lista do lote (o calendário segue no mês da última seleção).
    await page.getByRole('button', { name: new RegExp(`Tirar .*${civil(first)} do lote`) }).tap();
    await expect(
      page.getByRole('status').filter({ hasText: '2 noites selecionadas.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisar publicação' }).tap();
    await expect(review).toContainText('2 noites');
    await expect(review).toContainText(/R\$\s2\.734,56/);
    await expect(review).toContainText('6.836,4 Créditos');
    await page.getByRole('button', { name: 'Confirmar publicação inicial' }).tap();
    await expect(page.getByRole('status')).toContainText('PRL inicial publicado');
    await expect(night(page, first)).toContainText(/R\$\s999,00/);
    await expect(night(page, second)).toContainText(/R\$\s1\.500,00/);
    await expect(night(page, second)).toContainText('Média/Baixa');
    await gate(page, errors, 'w16-07-prl-consulta-vigente');

    // A publicação inicial não alcança noite publicada; o Admin não abre a alteração nem pela URL.
    await page.goto(`/admin/prl/${home}?modo=inicial&mes=${month}`);
    await expect(day(page, second)).toHaveAttribute('aria-disabled', 'true');
    // O dia inerte continua tocável para explicar o motivo (o Playwright o trata como desabilitado).
    await day(page, second).tap({ force: true });
    await expect(page.getByRole('status').filter({ hasText: 'já tem PRL' })).toBeVisible();
    await page.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
    await expect(page.locator('section[aria-labelledby="alterar"]')).toHaveCount(0);

    // Super Admin: duas alterações agendadas em sequência; a segunda substitui o preço agendado, não o vigente.
    await ensureE2eSuperAdmin(SUPER_EMAIL);
    const context = await browser.newContext({ ...MOBILE });
    const superPage = await context.newPage();
    const superErrors = collectConsoleErrors(superPage);
    const schedule = async (amount: string, start: string) => {
      await superPage.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
      await day(superPage, second).tap();
      await superPage.getByLabel(new RegExp(`PRL de .*${civil(second)}`)).fill(amount);
      await superPage.getByLabel('Início da vigência (opcional)').fill(start);
      await superPage.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
      await superPage.getByRole('button', { name: 'Revisar publicação' }).tap();
      return superPage.locator('section[aria-labelledby="prl-revisao"]');
    };
    try {
      await signIn(superPage, SUPER_EMAIL);
      await expect(superPage).toHaveURL(/\/admin$/);
      await expect(superPage.getByRole('main')).toContainText('PRL');
      await expect(superPage.getByRole('main')).not.toContainText('Catálogo');
      const firstChange = await schedule('1.600,00', `${addDays(civilToday(), 1)}T10:00`);
      await expect(firstChange).toContainText('Alterar PRL publicado');
      await expect(firstChange).toContainText('Super Admin');
      await expect(firstChange).toContainText(/R\$\s1\.500,00\s→\sR\$\s1\.600,00/);
      await superPage.getByRole('button', { name: 'Confirmar alteração' }).tap();
      await expect(superPage.getByRole('status')).toContainText('PRL alterado');
      const secondChange = await schedule('1.700,00', `${addDays(civilToday(), 2)}T10:00`);
      await expect(secondChange).toContainText('Vigente agora');
      await expect(secondChange).toContainText(/R\$\s1\.500,00/);
      await expect(secondChange).toContainText('Agendado antes desta alteração');
      await expect(secondChange).toContainText(/R\$\s1\.600,00\s→\sR\$\s1\.700,00/);
      await gate(superPage, superErrors, 'w16-08-prl-revisao-alteracao-agendada');
      await superPage.getByRole('button', { name: 'Confirmar alteração' }).tap();
      await expect(superPage.getByRole('status')).toContainText('PRL alterado');
      const changed = night(superPage, second);
      await expect(changed).toContainText(/R\$\s1\.500,00/);
      await expect(changed).toContainText(/R\$\s1\.600,00 a partir de/);
      await expect(changed).toContainText(/R\$\s1\.700,00 a partir de/);
      await changed.getByText('Ver as 3 versões').tap();
      await expect(changed).toContainText('Alteração');
      await expect(changed).toContainText('Super Admin');
      await gate(superPage, superErrors, 'w16-09-prl-agendado-super-admin');
    } finally {
      await context.close();
    }
  });
});
