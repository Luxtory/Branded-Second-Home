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
// PostgreSQL real. Jornada de precificação em lote: seleção acumulada entre meses (toque e teclado), preço comum para
// as noites sem preço próprio, exceção individual que o comum não sobrescreve, substituição só explícita, painel
// compacto com a lista noite a noite sob demanda, revisão no servidor revalidada na confirmação (seleção preservada),
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
/** Recorte do calendário com o foco do teclado num dia (vai e volta pelas setas, sem sair do mês), só com
 * `UI_CAPTURE_DIR` — evidência de foco visível sobre a seleção e sobre o tom da temporada. */
async function focusShot(page: Page, target: Locator, name: string) {
  const dir = process['env']['UI_CAPTURE_DIR'];
  if (dir === undefined || dir === '') return;
  await target.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.locator('.lx-pricing__calendar').screenshot({ path: `${dir}/${name}.png` });
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
    // Painel compacto: sem exceção, nenhuma linha por noite; as noites de outros meses ficam a um toque.
    const panel = page.locator('.lx-pricing__panel');
    const rows = page.locator('.lx-pricing__night');
    await page.getByRole('button', { name: 'Mês anterior' }).tap();
    await expect(page.getByRole('button', { name: /: 1 noite$/ })).toBeVisible();
    await expect(rows).toHaveCount(0);
    await expect(panel).toContainText('2 noites deste mês no preço comum.');
    // Exceção individual pela lista noite a noite; mudar o preço comum não toca o preço próprio.
    await page.getByRole('button', { name: 'Ajustar noite a noite' }).tap();
    const secondPrice = page.getByLabel(new RegExp(`Preço de .*${civil(second)}`));
    await secondPrice.fill('1.500,00');
    const secondRow = rows.filter({ hasText: civil(second) });
    await expect(secondRow).toContainText('Preço próprio');
    await expect(panel).toContainText('2 noites no preço comum · 1 com preço próprio.');
    await page.getByLabel('Preço comum (R$)').fill('1.000,00');
    await expect(secondPrice).toHaveValue('1.500,00');
    await expect(day(page, first)).toHaveAccessibleName(/novo preço R\$ 1\.000,00/);
    await expect(day(page, second)).toHaveAccessibleName(
      /novo preço R\$ 1\.500,00 — preço próprio/,
    );
    await page.getByLabel('Preço comum (R$)').fill('1.234,56');
    // Substituir preço próprio só por ação explícita, que diz quantos substitui.
    await page.getByRole('button', { name: 'Substituir 1 preço próprio pelo comum' }).tap();
    await expect(page.getByRole('status')).toContainText('1 preço próprio substituído pelo comum.');
    await expect(secondPrice).toHaveValue('1.234,56');
    await expect(secondRow).not.toContainText('Preço próprio');
    await secondPrice.fill('1.500,00');
    // Compacto de novo: a exceção continua à vista e a noite no comum sai da lista; trocar de mês não perde valores.
    await page.getByRole('button', { name: 'Mostrar só os preços próprios' }).tap();
    await expect(rows).toHaveCount(1);
    await expect(panel).toContainText('1 noite deste mês no preço comum.');
    await page.getByRole('button', { name: 'Próximo mês' }).tap();
    await page.getByRole('button', { name: 'Mês anterior' }).tap();
    await expect(secondPrice).toHaveValue('1.500,00');
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
    await page.getByRole('button', { name: 'Ajustar noite a noite' }).tap();
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
    // Troca de mês pelo teclado na consulta: o detalhe e o foco acompanham a noite do mês novo, nunca a anterior.
    const lastOfMonth = addDays(`${nextMonth(month)}-01`, -1);
    const firstOfNext = `${nextMonth(month)}-01`;
    await day(page, lastOfMonth).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`mes=${nextMonth(month)}`));
    await expect(page.locator('section[aria-labelledby="prl-noite"]')).toContainText(
      civil(firstOfNext),
    );
    await expect(page.locator(':focus')).toHaveAttribute('data-date', firstOfNext);

    // A publicação inicial não alcança noite com preço; o Admin não abre a alteração nem pela URL.
    await page.goto(`/admin/prl/${home}?modo=inicial&mes=${month}`);
    await expect(day(page, second)).toHaveAttribute('aria-disabled', 'true');
    // O dia inerte continua tocável para explicar o motivo (o Playwright o trata como desabilitado).
    await day(page, second).tap({ force: true });
    await expect(page.getByRole('status').filter({ hasText: 'já tem preço' })).toBeVisible();
    // Temporadas de apresentação: avança até o mês da janela de Carnaval (Super Alta) e seleciona só ela; o resto do
    // mês é Média/Baixa. Depois, janeiro (Alta). A seleção por temporada não muda o grupo canônico da noite.
    const superAlta = page.locator('td[data-tier="super_alta"]');
    for (let step = 0; step < 15 && (await superAlta.count()) === 0; step += 1)
      await page.getByRole('button', { name: 'Próximo mês' }).tap();
    const carnival = await superAlta.count();
    expect(carnival).toBeGreaterThan(0);
    await expect(page.locator('td[data-tier="media"]').first()).toBeVisible();
    await expect(page.locator('.lx-pricing__legends')).toContainText('Super Alta');
    await expect(
      day(page, (await superAlta.first().locator('button').getAttribute('data-date')) ?? ''),
    ).toHaveAccessibleName(/Temporada Super Alta/);
    await page.getByLabel('Preço comum (R$)').fill('2.000,00');
    await page.getByRole('button', { name: 'Super Alta', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText(`${carnival} noites adicionadas.`);
    await expect(rows).toHaveCount(0);
    await expect(
      page.locator('td[data-tier="super_alta"] button[aria-pressed="true"]'),
    ).toHaveCount(carnival);
    await expect(page.locator('td[data-tier="media"] button[aria-pressed="true"]')).toHaveCount(0);
    await gate(page, errors, 'w16-10-prl-temporadas-carnaval');
    await widths(page, 'w16-10-prl-temporadas-carnaval');
    const lastMedia = page.locator('td[data-tier="media"] button').last();
    await focusShot(page, superAlta.first().locator('button'), 'w16-12-prl-foco-selecionada');
    await focusShot(page, lastMedia, 'w16-12-prl-foco-nao-selecionada');
    await page.getByRole('button', { name: 'Limpar seleção' }).tap();
    while ((await page.locator('td[data-tier="alta"]').count()) === 0)
      await page.getByRole('button', { name: 'Mês anterior' }).tap();
    await page.getByRole('button', { name: 'Alta', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText(/noites adicionadas\./);
    // Mês inteiro: o painel continua curto; a lista completa abre sob demanda, uma linha por noite selecionada.
    const alta = await page.locator('td[data-tier="alta"] button[aria-pressed="true"]').count();
    expect(alta).toBeGreaterThanOrEqual(28);
    await expect(rows).toHaveCount(0);
    await gate(page, errors, 'w16-11-prl-temporada-alta');
    await widths(page, 'w16-11-prl-temporada-alta');
    await page.getByRole('button', { name: 'Ajustar noite a noite' }).tap();
    await expect(rows).toHaveCount(alta);
    await page.getByRole('button', { name: 'Mostrar só os preços próprios' }).tap();
    await page.getByRole('button', { name: 'Limpar seleção' }).tap();
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
      await superPage.getByLabel('Preço comum (R$)').fill(amount);
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
      // Resumo do mês: situação agora (partição) separada das alterações programadas, que se sobrepõem a ela.
      const summary = superPage.locator('section[aria-labelledby="prl-resumo-mes"]');
      const fact = (label: string) =>
        summary.locator('.lx-pricing__fact').filter({ hasText: label });
      await expect(summary).toContainText('Situação agora');
      await expect(fact('Com preço vigente')).toContainText('2 noites');
      await expect(summary).toContainText('Alterações programadas');
      await expect(fact('Noites com versão futura')).toContainText('1 noite');
      await changed.getByText('Histórico · 3 versões registradas').tap();
      await expect(changed).toContainText('Alteração');
      await expect(changed).toContainText('Super Admin');
      await gate(superPage, superErrors, 'w16-09-prl-agendado-super-admin');
    } finally {
      await context.close();
    }
  });
});
