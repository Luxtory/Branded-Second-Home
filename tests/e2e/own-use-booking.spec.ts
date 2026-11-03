import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { partialAcquisitionScenario } from '../support/acquisition-scenario';
import { ensureE2eInstitution, setE2eOwnUseBooking } from '../support/e2e-acquisition-database.mjs';
import { completeE2eInitialDraw, e2eCronSecret } from '../support/e2e-initial-draw';
import { randomCpf, validCnpj } from '../support/documents';
import { signIn, STAFF_EMAIL, TEST_CODE } from './support/auth';
import { readSeed } from './support/discovery';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// W12 (spec booking §7): calendário de uso próprio pelos contratos reais — Admin formaliza, os jobs reais selam o
// exercício, o Titular ativa a representação e reserva. Sem a ativação (ADR-0026), a interface informa que as reservas
// não estão abertas e não oferece confirmação; um teste liga a ativação só neste banco descartável para provar a
// confirmação na interface real e a desliga em seguida. Em série: a ativação é estado global do banco.
const FLOW_TIMEOUT_MS = 300_000;
const MOBILE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  timezoneId: 'America/Sao_Paulo',
  locale: 'pt-BR',
} as const;
const gateMode = process['env']['E2E_ACQUISITION_GATE'];
const DAY_MS = 86_400_000;

const civilToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@luxtory.test`;

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data,
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { id: string };
}

async function job(page: Page, name: string) {
  const response = await page.request.get(`/api/jobs/${name}`, {
    headers: { authorization: `Bearer ${e2eCronSecret()}` },
  });
  expect(response.status(), `${name}: ${await response.text()}`).toBe(200);
}

const section = (page: Page, id: string) => page.locator(`#${id}`).locator('..');

/** Owner formalizado com início da operação hoje, pela tela do Admin (contrato já provado na W8). */
async function formalizedOwner(page: Page, label: string) {
  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);
  const home = (
    await post(page, '/v1/admin/second-homes', {
      home_edition_id: readSeed().withHomeEdition.homeEdition.id,
      label,
      timezone: 'America/Sao_Paulo',
    })
  ).id;
  const acquirer = (await post(page, '/v1/admin/parties', { document: randomCpf() })).id;
  await page.goto(`/admin/catalogo/second-homes/${home}/formalizacao`);
  const form = section(page, 'formalize-form');
  await form.getByLabel('Localização concreta').fill('Localização sintética · Reserva 01');
  await form.getByLabel('Data de início da operação (base civil)').fill(civilToday());
  await form.getByLabel('Modalidade', { exact: true }).selectOption('owner');
  await form.getByLabel('Adquirente 1', { exact: true }).selectOption(acquirer);
  await form.getByLabel('Referência da base registrada').fill('Ato sintético Owner W12');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  const start = section(page, 'operation-start-form');
  await start.getByLabel('Data efetiva de início').fill(civilToday());
  await start.getByLabel('Referência da base registrada').fill('Declaração sintética Owner W12');
  await start.getByRole('checkbox').check();
  await start.getByRole('button', { name: 'Declarar início da operação' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  await job(page, 'open_exercise');
  await job(page, 'outbox');
  return { home, acquirer };
}

/** Co-Owner parcial formalizado pela tela do Admin (contrato da W8), com sorteio concluído, exercício selado e Direito
 *  de Uso concedido pelos jobs reais (W9–W11). */
async function formalizedCoOwner(page: Page, label: string) {
  const cnpj = () => validCnpj(randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase());
  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);
  const home = (
    await post(page, '/v1/admin/second-homes', {
      home_edition_id: readSeed().withHomeEdition.homeEdition.id,
      label,
      timezone: 'America/Sao_Paulo',
    })
  ).id;
  // A formalização Co-Owner exige a identidade jurídica da Luxtory (única no ambiente; qualquer party serve aqui).
  await ensureE2eInstitution((await post(page, '/v1/admin/parties', { document: cnpj() })).id);
  const acquirers = [
    (await post(page, '/v1/admin/parties', { document: randomCpf() })).id,
    (await post(page, '/v1/admin/parties', { document: randomCpf() })).id,
  ] as const;
  const spe = (await post(page, '/v1/admin/parties', { document: cnpj() })).id;
  const scenario = partialAcquisitionScenario(new Date());
  await page.goto(`/admin/catalogo/second-homes/${home}/formalizacao`);
  const allocation = section(page, 'initial-allocation-form');
  await allocation.locator('summary').tap();
  await allocation.getByLabel('Configuração Co-Owner').selectOption('2');
  await allocation
    .getByLabel('Data de início da operação (base civil)')
    .fill(scenario.operationDate);
  await allocation.getByLabel('Referência da base registrada').fill('Alocação sintética W12');
  for (const [field, value] of [
    ['Alta por Ação', String(scenario.alta)],
    ['Média por Ação', String(scenario.media)],
    ['Alta Luxtory', '0'],
    ['Média Luxtory', '0'],
  ] as const)
    await allocation.getByLabel(field).fill(value);
  await allocation.getByRole('button', { name: 'Registrar alocação inicial' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  const form = section(page, 'formalize-form');
  await form.getByLabel('Localização concreta').fill('Localização sintética · Reserva 02');
  await form.getByLabel('Data de início da operação (base civil)').fill(scenario.operationDate);
  await form.getByLabel('Modalidade', { exact: true }).selectOption('co_owner');
  await form.getByLabel('Configuração Co-Owner').selectOption('2');
  await form.getByLabel('Pessoa jurídica da SPE').selectOption(spe);
  await form.getByLabel('Alocação inicial registrada').selectOption({ index: 1 });
  for (const [i, id] of acquirers.entries())
    await form.getByLabel(`Adquirente ${i + 1}`, { exact: true }).selectOption(id);
  await form.getByLabel('Referência da base registrada').fill('Ato sintético Co-Owner W12');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  const start = section(page, 'operation-start-form');
  await start.getByLabel('Data efetiva de início').fill(scenario.operationDate);
  await start.getByLabel('Referência da base registrada').fill('Declaração sintética Co-Owner W12');
  await start.getByRole('checkbox').check();
  await start.getByRole('button', { name: 'Declarar início da operação' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  await job(page, 'outbox');
  await completeE2eInitialDraw(home);
  await job(page, 'outbox');
  await job(page, 'open_exercise');
  await job(page, 'outbox');
  return { home, acquirers, scenario };
}

/** Convite + primeiro acesso + ativação da representação na Área do Titular, num contexto móvel próprio. */
async function titularFor(page: Page, browser: Browser, partyId: string) {
  const email = uniqueEmail('titular-reserva');
  await post(page, `/v1/admin/parties/${partyId}/delegations`, {
    email,
    basis: 'Contrato sintético W12',
  });
  const context = await browser.newContext({ ...MOBILE, baseURL: new URL(page.url()).origin });
  const titular = await context.newPage();
  await titular.goto('/titular/ativar');
  await titular.getByLabel('E-mail').fill(email);
  await titular.getByLabel('Código do convite').fill(TEST_CODE);
  await titular.getByRole('button', { name: 'Continuar' }).tap();
  await expect(titular).toHaveURL(/\/titular$/);
  await titular.getByRole('button', { name: 'Ativar representação' }).tap();
  await expect(titular.getByRole('status')).toContainText('Representação ativada.');
  return { titular, context };
}

async function gate(page: Page, errors: readonly string[], name: string) {
  await expectResponsive(page, errors);
  await captureForReview(page, name, { fromTop: true });
}

test.describe('W12 — reserva de uso próprio a 390 px com toque e PostgreSQL real', () => {
  test.skip(gateMode === 'closed', 'Open acquisition gate variant not selected');
  test.describe.configure({ mode: 'serial' });
  test.use(MOBILE);

  test('[REQ-037][REQ-035][PD-002][TECH-052][ADR-0026] Owner com reservas fechadas: calendário e prévia para consulta, sem confirmação', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const label = `Second Home sintética Reserva ${randomUUID().slice(0, 6)}`;
    const { acquirer } = await formalizedOwner(page, label);
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    try {
      // Área do Titular → Uso próprio → calendário da Second Home representada.
      await expect(titular.getByRole('heading', { level: 2, name: 'Uso próprio' })).toBeVisible();
      await titular
        .locator('section[aria-labelledby="titular-own-use"]')
        .getByRole('link', { name: new RegExp(label) })
        .tap();
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Reservar uso próprio');
      await expect(
        titular.getByText(/O Owner pode reservar qualquer noite livre do calendário/),
      ).toBeVisible();
      await expect(titular.getByRole('list', { name: 'Legenda do calendário' })).toContainText(
        'Reserva do Owner',
      );
      await expect(titular.getByText('Alta/Super Alta')).toHaveCount(0);
      await expect(titular.locator('.lx-booking__closed')).toContainText(
        'Novas reservas de uso próprio ainda não estão abertas.',
      );
      await gate(titular, errors, 'w12-01-owner-calendario');

      // Campos nativos → grade sincronizada → prévia do servidor.
      const checkin = addDays(civilToday(), 2);
      const checkout = addDays(checkin, 3);
      await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
      await titular.getByLabel('Saída', { exact: true }).fill(checkout);
      const selection = titular.locator('.lx-calendar__selection [role="status"]');
      await expect(selection).toHaveText(
        `Entrada ${dayMonth(checkin)}, saída ${dayMonth(checkout)}: 3 noites.`,
      );
      const summary = titular.locator('.lx-booking__status');
      // Prévia do servidor para consulta; sem a ativação, nenhuma confirmação é oferecida (o banco recusaria).
      await expect(summary).toHaveText('Noites livres. Novas reservas ainda não estão abertas.');
      await expect(titular.locator(`[data-date="${checkin}"]`).locator('..')).toHaveAttribute(
        'data-range',
        'start',
      );
      await expect(titular.getByRole('button', { name: 'Confirmar reserva' })).toHaveCount(0);
      await expect(titular.locator('.lx-booking__summary')).toContainText(
        'A confirmação abre quando a Luxtory habilitar as reservas de uso próprio.',
      );
      await gate(titular, errors, 'w12-02-owner-previa-fechada');

      // Toque na grade: entrada pelo calendário e "Limpar datas".
      await titular.getByRole('button', { name: 'Limpar datas' }).tap();
      await expect(titular.getByLabel('Entrada', { exact: true })).toHaveValue('');
      await titular.locator(`[data-date="${checkin}"]`).tap();
      await expect(titular.getByLabel('Entrada', { exact: true })).toHaveValue(checkin);
      await expect(selection).toContainText(`Entrada em`);

      // Reservas e notificações: nada foi reservado.
      await titular.goto('/titular/reservas');
      await expect(titular.getByText('Ainda não há reservas.')).toBeVisible();
      await gate(titular, errors, 'w12-04-owner-reservas');
      await titular.goto('/titular/notificacoes');
      await expect(titular.getByText('Nenhuma notificação.')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('[REQ-034][REQ-030][REQ-031][TECH-042][TECH-052][ADR-0026] Co-Owner: fechadas, consulta sem confirmação; ligadas só nesta base, confirma e o saldo da categoria cai', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const label = `Second Home sintética Co-Owner Reserva ${randomUUID().slice(0, 6)}`;
    const { acquirers } = await formalizedCoOwner(page, label);
    const { titular, context } = await titularFor(page, browser, acquirers[0]);
    const errors = collectConsoleErrors(titular);
    try {
      await titular
        .locator('section[aria-labelledby="titular-own-use"]')
        .getByRole('link', { name: new RegExp(label) })
        .tap();
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Reservar uso próprio');
      await expect(titular.getByText(/Co-Owner · Ação que você representa/)).toBeVisible();
      await expect(
        titular.getByRole('heading', { level: 2, name: /Direito de Uso desta Ação em/ }),
      ).toBeVisible();
      await expect(titular.getByRole('list', { name: 'Legenda do calendário' })).toContainText(
        'Reserva desta Ação',
      );
      await expect(titular.getByText(/extraordin/i)).toHaveCount(0);
      await gate(titular, errors, 'w12-05-co-owner-calendario');

      // Mês corrente fechado pela janela desta Ação: a grade diz quando abre; avança até o exercício aberto.
      const available = titular.locator(
        'td:not([data-state]) > .lx-calendar__day:not([aria-disabled])',
      );
      const next = titular.getByRole('button', { name: 'Próximo mês' });
      for (let month = 0; month < 14 && (await available.count()) === 0; month += 1) {
        if (await titular.locator('td[data-state="closed"]').count())
          await expect(titular.locator('.lx-calendar__note').first()).toContainText(
            'desta Ação abre em',
          );
        await next.tap();
      }
      expect(await available.count()).toBeGreaterThan(0);
      const checkin = (await available.first().getAttribute('data-date'))!;
      await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
      await titular.getByLabel('Saída', { exact: true }).fill(addDays(checkin, 1));
      const summary = titular.locator('.lx-booking__status');
      await expect(summary).toHaveText(
        /Noites livres\. Novas reservas ainda não estão abertas\.|Não é possível reservar este período\./,
      );
      if ((await summary.textContent())?.startsWith('Noites livres')) {
        await expect(titular.locator('.lx-booking__summary .lx-booking__facts')).toContainText(
          'restarão',
        );
      } else {
        // Saldo da categoria esgotado nesta posição: o motivo vem do servidor.
        await expect(titular.locator('.lx-booking__issues')).toBeVisible();
      }
      await expect(titular.getByRole('button', { name: 'Confirmar reserva' })).toHaveCount(0);
      await gate(titular, errors, 'w12-06-co-owner-previa');

      // Reservas ligadas só neste banco descartável: a confirmação do Co-Owner pela interface real consome o Direito de
      // Uso na categoria da noite (a outra não muda), ocupa a noite e o saldo apresentado ao Titular cai.
      await setE2eOwnUseBooking(true);
      try {
        await titular.reload();
        await expect(titular.locator('.lx-booking__closed')).toHaveCount(0);
        let night = checkin;
        for (let tries = 0; tries < 20; tries += 1) {
          await titular.getByLabel('Entrada', { exact: true }).fill(night);
          await titular.getByLabel('Saída', { exact: true }).fill(addDays(night, 1));
          await expect(summary).toHaveText(
            /Período disponível\.|Não é possível reservar este período\./,
          );
          if ((await summary.textContent()) === 'Período disponível.') break;
          night = addDays(night, 1);
        }
        await expect(summary).toHaveText('Período disponível.');
        const usage = titular
          .locator('.lx-booking__summary .lx-booking__fact')
          .filter({ hasText: 'restarão' });
        const usageLabel = (await usage.locator('dt').textContent())!;
        const [, after, granted] = (await usage.locator('dd').textContent())!.match(
          /restarão (\d+) de (\d+)/,
        )!;
        const [bucket, year] = [usageLabel.slice(0, -5), usageLabel.slice(-4)];
        const other = bucket === 'Alta/Super Alta' ? 'Média/Baixa' : 'Alta/Super Alta';
        const rightsRow = (name: string) =>
          titular.locator('.lx-booking__rights .lx-booking__fact').filter({
            // Rótulo sem o ano quando só um exercício aparece; com o ano quando há dois.
            has: titular
              .getByText(name, { exact: true })
              .or(titular.getByText(`${name} ${year}`, { exact: true })),
          });
        const available = (left: number) =>
          `${left} ${left === 1 ? 'disponível' : 'disponíveis'} de ${granted} noites`;
        await expect(rightsRow(bucket)).toContainText(available(Number(after) + 1));
        const otherBefore = await rightsRow(other).textContent();
        await titular.getByRole('button', { name: 'Confirmar reserva' }).tap();

        await expect(titular).toHaveURL(/\/titular\/reservas\/[0-9a-f-]{36}$/);
        const detail = titular.locator('.lx-booking__facts');
        for (const fact of ['Uso próprio · Direito de Uso', 'Confirmada', '1 noite'])
          await expect(detail).toContainText(fact);
        await gate(titular, errors, 'w12-11-co-owner-confirmada');

        await titular.goto('/titular');
        await titular
          .locator('section[aria-labelledby="titular-own-use"]')
          .getByRole('link', { name: new RegExp(label) })
          .tap();
        await expect(rightsRow(bucket)).toContainText(available(Number(after)));
        expect(await rightsRow(other).textContent()).toBe(otherBefore);
        for (
          let month = 0;
          month < 14 && (await titular.locator(`[data-date="${night}"]`).count()) === 0;
          month += 1
        )
          await next.tap();
        await expect(titular.locator(`[data-date="${night}"]`).locator('..')).toHaveAttribute(
          'data-state',
          'mine',
        );
        await titular.locator(`[data-date="${night}"]`).tap({ force: true });
        await expect(titular.locator('.lx-calendar__selection [role="status"]')).toHaveText(
          `Reserva desta Ação · Uso próprio · Direito de Uso · entrada ${dayMonth(night)}, saída ${dayMonth(addDays(night, 1))} (1 noite) · Confirmada.`,
        );
        await titular.getByLabel('Entrada', { exact: true }).fill(night);
        await titular.getByLabel('Saída', { exact: true }).fill(addDays(night, 1));
        await expect(titular.locator('.lx-booking__issues')).toContainText(
          `Já há reserva desta Ação em ${dayMonth(night)}.`,
        );
        await gate(titular, errors, 'w12-12-co-owner-saldo-atualizado');
      } finally {
        await setE2eOwnUseBooking(false);
      }
    } finally {
      await context.close();
    }
  });

  test('[TECH-052] quem não representa a holding recebe 404 no calendário dela', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const { acquirer } = await formalizedOwner(
      page,
      `Second Home sintética Isolada ${randomUUID().slice(0, 6)}`,
    );
    const owner = await titularFor(page, browser, acquirer);
    await owner.titular.getByRole('link', { name: /Second Home sintética Isolada/ }).tap();
    await expect(owner.titular).toHaveURL(/\/titular\/calendario\//);
    const calendarUrl = owner.titular.url();
    await owner.context.close();
    const stranger = (await post(page, '/v1/admin/parties', { document: randomCpf() })).id;
    const other = await titularFor(page, browser, stranger);
    try {
      const response = await other.titular.goto(calendarUrl);
      expect(response?.status()).toBe(404);
      await expect(
        other.titular.getByRole('heading', { level: 2, name: 'Uso próprio' }),
      ).toHaveCount(0);
    } finally {
      await other.context.close();
    }
  });
  test('[REQ-037][PD-002][INV-1][REQ-097][ADR-0026] Owner com as reservas ligadas só nesta base: confirma, revalida, notifica e volta a fechar', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const label = `Second Home sintética Confirmação ${randomUUID().slice(0, 6)}`;
    const { acquirer } = await formalizedOwner(page, label);
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    const openCalendar = async () => {
      await titular.goto('/titular');
      await titular
        .locator('section[aria-labelledby="titular-own-use"]')
        .getByRole('link', { name: new RegExp(label) })
        .tap();
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Reservar uso próprio');
    };
    const checkin = addDays(civilToday(), 3);
    const checkout = addDays(checkin, 2);
    const summary = titular.locator('.lx-booking__status');
    const selection = titular.locator('.lx-calendar__selection [role="status"]');
    try {
      await setE2eOwnUseBooking(true);
      try {
        await openCalendar();
        await expect(titular.locator('.lx-booking__closed')).toHaveCount(0);
        await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
        await titular.getByLabel('Saída', { exact: true }).fill(checkout);
        await expect(summary).toHaveText('Período disponível.');
        await titular.getByRole('button', { name: 'Confirmar reserva' }).tap();

        // Confirmada pelo command real (TECH-054): página da reserva com tipo e situação persistidos.
        await expect(titular).toHaveURL(/\/titular\/reservas\/[0-9a-f-]{36}$/);
        await expect(titular.getByRole('heading', { level: 1 })).toHaveText('Reserva');
        const detail = titular.locator('.lx-booking__facts');
        for (const fact of ['Uso próprio', 'Confirmada', '2 noites'])
          await expect(detail).toContainText(fact);
        await gate(titular, errors, 'w12-03-owner-confirmada');

        // Notificação à party que reservou, pelo consumidor real do outbox (REQ-097).
        await job(page, 'outbox');
        await titular.goto('/titular/notificacoes');
        await expect(titular.getByText(new RegExp(`Reserva confirmada em ${label}`))).toBeVisible();
        await gate(titular, errors, 'w12-07-owner-notificacao');
        await titular.goto('/titular/reservas');
        await expect(titular.getByRole('list', { name: 'Reservas' })).toContainText('Uso próprio');
        await expect(titular.getByRole('list', { name: 'Reservas' })).toContainText('Confirmada');
        await gate(titular, errors, 'w12-10-owner-reservas-com-item');

        // Calendário revalidado: as noites são reserva do Owner (detalhe por toque) e a prévia aponta a causa.
        await openCalendar();
        if ((await titular.locator(`[data-date="${checkin}"]`).count()) === 0)
          await titular.getByRole('button', { name: 'Próximo mês' }).tap();
        await expect(titular.locator(`[data-date="${checkin}"]`).locator('..')).toHaveAttribute(
          'data-state',
          'mine',
        );
        // Noite da própria reserva: `aria-disabled` (não selecionável como entrada), mas o toque explica a reserva.
        await titular.locator(`[data-date="${checkin}"]`).tap({ force: true });
        await expect(selection).toHaveText(
          `Reserva do Owner · Uso próprio · entrada ${dayMonth(checkin)}, saída ${dayMonth(checkout)} (2 noites) · Confirmada.`,
        );
        await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
        await titular.getByLabel('Saída', { exact: true }).fill(checkout);
        await expect(summary).toHaveText('Não é possível reservar este período.');
        await expect(titular.locator('.lx-booking__issues')).toContainText(
          `Já há reserva do Owner em ${dayMonth(checkin)} e ${dayMonth(addDays(checkin, 1))}.`,
        );
        await gate(titular, errors, 'w12-08-owner-reserva-propria');
      } finally {
        await setE2eOwnUseBooking(false);
      }

      // Ativação desligada: a mesma página, recarregada, informa e não oferece confirmação.
      await titular.reload();
      await expect(titular.locator('.lx-booking__closed')).toContainText(
        'Novas reservas de uso próprio ainda não estão abertas.',
      );
      await expect(titular.getByRole('button', { name: 'Confirmar reserva' })).toHaveCount(0);
      await gate(titular, errors, 'w12-09-owner-fechado-de-novo');
    } finally {
      await context.close();
    }
  });
});
