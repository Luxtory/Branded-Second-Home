import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  publishE2eDepositParameters,
  seedE2eSoonCoOwnerBooking,
  setE2eLuxchangeDeposit,
} from '../support/e2e-acquisition-database.mjs';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedCoOwner,
  formalizedOwner,
  gate,
  job,
  MOBILE,
  post,
  titularFor,
} from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W20 E3 (spec luxchange §5.4; REQ-051, REQ-060, REQ-097, REQ-100; ADR-0036): depósito Luxchange pela jornada real do
// Titular, com o PostgreSQL real. PRL publicado pela API real do Admin e Membership pela tela real do Admin; K4/K6 e os
// parâmetros (multiplicador 10, validade 24) são fixtures do banco descartável — este projeto roda depois dos demais.
test.describe.configure({ mode: 'serial' });

const MULTIPLIER = 10;
const UPDATED_MULTIPLIER = 12;
const VALIDITY_MONTHS = 24;

async function activateMembership(page: Page, partyId: string) {
  await page.goto(`/admin/pessoas-e-empresas/${partyId}`);
  const membership = page.locator('section[aria-labelledby="party-membership"]');
  await membership.getByRole('link', { name: 'Ativar Membership' }).tap();
  await page.getByLabel('Base registrada').fill('Contrato de adesão W20');
  await page.getByRole('button', { name: 'Ativar Membership' }).tap();
  await expect(page.getByRole('status')).toContainText('Membership ativado.');
}

async function publishPrl(page: Page, home: string, nights: Readonly<Record<string, string>>) {
  await post(page, '/v1/admin/prl', {
    second_home_id: home,
    nights: Object.entries(nights).map(([stay_date, amount_minor]) => ({
      stay_date,
      amount_minor,
    })),
    effective_from: null,
    basis: 'Ata sintética W20 E2E',
  });
}

const day = (page: Page, date: string) => page.locator(`button[data-date="${date}"]`);
const summary = (page: Page) => page.locator('aside[aria-labelledby="deposito-resumo"]');

const cell = (page: Page, date: string) => page.locator(`td:has(button[data-date="${date}"])`);

/** Vai direto ao mês pelos seletores "Exercício" e "Mês" (W16): sem tocar "Próximo mês" em sequência. */
async function jumpTo(page: Page, month: string) {
  const year = page.getByLabel('Exercício', { exact: true });
  if ((await year.count()) > 0) await year.selectOption(month.slice(0, 4));
  await page.getByLabel('Mês', { exact: true }).selectOption(month);
}

/** Temporada de apresentação esperada fora de fevereiro/março (Carnaval só cai nesses meses; ADR-0032 §11). */
function expectedTier(date: string): string | null {
  const month = date.slice(5, 7);
  if (['01', '07', '12'].includes(month)) return 'alta';
  return ['02', '03'].includes(month) ? null : 'media';
}

/** Avança o calendário (um mês por vez) até o mês da data. */
async function showMonth(page: Page, date: string) {
  for (let step = 0; step < 14 && (await day(page, date).count()) === 0; step += 1)
    await page.getByRole('button', { name: 'Próximo mês' }).tap();
  await expect(day(page, date)).toBeVisible();
}

test.describe('W20 E3 — depósito Luxchange na Área do Titular', () => {
  test.use(MOBILE);

  test.beforeAll(async () => {
    await setE2eLuxchangeDeposit(true);
    await publishE2eDepositParameters(MULTIPLIER, VALIDITY_MONTHS);
  });
  test.afterAll(async () => {
    await setE2eLuxchangeDeposit(false);
  });

  test('[REQ-060][REQ-051][BR-201][REQ-097] Owner: noites livres não consecutivas viram Créditos e Inventário', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const { home, acquirer } = await formalizedOwner(
      page,
      `Second Home W20 ${randomUUID().slice(0, 6)}`,
    );
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    await activateMembership(page, acquirer);
    const [first, gap, second] = [20, 21, 22].map((offset) => addDays(civilToday(), offset)) as [
      string,
      string,
      string,
    ];
    // PRL deliberadamente quebrado: 1.234,56 e 987,65 → 12.345,6 + 9.876,5 Créditos; a noite do meio fica sem PRL.
    await publishPrl(page, home, { [first]: '123456', [second]: '98765' });

    try {
      await titular.goto('/titular');
      const area = titular.locator('section[aria-labelledby="titular-luxchange"]');
      await area.getByRole('link', { name: 'Depositar datas' }).tap();
      await expect(titular).toHaveURL(/\/titular\/luxchange\/deposito$/);
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText(
        'Depositar datas no Luxchange',
      );
      await expect(titular.getByRole('heading', { name: 'Escolha as datas' })).toBeVisible();
      await expect(summary(titular)).toContainText('Selecione as datas para ver os Créditos.');
      await expect(summary(titular)).toContainText('0 Créditos');
      // Três temporadas de apresentação da W16 (só leitura; o grupo canônico continua governando direitos).
      const legend = titular.getByRole('list', { name: 'Legenda' });
      for (const tier of ['Super Alta (Carnaval)', 'Alta', 'Média/Baixa'])
        await expect(legend).toContainText(tier);
      const superAlta = titular.locator('td[data-tier="super_alta"]');
      for (let step = 0; step < 15 && (await superAlta.count()) === 0; step += 1)
        await titular.getByRole('button', { name: 'Próximo mês' }).tap();
      await expect(superAlta.first()).toBeVisible();
      await expect(superAlta.first().locator('button')).toHaveAccessibleName(
        /temporada Super Alta \(Carnaval\)/,
      );
      // De volta ao mês da primeira noite direto pelos seletores, sem voltar mês a mês.
      await jumpTo(titular, first.slice(0, 7));
      await expect(day(titular, first)).toBeVisible();
      const tier = expectedTier(first);
      if (tier !== null) await expect(cell(titular, first)).toHaveAttribute('data-tier', tier);

      // Noite sem referência: explica o motivo ao toque, sem selecionar.
      await showMonth(titular, gap);
      // `aria-disabled` (sem ação, mas focável e tocável para explicar o motivo): o Playwright o trata como desabilitado.
      await day(titular, gap).tap({ force: true });
      await expect(titular.getByText(/ainda sem referência para o depósito/)).toBeVisible();
      await expect(day(titular, gap)).toHaveAttribute('aria-disabled', 'true');

      await showMonth(titular, first);
      await day(titular, first).tap();
      await expect(day(titular, first)).toHaveAttribute('aria-pressed', 'true');
      await showMonth(titular, second);
      await day(titular, second).tap();
      await expect(summary(titular).locator('.lx-booking__status')).toHaveText('22.222,1 Créditos');
      await expect(summary(titular)).toContainText('2 noites');
      await expect(summary(titular)).toContainText(
        `${VALIDITY_MONTHS} meses a partir da confirmação`,
      );
      // Unidade interna: nenhum valor em reais em toda a jornada do Titular (REQ-100, BR-190).
      await expect(titular.locator('main')).not.toContainText('R$');
      await gate(titular, errors, 'w20-01-owner-selecao');

      await summary(titular).getByRole('button', { name: 'Revisar depósito' }).tap();
      await expect(
        summary(titular).getByRole('heading', { name: 'Revise antes de confirmar' }),
      ).toBeVisible();
      // A revisão identifica a Second Home, o vínculo e os Créditos de cada noite.
      await expect(summary(titular)).toContainText('Owner');
      await expect(summary(titular)).toContainText(
        `${first.slice(8, 10)}/${first.slice(5, 7)}/${first.slice(0, 4)} · 12.345,6 Créditos`,
      );
      await expect(summary(titular)).toContainText('Saldo atual');
      await expect(summary(titular)).toContainText('deixam de estar disponíveis para o seu uso');
      await expect(summary(titular)).toContainText('a cessão é vinculante');
      await expect(summary(titular)).toContainText('O depósito não cobra taxa.');
      const confirm = summary(titular).getByRole('button', { name: 'Confirmar depósito' });
      await expect(confirm).toBeDisabled();
      await gate(titular, errors, 'w20-02-owner-revisao');
      await summary(titular)
        .getByText('Entendo que a cessão é vinculante depois da confirmação.')
        .tap();
      // A Luxtory publica outro multiplicador entre a revisão e a confirmação: nada é originado com termos não vistos
      // (ERR_DEPOSIT_TERMS_CHANGED); a revisão é refeita com os valores atualizados (ADR-0036 §8).
      await publishE2eDepositParameters(UPDATED_MULTIPLIER, VALIDITY_MONTHS);
      try {
        await confirm.tap();
        await expect(summary(titular).getByRole('alert')).toContainText(
          'Os Créditos ou a validade mudaram desde a revisão.',
        );
        await expect(titular).toHaveURL(/\/titular\/luxchange\/deposito$/);
        await summary(titular).getByRole('button', { name: 'Revisar valores atualizados' }).tap();
        await expect(summary(titular).getByRole('alert')).toContainText(
          'Revise os valores atualizados abaixo antes de confirmar.',
        );
        await expect(summary(titular)).toContainText('26.666,52 Créditos');
        await summary(titular)
          .getByText('Entendo que a cessão é vinculante depois da confirmação.')
          .tap();
        await summary(titular).getByRole('button', { name: 'Confirmar depósito' }).tap();
        await expect(titular).toHaveURL(/\/titular\/luxchange\/deposito\/[0-9a-f-]{36}$/);
      } finally {
        await publishE2eDepositParameters(MULTIPLIER, VALIDITY_MONTHS);
      }

      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Depósito concluído');
      const main = titular.locator('main');
      await expect(main).toContainText('26.666,52 Créditos');
      await expect(main).toContainText(`${first.slice(8, 10)}/${first.slice(5, 7)}`);
      await expect(main).not.toContainText('R$');
      await gate(titular, errors, 'w20-03-owner-resultado');

      // A Carteira mostra o lote originado pelo depósito (estado persistido, não cálculo da tela).
      await titular.getByRole('link', { name: 'Abrir a Carteira' }).tap();
      await expect(titular).toHaveURL(/\/titular\/carteira$/);
      const lots = titular.getByRole('list', { name: 'Lotes' });
      await expect(lots).toContainText('Depósito Luxchange');
      await expect(lots).toContainText('26.666,52 Créditos');

      // As noites saíram do calendário do depósito como já depositadas.
      await titular.goto('/titular/luxchange/deposito');
      await showMonth(titular, first);
      await expect(day(titular, first)).toHaveAttribute('aria-label', /já depositada no Luxchange/);

      // Uma notificação de originação na central (REQ-097).
      await job(page, 'outbox');
      await titular.goto('/titular/notificacoes');
      await expect(titular.locator('main')).toContainText('Depósito concluído');
      await expect(titular.locator('main')).toContainText('26.666,52 Créditos por 2 noites');
    } finally {
      await context.close();
    }
  });

  test('[REQ-060][TECH-023][REQ-051] Co-Owner: a reserva do Direito de Uso é cedida inteira e o dia segue consumido', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const label = `Second Home W20 Co ${randomUUID().slice(0, 6)}`;
    const { home, acquirers } = await formalizedCoOwner(page, label);
    const party = acquirers[0];
    const { titular, context } = await titularFor(page, browser, party);
    const errors = collectConsoleErrors(titular);
    await activateMembership(page, party);
    const booking = await seedE2eSoonCoOwnerBooking(home, party, 20, 2);
    const second = addDays(booking.checkin, 1);
    await publishPrl(page, home, { [booking.checkin]: '76543', [second]: '12345' });
    const rights = titular.locator('section[aria-labelledby="direito"]');

    try {
      // Direito de Uso antes do depósito, pela tela real de uso próprio.
      await titular.goto('/titular');
      await titular
        .locator('section[aria-labelledby="titular-own-use"]')
        .getByRole('link', { name: new RegExp(label) })
        .tap();
      await expect(rights).toBeVisible();
      const rightsBefore = await rights.innerText();

      await titular.goto('/titular/luxchange/deposito');
      await expect(
        titular.getByRole('heading', { name: 'Datas do seu Direito de Uso' }),
      ).toBeVisible();
      await showMonth(titular, booking.checkin);
      await day(titular, booking.checkin).tap();
      // Um toque seleciona a reserva inteira: as duas noites entram juntas (cessão integral, ADR-0036 §2).
      await expect(day(titular, booking.checkin)).toHaveAttribute('aria-pressed', 'true');
      await showMonth(titular, second);
      await expect(day(titular, second)).toHaveAttribute('aria-pressed', 'true');
      await expect(titular.getByText(/Reserva de .* \(2 noites\)/)).toBeVisible();
      await expect(summary(titular).locator('.lx-booking__status')).toHaveText('8.888,8 Créditos');
      await expect(summary(titular)).toContainText('2 noites');
      await expect(titular.locator('main')).not.toContainText('R$');
      await gate(titular, errors, 'w20-04-coowner-selecao');

      await summary(titular).getByRole('button', { name: 'Revisar depósito' }).tap();
      await expect(summary(titular)).toContainText('continuam consumidos do seu Direito de Uso');
      await expect(summary(titular)).toContainText('Co-Owner');
      await expect(summary(titular)).toContainText('1.234,5 Créditos');
      await summary(titular)
        .getByText('Entendo que a cessão é vinculante depois da confirmação.')
        .tap();
      await summary(titular).getByRole('button', { name: 'Confirmar depósito' }).tap();
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Depósito concluído');
      await expect(titular.locator('main')).toContainText('8.888,8 Créditos');
      await gate(titular, errors, 'w20-05-coowner-resultado');
      const result = titular.url();

      // A reserva aparece cedida ao Luxchange, nunca como cancelamento, e leva ao depósito (REQ-060).
      await titular.goto(`/titular/reservas/${booking.bookingId}`);
      const detail = titular.locator('main');
      await expect(detail).toContainText('Cedida ao Luxchange');
      await expect(detail).not.toContainText('Cancelada');
      await expect(titular.getByRole('heading', { name: 'Cessão ao Luxchange' })).toBeVisible();
      await expect(detail).toContainText('continuam consumidas do Direito de Uso desta Ação');
      await gate(titular, errors, 'w20-06-coowner-reserva-cedida');
      await titular.getByRole('link', { name: 'Ver o depósito' }).tap();
      await expect(titular).toHaveURL(result);

      // No Admin, a mesma reserva: situação e histórico dizem cessão ao Luxchange, não cancelamento.
      await page.goto(`/admin/reservas/${booking.bookingId}`);
      await expect(page.locator('main')).toContainText('Cedida ao Luxchange');
      await expect(page.locator('main')).toContainText('Confirmada → Cedida ao Luxchange');

      // O Direito de Uso não volta: o saldo exibido é o mesmo de antes do depósito.
      await titular.goto('/titular');
      await titular
        .locator('section[aria-labelledby="titular-own-use"]')
        .getByRole('link', { name: new RegExp(label) })
        .tap();
      await expect(rights).toBeVisible();
      expect(await rights.innerText()).toBe(rightsBefore);

      // Fechado pela Luxtory (K6/K4 sem linha): consulta sem confirmação, com aviso.
      await setE2eLuxchangeDeposit(false);
      await titular.goto('/titular/luxchange/deposito');
      await expect(
        titular
          .getByRole('status')
          .filter({ hasText: 'O depósito no Luxchange ainda não está disponível.' }),
      ).toBeVisible();
      await expect(titular.getByRole('button', { name: 'Confirmar depósito' })).toHaveCount(0);
      await gate(titular, errors, 'w20-07-fechado');
    } finally {
      await context.close();
    }
  });
});
