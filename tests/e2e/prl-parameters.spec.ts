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
// PostgreSQL real. Jornada de precificação em lote: seleção acumulada entre meses (toque e teclado), preço comum
// aplicado explicitamente e preço próprio por noite, revisão no servidor revalidada na confirmação (seleção preservada),
// consulta com a noite em detalhe e o histórico, alterações agendadas em sequência. Valores de teste
// arbitrários (nenhum valor canônico). Nenhuma capability é ligada; o Super Admin é um usuário próprio deste spec.
test.describe.configure({ mode: 'serial' });

const SUPER_EMAIL = 'super-w16@luxtory.test';
const civil = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const day = (page: Page, date: string) =>
  page.locator(`button.lx-calendar__day[data-date="${date}"]`);
/** Noite em detalhe na consulta: toca o dia no calendário e devolve o painel da noite. */
async function detail(page: Page, date: string) {
  await day(page, date).tap();
  const panel = page.locator('section[aria-labelledby="prl-noite"]');
  await expect(panel).toContainText(civil(date));
  return panel;
}
/** Larguras extras das telas-chave (320, 768, 1024, 1920), só com `UI_CAPTURE_DIR` — material de revisão do C2. */
async function widths(page: Page, name: string) {
  const dir = process.env.UI_CAPTURE_DIR;
  if (dir === undefined || dir === '') return;
  const original = page.viewportSize();
  for (const width of [320, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  }
  if (original !== null) await page.setViewportSize(original);
}
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
    // A mensagem de sucesso é a mesma da versão anterior desta chave: espera o sinal próprio desta publicação (a
    // revisão fecha e a versão futura aparece no cartão) antes de abrir o formulário de novo.
    await expect(fee().getByRole('button', { name: 'Confirmar publicação' })).toHaveCount(0);
    await expect(fee()).toContainText(/Próxima versão\s*R\$\s50,00 a partir de/);
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
    await expect(item).toContainText('Com preço vigente');
    await gate(page, errors, 'w16-03-prl-lista');
    await item.getByRole('link', { name: label }).tap();
    const [first, second] = twoNights();
    const month = first.slice(0, 7);
    const later = `${nextMonth(month)}-10`;
    await page.goto(`/admin/prl/${home}?mes=${month}`);
    const modes = page.getByRole('navigation', { name: 'Modo' });
    await expect(modes.getByRole('link')).toHaveText(['Consultar', 'Definir preços iniciais']);
    await expect(await detail(page, first)).toContainText('Sem preço definido');
    await expect(day(page, first)).toHaveAttribute('aria-pressed', 'true');
    await gate(page, errors, 'w16-04-prl-consulta-sem-versao');

    // Seleção: preço comum para as noites novas; segunda noite por teclado; noite do mês seguinte acumulada.
    await modes.getByRole('link', { name: 'Definir preços iniciais' }).tap();
    await page.getByLabel('Preço comum (R$)').fill('1.234,56');
    await day(page, first).tap();
    await day(page, first).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(':focus')).toHaveAttribute('data-date', second);
    await page.keyboard.press('Enter');
    await expect(day(page, second)).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, second)).toHaveAccessibleName(/novo preço R\$ 1\.234,56/);
    await page.getByRole('button', { name: 'Próximo mês' }).tap();
    await day(page, later).tap();
    await expect(
      page.getByRole('status').filter({ hasText: '3 noites selecionadas.' }),
    ).toBeVisible();
    // O painel mostra só as noites do mês em tela; as demais ficam a um toque.
    await page.getByRole('button', { name: 'Mês anterior' }).tap();
    await expect(page.getByRole('button', { name: /: 1 noite$/ })).toBeVisible();
    // Exceção individual e reaplicação explícita do preço comum.
    const secondPrice = page.getByLabel(new RegExp(`Preço de .*${civil(second)}`));
    await secondPrice.fill('1.500,00');
    await expect(
      page.locator('.lx-pricing__night').filter({ hasText: civil(second) }),
    ).toContainText('Preço próprio');
    await page.getByRole('button', { name: 'Aplicar às 3 noites selecionadas' }).tap();
    await expect(page.getByRole('status')).toContainText('Preço comum aplicado a 3 noites.');
    await expect(secondPrice).toHaveValue('1.234,56');
    await secondPrice.fill('1.500,00');
    await page.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
    await gate(page, errors, 'w16-05-prl-selecao-em-lote');
    await widths(page, 'w16-05-prl-selecao-em-lote');
    await page.getByRole('button', { name: 'Revisar', exact: true }).tap();
    const review = page.locator('section[aria-labelledby="prl-revisao"]');
    await expect(review).toContainText('Preços iniciais');
    await expect(review).toContainText('Autoridade exercida');
    await expect(review).toContainText('Admin');
    await expect(review).toContainText('Ata sintética W16 E2E');
    await expect(review).toContainText(/3 noites · PRL total R\$\s3\.969,12/);
    await expect(review).toContainText('9.922,8 Créditos');
    await gate(page, errors, 'w16-06-prl-revisao-inicial');

    // Outro operador define a primeira noite pela API durante a revisão: a confirmação revalida e recusa.
    await post(page, '/v1/admin/prl', {
      second_home_id: home,
      nights: [{ stay_date: first, amount_minor: '99900' }],
      effective_from: null,
      basis: 'Ata concorrente W16 E2E',
    });
    await page.getByRole('button', { name: 'Confirmar preços iniciais' }).tap();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Ajuste a seleção antes de continuar.' }),
    ).toContainText(civil(first));
    // A seleção e os preços sobrevivem à revisão; remoção individual pelo painel do mês.
    await expect(secondPrice).toHaveValue('1.500,00');
    await page
      .getByRole('button', { name: new RegExp(`Remover .*${civil(first)} da seleção`) })
      .tap();
    await expect(
      page.getByRole('status').filter({ hasText: '2 noites selecionadas.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisar', exact: true }).tap();
    await expect(review).toContainText(/2 noites · PRL total R\$\s2\.734,56/);
    await expect(review).toContainText('6.836,4 Créditos');
    await page.getByRole('button', { name: 'Confirmar preços iniciais' }).tap();
    await expect(page.getByRole('status')).toContainText('Preços iniciais registrados');
    // Depois da confirmação, a consulta abre na primeira noite publicada.
    await expect(page.locator('section[aria-labelledby="prl-noite"]')).toContainText(civil(second));
    await expect(await detail(page, first)).toContainText(/R\$\s999,00/);
    const priced = await detail(page, second);
    await expect(priced).toContainText(/R\$\s1\.500,00/);
    await expect(priced).toContainText('Média/Baixa');
    await gate(page, errors, 'w16-07-prl-consulta-vigente');
    await widths(page, 'w16-07-prl-consulta-vigente');

    // A publicação inicial não alcança noite com preço; o Admin não abre a alteração nem pela URL.
    await page.goto(`/admin/prl/${home}?modo=inicial&mes=${month}`);
    await expect(day(page, second)).toHaveAttribute('aria-disabled', 'true');
    // O dia inerte continua tocável para explicar o motivo (o Playwright o trata como desabilitado).
    await day(page, second).tap({ force: true });
    await expect(page.getByRole('status').filter({ hasText: 'já tem preço' })).toBeVisible();
    await page.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
    await expect(page.getByRole('form', { name: 'Alterar preços' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Consultar' })).toHaveCount(1);

    // Super Admin: duas alterações agendadas em sequência; a segunda substitui o preço agendado, não o vigente.
    await ensureE2eSuperAdmin(SUPER_EMAIL);
    const context = await browser.newContext({ ...MOBILE });
    const superPage = await context.newPage();
    const superErrors = collectConsoleErrors(superPage);
    const schedule = async (amount: string, start: string) => {
      await superPage.goto(`/admin/prl/${home}?modo=alteracao&mes=${month}`);
      await day(superPage, second).tap();
      await superPage.getByLabel(new RegExp(`Preço de .*${civil(second)}`)).fill(amount);
      await superPage.getByLabel('Início da vigência (opcional)').fill(start);
      await superPage.getByLabel('Base registrada').fill('Ata sintética W16 E2E');
      await superPage.getByRole('button', { name: 'Revisar', exact: true }).tap();
      return superPage.locator('section[aria-labelledby="prl-revisao"]');
    };
    try {
      await signIn(superPage, SUPER_EMAIL);
      await expect(superPage).toHaveURL(/\/admin$/);
      await expect(superPage.getByRole('main')).toContainText('PRL');
      await expect(superPage.getByRole('main')).not.toContainText('Catálogo');
      const firstChange = await schedule('1.600,00', `${addDays(civilToday(), 1)}T10:00`);
      await expect(firstChange).toContainText('Alteração de preços');
      await expect(firstChange).toContainText('Super Admin');
      await expect(firstChange).toContainText(/R\$\s1\.500,00\s→\sR\$\s1\.600,00/);
      await superPage.getByRole('button', { name: 'Confirmar alteração' }).tap();
      await expect(superPage.getByRole('status')).toContainText('Alteração registrada');
      const secondChange = await schedule('1.700,00', `${addDays(civilToday(), 2)}T10:00`);
      await expect(secondChange).toContainText('Vigente agora');
      await expect(secondChange).toContainText(/R\$\s1\.500,00/);
      await expect(secondChange).toContainText('Versão futura');
      await expect(secondChange).toContainText(/R\$\s1\.600,00\s→\sR\$\s1\.700,00/);
      await gate(superPage, superErrors, 'w16-08-prl-revisao-alteracao-agendada');
      await superPage.getByRole('button', { name: 'Confirmar alteração' }).tap();
      await expect(superPage.getByRole('status')).toContainText('Alteração registrada');
      const changed = superPage.locator('section[aria-labelledby="prl-noite"]');
      await expect(changed).toContainText(civil(second));
      await expect(changed).toContainText(/R\$\s1\.500,00/);
      await expect(changed).toContainText(/R\$\s1\.600,00 a partir de/);
      await expect(changed).toContainText(/R\$\s1\.700,00 a partir de/);
      await changed.getByText('Histórico · 3 versões registradas').tap();
      await expect(changed).toContainText('Alteração');
      await expect(changed).toContainText('Super Admin');
      await gate(superPage, superErrors, 'w16-09-prl-agendado-super-admin');
    } finally {
      await context.close();
    }
  });
});
