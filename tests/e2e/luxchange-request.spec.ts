import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  publishE2eRequestParameters,
  seedE2eSoonCoOwnerBooking,
  setE2eLuxchangeRequest,
} from '../support/e2e-acquisition-database.mjs';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedCoOwner,
  formalizedOwner,
  gate,
  MOBILE,
  post,
  titularFor,
} from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W21 E3 (spec luxchange §13.5; REQ-062, REQ-097, REQ-100, PD-005, PD-007, PD-012; ADR-0037): Request completa pela
// jornada real do Titular, com o PostgreSQL real e o PSP fake num segundo `next start` (porta do E2E + 3) — os demais
// specs seguem sem PSP. Créditos do solicitante vêm de um depósito real; PRL e Membership pelo Admin real; K4–K7 e os
// parâmetros são fixtures do banco descartável. A 390 px com toque (Request com complemento e retirada) e a 1440 px
// (Request só com Garantia e retirada); axe e overflow em 390 e 1440 em cada etapa.
test.describe.configure({ mode: 'serial' });

const PAYMENTS_URL = 'http://127.0.0.1:3103';
const DESKTOP = { width: 1440, height: 900 } as const;
const POLICY = {
  cancellation: [
    { min_notice_hours: 0, effects: { capacity: 'return_to_origin', credits: '0', fee: '0' } },
  ],
  no_show: { capacity: 'return_to_origin', credits: '0', fee: '0' },
  exception: { capacity: 'return_to_origin', credits: '1', fee: '1' },
};

async function activateMembership(page: Page, partyId: string) {
  await page.goto(`/admin/pessoas-e-empresas/${partyId}`);
  const membership = page.locator('section[aria-labelledby="party-membership"]');
  await membership.getByRole('link', { name: 'Ativar Membership' }).tap();
  await page.getByLabel('Base registrada').fill('Contrato de adesão W21');
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
    basis: 'Ata sintética W21 E2E',
  });
}

const br = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const target = (page: Page) => page.locator('section[aria-labelledby="solicitacao-datas"]');
const complement = (page: Page) =>
  page.locator('section[aria-labelledby="solicitacao-complemento-titulo"]');
const summary = (page: Page) => page.locator('aside[aria-labelledby="solicitacao-resumo"]');
const fact = (scope: Locator, label: string) =>
  scope
    .locator('.lx-booking__fact')
    .filter({ has: scope.page().getByText(label, { exact: true }) });

/** Avança o mês dentro do calendário até a data aparecer. */
async function showDate(scope: Locator, date: string, touch: boolean) {
  // O calendário precisa estar na tela antes de contar: contar na página anterior avançaria meses demais.
  await expect(scope.locator('.lx-calendar__title').first()).toBeVisible();
  const day = scope.locator(`button[data-date="${date}"]`);
  for (let step = 0; step < 14 && (await day.count()) === 0; step += 1) {
    const next = scope.getByRole('button', { name: 'Próximo mês' });
    await (touch ? next.tap() : next.click());
  }
  await expect(day).toBeVisible();
  return day;
}

async function press(locator: Locator, touch: boolean) {
  await (touch ? locator.tap() : locator.click());
}

/** Lê o detalhe até o estorno sair de "solicitado" (o PSP fake conclui depois da resposta) — nunca o contrário. */
async function expectRefundSettles(page: Page) {
  const refund = fact(page.locator('main'), 'Devolução da Taxa');
  await expect(refund).toContainText(
    /Devolução da Taxa solicitada — em processamento|Taxa de intermediação devolvida/,
  );
  await expect(async () => {
    await page.reload();
    await expect(refund).toContainText('Taxa de intermediação devolvida', { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe('W21 E3 — Request: envio, acompanhamento e retirada', () => {
  // Tudo no servidor com PSP: a sessão de teste e os convites vivem na memória de cada processo.
  test.use({ ...MOBILE, baseURL: PAYMENTS_URL });

  test.beforeAll(async () => {
    await setE2eLuxchangeRequest(true);
    await publishE2eRequestParameters({
      credit_multiplier: 10,
      credit_validity_months: 24,
      luxchange_fee_rate: '0.12',
      luxchange_fee_minimum: 9876,
      request_deadline_hours: 24,
    });
  });
  test.afterAll(async () => {
    await setE2eLuxchangeRequest(false);
  });

  test('[REQ-062][PD-005][PD-007][PD-012][REQ-097][REQ-100] Request completa a 390 px (com datas próprias) e a 1440 px', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS * 2);
    const suffix = randomUUID().slice(0, 6);
    const holderLabel = `Second Home W21 solicitada ${suffix}`;
    const { home: holderHome, acquirer: holderParty } = await formalizedOwner(page, holderLabel);
    // `formalizedOwner` entra como Admin: a segunda formalização começa de uma sessão limpa.
    await page.context().clearCookies();
    const { home: ownHome, acquirer: requesterParty } = await formalizedOwner(
      page,
      `Second Home W21 solicitante ${suffix}`,
    );
    await post(page, '/v1/admin/policies', {
      mechanism: 'luxchange_request',
      config: POLICY,
      effective_from: null,
      effective_to: null,
      basis: 'Ata sintética W21 E2E',
    });
    await activateMembership(page, holderParty);
    await activateMembership(page, requesterParty);
    const today = civilToday();
    const [wantedA, wantedB, wantedC] = [20, 21, 22].map((offset) => addDays(today, offset)) as [
      string,
      string,
      string,
    ];
    const [depositA, depositB, ownNight] = [30, 31, 40].map((offset) => addDays(today, offset)) as [
      string,
      string,
      string,
    ];
    // R$ 50,00 → 500 Créditos por noite solicitada; R$ 100,00 → 1.000 Créditos por noite depositada; R$ 30,00 → 300.
    await publishPrl(page, holderHome, { [wantedA]: '5000', [wantedB]: '5000', [wantedC]: '5000' });
    await publishPrl(page, ownHome, {
      [depositA]: '10000',
      [depositB]: '10000',
      [ownNight]: '3000',
    });

    const { titular: requester, context } = await titularFor(page, browser, requesterParty);
    const { titular: holder, context: holderContext } = await titularFor(
      page,
      browser,
      holderParty,
    );
    const errors = collectConsoleErrors(requester);
    try {
      // Créditos do solicitante por um depósito real (W20): 2.000 disponíveis.
      await requester.goto('/titular');
      await post(requester, '/v1/luxchange/deposits', {
        party_id: requesterParty,
        second_home_id: ownHome,
        nights: [depositA, depositB],
        expected_night_credits: ['1000', '1000'],
        expected_credits: '2000',
        expected_validity_months: 24,
      });

      // Área do Titular → Solicitações (lista vazia) → Nova solicitação → Second Home "a partir de".
      await requester.reload();
      const area = requester.locator('section[aria-labelledby="titular-solicitacoes"]');
      await press(area.getByRole('link', { name: 'Ver solicitações' }), true);
      await expect(requester).toHaveURL(/\/titular\/luxchange\/solicitacoes$/);
      await expect(requester.getByText('Você ainda não enviou solicitações.')).toBeVisible();
      await gate(requester, errors, 'w21-01-solicitacoes-vazia');
      await press(requester.getByRole('link', { name: 'Nova solicitação' }), true);
      const option = requester.getByRole('link', { name: holderLabel });
      await expect(option.locator('xpath=ancestor::li[1]')).toContainText(
        'A partir de 500 Créditos por noite',
      );
      await expect(
        requester.getByRole('link', { name: `Second Home W21 solicitante ${suffix}` }),
      ).toHaveCount(0);
      await gate(requester, errors, 'w21-02-escolha');
      await press(option, true);
      await expect(requester).toHaveURL(
        /\/solicitacoes\/nova\?party=[0-9a-f-]{36}&casa=[0-9a-f-]{36}$/,
      );

      // Datas: Solicitável com Créditos, nunca reais; período contínuo de duas noites.
      const dayA = await showDate(target(requester), wantedA, true);
      await expect(dayA).toHaveAccessibleName(/Solicitável, 500 Créditos/);
      await expect(target(requester)).not.toContainText('R$');
      await press(dayA, true);
      await press(await showDate(target(requester), wantedB, true), true);
      await expect(summary(requester).locator('.lx-booking__status')).toHaveText(
        `${wantedA.slice(8, 10)}/${wantedA.slice(5, 7)} a ${wantedB.slice(8, 10)}/${wantedB.slice(5, 7)} · 2 noites`,
      );
      await expect(fact(summary(requester), 'Créditos necessários')).toContainText(
        '1.000 Créditos',
      );
      await expect(fact(summary(requester), 'Saldo disponível na Carteira')).toContainText(
        '2.000 Créditos',
      );
      // Datas próprias: a noite com 14 dias no fim do prazo, com os Créditos potenciais.
      const own = await showDate(complement(requester), ownNight, true);
      await press(own, true);
      await expect(fact(summary(requester), 'Créditos potenciais das datas')).toContainText(
        '300 Créditos',
      );
      await gate(requester, errors, 'w21-03-selecao');

      // Prévia do servidor: N, P, G, C, E, Taxa e prazo, cada número com a sua natureza; potenciais nunca como saldo.
      await press(summary(requester).getByRole('button', { name: 'Ver prévia' }), true);
      const review = summary(requester);
      await expect(review.getByRole('heading', { name: 'Prévia da solicitação' })).toBeVisible();
      for (const group of [
        'Sua Carteira agora',
        'Como os Créditos necessários são cobertos',
        'Depois do envio',
        'Taxa e prazo',
      ])
        await expect(review.getByRole('heading', { name: group })).toBeVisible();
      for (const [label, value] of [
        ['Saldo disponível na Carteira', '2.000 Créditos'],
        [
          'Saldo potencial para intercâmbio',
          '2.000 disponíveis + 300 potenciais, ainda não originados',
        ],
        ['Créditos necessários', '1.000 Créditos'],
        ['Créditos em Garantia', '700 Créditos'],
        ['Créditos potenciais das datas', 'Ainda não originados'],
        ['Total coberto', '700 em Garantia + 300 potenciais'],
        ['Excedente', '0 Créditos'],
        ['Saldo disponível depois do envio', '1.300 Créditos'],
        ['Em Garantia até a resposta', '700 Créditos'],
        ['Taxa de intermediação', 'R$ 98,76'],
        ['Prazo para resposta', '24 horas a partir do envio'],
      ] as const)
        await expect(fact(review, label)).toContainText(value);
      await expect(fact(review, 'Saldo potencial para intercâmbio')).toContainText(
        '2.300 Créditos',
      );
      await expect(fact(review, 'Créditos potenciais das datas')).toContainText('300 Créditos');
      await expect(fact(review, 'Total coberto')).toContainText('1.000 Créditos');
      await expect(fact(review, 'Datas a comprometer')).toContainText(br(ownNight).slice(0, 5));
      // PD-009: os termos efetivos da política aparecem antes do aceite, que se vincula à versão apresentada.
      await expect(review.getByRole('heading', { name: 'Política da solicitação' })).toBeVisible();
      for (const term of ['Cancelamento', 'Não comparecimento (no-show)'])
        await expect(review.getByRole('heading', { name: term })).toBeVisible();
      const send = review.getByRole('button', { name: 'Pagar a Taxa e enviar' });
      await expect(send).toBeDisabled();
      await review.getByLabel(/Li e aceito a política comercial/).check();
      await expect(send).toBeDisabled();
      await review.getByLabel(/Aceito comprometer as datas acima/).check();
      await expect(send).toBeEnabled();
      await gate(requester, errors, 'w21-04-previa');

      // Pagamento aprovado → envio → detalhe com o estado real.
      await press(send, true);
      await expect(requester).toHaveURL(
        /\/titular\/luxchange\/solicitacoes\/[0-9a-f-]{36}\?enviada=1$/,
      );
      const main = requester.locator('main');
      await expect(main.getByRole('status')).toContainText('Solicitação enviada.');
      for (const [label, value] of [
        ['Situação', 'Aguardando resposta'],
        ['Créditos necessários', '1.000 Créditos'],
        ['Créditos em Garantia', '700 Créditos'],
        ['Créditos potenciais das datas comprometidas', '300 Créditos'],
        ['Datas comprometidas', br(ownNight)],
        ['Taxa de intermediação', 'R$ 98,76'],
        ['Pagamento da Taxa', 'Aprovado'],
        ['Devolução da Taxa', 'Taxa de intermediação paga'],
      ] as const)
        await expect(fact(main, label)).toContainText(value);
      await gate(requester, errors, 'w21-05-enviada');
      const detailUrl = requester.url().replace(/\?enviada=1$/, '');

      // Carteira: Garantia e datas comprometidas como Créditos potenciais, não utilizáveis.
      await requester.goto('/titular/carteira');
      await expect(requester.locator('#carteira-saldo').locator('..')).toContainText(
        '700 Créditos',
      );
      const committed = requester.locator('section[aria-labelledby="carteira-comprometidas"]');
      await expect(committed).toContainText('Créditos potenciais, não utilizáveis');
      await expect(committed).toContainText('300 Créditos');
      await gate(requester, errors, 'w21-06-carteira');

      // Solicitado: recebida só leitura e o aviso na central (REQ-097), sem dados de quem pediu.
      await holder.goto('/titular/luxchange/solicitacoes');
      const received = holder.locator('section[aria-labelledby="solicitacoes-recebidas"]');
      await expect(received).toContainText(holderLabel);
      await expect(received).toContainText('Aguardando resposta');
      await expect(async () => {
        await holder.goto('/titular/notificacoes');
        await expect(holder.getByText('Solicitação recebida').first()).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 30_000 });

      // Retirada: Garantia liberada, datas liberadas, estorno solicitado e depois concluído (nunca antes).
      await requester.goto(detailUrl);
      await press(requester.getByRole('button', { name: 'Retirar solicitação' }), true);
      await expect(fact(requester.locator('main'), 'Situação')).toContainText(
        'Encerrada · Retirada por você',
      );
      await expect(
        fact(requester.locator('main'), 'Garantia liberada para a Carteira'),
      ).toContainText('700 Créditos');
      await expect(requester.getByRole('button', { name: 'Retirar solicitação' })).toHaveCount(0);
      await expectRefundSettles(requester);
      await gate(requester, errors, 'w21-07-retirada');
      await requester.goto('/titular/carteira');
      await expect(
        requester.locator('section[aria-labelledby="carteira-comprometidas"]'),
      ).toHaveCount(0);
      await expect(async () => {
        await requester.goto('/titular/notificacoes');
        await expect(requester.getByText('Solicitação encerrada').first()).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 30_000 });
      await expect(requester.getByText('Devolução solicitada').first()).toBeVisible();

      // 1440 px: Request só com Garantia, do início à retirada, com clique.
      await requester.setViewportSize(DESKTOP);
      await requester.goto('/titular/luxchange/solicitacoes/nova');
      await requester.getByRole('link', { name: holderLabel }).click();
      await expect(requester).toHaveURL(/\/solicitacoes\/nova\?party=/);
      const dayC = await showDate(target(requester), wantedC, false);
      await dayC.click();
      await expect(fact(summary(requester), 'Créditos necessários')).toContainText('500 Créditos');
      await summary(requester).getByRole('button', { name: 'Ver prévia' }).click();
      await expect(fact(summary(requester), 'Créditos em Garantia')).toContainText('500 Créditos');
      await expect(fact(summary(requester), 'Datas a comprometer')).toContainText('Nenhuma');
      await expect(summary(requester).getByLabel(/Aceito comprometer/)).toHaveCount(0);
      await summary(requester)
        .getByLabel(/Li e aceito a política comercial/)
        .check();
      await gate(requester, errors, 'w21-08-previa-desktop');
      await summary(requester).getByRole('button', { name: 'Pagar a Taxa e enviar' }).click();
      await expect(requester).toHaveURL(/\?enviada=1$/);
      await expect(fact(requester.locator('main'), 'Créditos em Garantia')).toContainText(
        '500 Créditos',
      );
      await requester.goto('/titular/luxchange/solicitacoes');
      await expect(
        requester.locator('section[aria-labelledby="solicitacoes-enviadas"]'),
      ).toContainText('Aguardando resposta');
      await gate(requester, errors, 'w21-09-lista-desktop');
      await requester
        .locator('section[aria-labelledby="solicitacoes-enviadas"]')
        .getByRole('link')
        .first()
        .click();
      await requester.getByRole('button', { name: 'Retirar solicitação' }).click();
      await expect(fact(requester.locator('main'), 'Situação')).toContainText('Encerrada');
      await expectRefundSettles(requester);
    } finally {
      await context.close();
      await holderContext.close();
    }
  });
  test('[PD-012][REQ-062][REQ-097] Co-Owner: só a reserva inteira compromete; composição, envio, reserva e retirada', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const suffix = randomUUID().slice(0, 6);
    const holderLabel = `Second Home W21 solicitada Co ${suffix}`;
    const coLabel = `Second Home W21 Co-Owner ${suffix}`;
    const { home: holderHome, acquirer: holderParty } = await formalizedOwner(page, holderLabel);
    await page.context().clearCookies();
    const { home: coHome, acquirers } = await formalizedCoOwner(page, coLabel);
    const requesterParty = acquirers[0];
    await activateMembership(page, holderParty);
    await activateMembership(page, requesterParty);
    const wanted = addDays(civilToday(), 25);
    // A reserva do Direito de Uso (2 noites a R$ 30,00 → 300 Créditos potenciais cada) cobre a noite pedida (500):
    // G = 0, C = 500, E = 100 — sem Créditos na Carteira.
    // A fixture da reserva exige a representação ativa da party (como no depósito da W20).
    const { titular: requester, context } = await titularFor(page, browser, requesterParty);
    const booking = await seedE2eSoonCoOwnerBooking(coHome, requesterParty, 30, 2);
    const second = addDays(booking.checkin, 1);
    await publishPrl(page, holderHome, { [wanted]: '5000' });
    await publishPrl(page, coHome, { [booking.checkin]: '3000', [second]: '3000' });
    const errors = collectConsoleErrors(requester);
    try {
      await requester.goto('/titular/luxchange/solicitacoes/nova');
      await press(requester.getByRole('link', { name: holderLabel }), true);
      await expect(requester).toHaveURL(/\/solicitacoes\/nova\?party=/);
      await press(await showDate(target(requester), wanted, true), true);

      // Co-Owner: a reserva aparece como uma opção inteira (sem noites avulsas), com os Créditos potenciais da reserva.
      const reservation = complement(requester).getByRole('group', { name: coLabel });
      await expect(reservation.locator('button[data-date]')).toHaveCount(0);
      const option = reservation.getByRole('checkbox', {
        name: `Reserva de ${booking.checkin.slice(8, 10)}/${booking.checkin.slice(5, 7)} a ${second.slice(8, 10)}/${second.slice(5, 7)} (2 noites)`,
      });
      await expect(option).toHaveCount(1);
      await expect(reservation).toContainText('600 Créditos potenciais');
      await option.check();
      await expect(fact(summary(requester), 'Créditos potenciais das datas')).toContainText(
        '600 Créditos',
      );
      await press(summary(requester).getByRole('button', { name: 'Ver prévia' }), true);
      const review = summary(requester);
      for (const [label, value] of [
        ['Saldo disponível na Carteira', '0 Créditos'],
        [
          'Saldo potencial para intercâmbio',
          '0 disponíveis + 600 potenciais, ainda não originados',
        ],
        ['Créditos necessários', '500 Créditos'],
        ['Créditos em Garantia', '0 Créditos'],
        ['Total coberto', '0 em Garantia + 500 potenciais'],
        ['Excedente', '100 Créditos'],
        ['Saldo disponível depois do envio', '0 Créditos'],
      ] as const)
        await expect(fact(review, label)).toContainText(value);
      await expect(fact(review, 'Datas a comprometer')).toContainText(coLabel);
      await review.getByLabel(/Li e aceito a política comercial/).check();
      await review.getByLabel(/Aceito comprometer as datas acima/).check();
      await gate(requester, errors, 'w21-10-coowner-previa');
      await press(review.getByRole('button', { name: 'Pagar a Taxa e enviar' }), true);
      await expect(requester).toHaveURL(/\?enviada=1$/);
      const main = requester.locator('main');
      for (const [label, value] of [
        ['Situação', 'Aguardando resposta'],
        ['Créditos em Garantia', '0 Créditos'],
        ['Créditos potenciais das datas comprometidas', '600 Créditos'],
        ['Datas comprometidas', `${coLabel} ${br(booking.checkin)}, ${coLabel} ${br(second)}`],
        ['Pagamento da Taxa', 'Aprovado'],
      ] as const)
        await expect(fact(main, label)).toContainText(value);
      const detailUrl = requester.url().replace(/\?enviada=1$/, '');

      // A reserva comprometida orienta a retirar a solicitação (não pode ser cancelada nem depositada enquanto pendente).
      await requester.goto(`/titular/reservas/${booking.bookingId}`);
      const notice = requester
        .getByRole('status')
        .filter({ hasText: 'comprometida com uma solicitação sua' });
      await expect(notice).toBeVisible();
      await expect(notice.getByRole('link', { name: 'Ver solicitação' })).toHaveAttribute(
        'href',
        new URL(detailUrl).pathname,
      );
      await gate(requester, errors, 'w21-11-coowner-reserva');

      await requester.goto(detailUrl);
      await press(requester.getByRole('button', { name: 'Retirar solicitação' }), true);
      await expect(fact(requester.locator('main'), 'Situação')).toContainText(
        'Encerrada · Retirada por você',
      );
      await expectRefundSettles(requester);
      await requester.goto(`/titular/reservas/${booking.bookingId}`);
      await expect(
        requester.getByRole('status').filter({ hasText: 'comprometida com uma solicitação sua' }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
