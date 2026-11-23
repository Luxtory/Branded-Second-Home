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
      await expect(summary(titular)).toContainText('deixam de estar disponíveis para o seu uso');
      await expect(summary(titular)).toContainText('a cessão é vinculante');
      await expect(summary(titular)).toContainText('O depósito não cobra taxa.');
      const confirm = summary(titular).getByRole('button', { name: 'Confirmar depósito' });
      await expect(confirm).toBeDisabled();
      await gate(titular, errors, 'w20-02-owner-revisao');
      await summary(titular)
        .getByText('Entendo que a cessão é vinculante depois da confirmação.')
        .tap();
      await confirm.tap();

      await expect(titular).toHaveURL(/\/titular\/luxchange\/deposito\/[0-9a-f-]{36}$/);
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Depósito concluído');
      const main = titular.locator('main');
      await expect(main).toContainText('22.222,1 Créditos');
      await expect(main).toContainText(`${first.slice(8, 10)}/${first.slice(5, 7)}`);
      await expect(main).not.toContainText('R$');
      await gate(titular, errors, 'w20-03-owner-resultado');

      // A Carteira mostra o lote originado pelo depósito (estado persistido, não cálculo da tela).
      await titular.getByRole('link', { name: 'Abrir a Carteira' }).tap();
      await expect(titular).toHaveURL(/\/titular\/carteira$/);
      const lots = titular.getByRole('list', { name: 'Lotes' });
      await expect(lots).toContainText('Depósito Luxchange');
      await expect(lots).toContainText('22.222,1 Créditos');

      // As noites saíram do calendário do depósito como já depositadas.
      await titular.goto('/titular/luxchange/deposito');
      await showMonth(titular, first);
      await expect(day(titular, first)).toHaveAttribute('aria-label', /já depositada no Luxchange/);

      // Uma notificação de originação na central (REQ-097).
      await job(page, 'outbox');
      await titular.goto('/titular/notificacoes');
      await expect(titular.locator('main')).toContainText('Depósito concluído');
      await expect(titular.locator('main')).toContainText('22.222,1 Créditos por 2 noites');
    } finally {
      await context.close();
    }
  });

  test('[REQ-060][TECH-023][REQ-051] Co-Owner: a reserva do Direito de Uso é cedida inteira e o dia segue consumido', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const { home, acquirers } = await formalizedCoOwner(
      page,
      `Second Home W20 Co ${randomUUID().slice(0, 6)}`,
    );
    const party = acquirers[0];
    const { titular, context } = await titularFor(page, browser, party);
    const errors = collectConsoleErrors(titular);
    await activateMembership(page, party);
    const booking = await seedE2eSoonCoOwnerBooking(home, party, 20);
    await publishPrl(page, home, { [booking.checkin]: '76543' });

    try {
      await titular.goto('/titular/luxchange/deposito');
      await expect(
        titular.getByRole('heading', { name: 'Datas do seu Direito de Uso' }),
      ).toBeVisible();
      await showMonth(titular, booking.checkin);
      await day(titular, booking.checkin).tap();
      await expect(day(titular, booking.checkin)).toHaveAttribute('aria-pressed', 'true');
      await expect(titular.getByText(/Reserva de .* \(1 noite\)/)).toBeVisible();
      await expect(summary(titular).locator('.lx-booking__status')).toHaveText('7.654,3 Créditos');
      await expect(titular.locator('main')).not.toContainText('R$');
      await gate(titular, errors, 'w20-04-coowner-selecao');

      await summary(titular).getByRole('button', { name: 'Revisar depósito' }).tap();
      await expect(summary(titular)).toContainText('continuam consumidos do seu Direito de Uso');
      await summary(titular)
        .getByText('Entendo que a cessão é vinculante depois da confirmação.')
        .tap();
      await summary(titular).getByRole('button', { name: 'Confirmar depósito' }).tap();
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Depósito concluído');
      await expect(titular.locator('main')).toContainText('7.654,3 Créditos');
      await gate(titular, errors, 'w20-05-coowner-resultado');

      // A reserva cedida aparece encerrada (sem restituição: não volta ao calendário de uso como disponível).
      await titular.goto(`/titular/reservas/${booking.bookingId}`);
      await expect(titular.locator('main')).toContainText('Cancelada');
    } finally {
      await context.close();
    }
  });
});
