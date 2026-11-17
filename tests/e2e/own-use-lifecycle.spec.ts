import { expect, test, type Page } from '@playwright/test';
import {
  authorizeE2eBookingAction,
  countReadE2eNotifications,
  seedE2eNotifications,
  seedE2eSoonCoOwnerBooking,
  seedE2eStartedOwnerBooking,
  setE2eOwnUseBooking,
  setE2eOwnUseLifecycle,
} from '../support/e2e-acquisition-database.mjs';
import { NOTIFICATION_VARIANTS } from '../support/own-use-notification-variants';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedCoOwner,
  formalizedOwner,
  job,
  MOBILE,
  titularFor,
} from './support/own-use';
import {
  captureForReview,
  collectConsoleErrors,
  expectResponsive,
  expectSharedComponentFixes,
} from './support/ui';

// W13 E4b (spec booking §10.15; referência visual E4a v2.1): o ciclo da reserva pelas telas reais, com o PostgreSQL
// real e os commands da E2. K1 e K2 ligadas só neste banco descartável e desligadas no fim; a autorização independente
// vem do papel autorizador real (`app.authorize_booking_action`). Em série: a ativação é estado global do banco.
test.describe.configure({ mode: 'serial' });

const BOOKING_PATH = /\/titular\/reservas\/([0-9a-f-]{36})(\?.*)?$/;
const REQUEST_PATH = /solicitacao=([0-9a-f-]{36})/;

async function gate(page: Page, errors: readonly string[], name: string) {
  await expectResponsive(page, errors);
  await expectSharedComponentFixes(page);
  await captureForReview(page, name, { fromTop: true });
}

/** Reserva pela tela da W12 (calendário → prévia do servidor → confirmação); devolve o id da página da reserva. */
async function bookOwnUse(titular: Page, label: string, checkin: string, checkout: string) {
  await titular.goto('/titular');
  await titular
    .locator('section[aria-labelledby="titular-own-use"]')
    .getByRole('link', { name: new RegExp(label) })
    .tap();
  await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
  await titular.getByLabel('Saída', { exact: true }).fill(checkout);
  await expect(titular.locator('.lx-booking__status')).toHaveText('Período disponível.');
  await titular.getByRole('button', { name: 'Confirmar reserva' }).tap();
  await expect(titular).toHaveURL(BOOKING_PATH);
  return BOOKING_PATH.exec(titular.url())![1]!;
}

/** Solicitação pela tela do Admin; devolve o id opaco mostrado depois do registro. */
async function requestAuthorization(page: Page, bookingId: string, purpose: string) {
  await page.goto(`/admin/reservas/${bookingId}/autorizacao`);
  await page.getByRole('radio', { name: new RegExp(purpose) }).check();
  await page.getByLabel('Base registrada').fill('TCK-2026-0042');
  await page.getByRole('button', { name: 'Registrar solicitação' }).click();
  await expect(page).toHaveURL(REQUEST_PATH);
  await expect(
    page.getByRole('status').filter({ hasText: 'Solicitação registrada' }),
  ).toBeVisible();
  return REQUEST_PATH.exec(page.url())![1]!;
}

test.describe('W13 E4b — ciclo da reserva de uso próprio pelas telas reais', () => {
  // Admin e Titular a 390 px com toque (fluxo principal no celular, ADR-0009); as capturas cobrem 390 e 1440 px.
  test.use(MOBILE);
  test('[REQ-081][D7][REQ-084][TECH-046][REQ-097][G-E4-1] Owner: cancelamento com termos alterados sem efeito; apuração e invalidação; no-show com autorização independente; avisos', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS * 2);
    const label = `Second Home sintética Ciclo ${Date.now().toString(36)}`;
    // Início da operação três dias atrás: noites já começadas existem para a estadia em curso do no-show.
    const { home, acquirer } = await formalizedOwner(page, label, addDays(civilToday(), -3));
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    const adminErrors = collectConsoleErrors(page);
    try {
      await setE2eOwnUseBooking(true);
      await setE2eOwnUseLifecycle(true);
      const first = await bookOwnUse(
        titular,
        label,
        addDays(civilToday(), 5),
        addDays(civilToday(), 7),
      );
      const second = await bookOwnUse(
        titular,
        label,
        addDays(civilToday(), 10),
        addDays(civilToday(), 12),
      );

      // Detalhe: imóvel, situação, período e noites no cabeçalho; ação contextual de cancelamento.
      await titular.goto(`/titular/reservas/${first}`);
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText(label);
      await expect(titular.locator('.lx-page-header__lead')).toContainText('Confirmada');
      await gate(titular, errors, 'e4b-01-owner-detalhe');
      await titular.getByRole('link', { name: 'Ver condições de cancelamento' }).tap();

      // Prévia pela consequência (Owner: sem prazo de 15 dias, categorias ou Direito de Uso).
      await expect(
        titular.getByRole('heading', {
          level: 2,
          name: 'As 2 noites voltam ao calendário do Owner',
        }),
      ).toBeVisible();
      await expect(titular.locator('main')).not.toContainText(
        /prazo de 15 dias|Direito de Uso|Alta\/Super Alta/,
      );
      await gate(titular, errors, 'e4b-02-owner-previa');

      // Termos alterados (D7): a confirmação com termos diferentes é recusada sem efeito e nada fica acionável.
      await titular
        .locator('input[name="expected_first_affected_date"]')
        .evaluate(
          (input: HTMLInputElement, date) => (input.value = date),
          addDays(civilToday(), 6),
        );
      await titular.getByRole('button', { name: 'Confirmar cancelamento' }).tap();
      await expect(titular).toHaveURL(/condicoes=mudaram/);
      // O anúncio de rota do App Router também é `role="alert"`: filtra pelo texto da recusa.
      await expect(
        titular.getByRole('alert').filter({ hasText: 'As condições mudaram. Nada foi cancelado.' }),
      ).toBeVisible();
      await expect(titular.getByRole('button', { name: 'Confirmar cancelamento' })).toHaveCount(0);
      await gate(titular, errors, 'e4b-03-termos-alterados');
      await titular.getByRole('link', { name: 'Revisar as novas condições' }).tap();
      await titular.getByRole('button', { name: 'Confirmar cancelamento' }).tap();
      await expect(titular).toHaveURL(/cancelada=1/);
      await expect(
        titular.getByRole('status').filter({ hasText: 'Reserva cancelada' }),
      ).toBeVisible();
      await expect(titular.locator('.lx-page-header__lead')).toContainText('Cancelada');
      await gate(titular, errors, 'e4b-04-owner-cancelada');

      // Admin: abrir apuração — erro da base registrada associado ao campo (M1: regra atual), depois corrigido.
      await page.goto(`/admin/reservas/${second}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
      await gate(page, adminErrors, 'e4b-10-admin-detalhe');
      await page.getByRole('link', { name: 'Abrir exceção' }).click();
      await page.getByRole('radio', { name: /Apuração de reserva não reconhecida/ }).check();
      await page.getByLabel('Referência do incidente (apuração)').fill('INC-2026-0007');
      await page.getByLabel('Base registrada').fill('42135557890');
      await page.getByRole('button', { name: 'Abrir exceção' }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Revise o campo indicado' }),
      ).toBeVisible();
      await expect(page.getByLabel('Base registrada')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#basis-erro')).toContainText('10 ou mais dígitos seguidos');
      await gate(page, adminErrors, 'e4b-11-admin-abrir-excecao-erro');
      await page.getByLabel('Base registrada').fill('TCK-2026-0042');
      await page.getByRole('button', { name: 'Abrir exceção' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Exceção aberta. O Titular recebe um aviso.' }),
      ).toBeVisible();

      // Titular: apuração do Owner — pode cancelar a qualquer momento (matriz REQ-084), prévia acionável.
      await titular.goto(`/titular/reservas/${second}`);
      await expect(titular.locator('.lx-page-header__lead')).toContainText('Em apuração');
      await expect(titular.locator('main')).toContainText(
        'O Owner pode cancelar a qualquer momento',
      );
      await titular.getByRole('link', { name: 'Ver condições de cancelamento' }).tap();
      await expect(titular.getByRole('button', { name: 'Confirmar cancelamento' })).toBeVisible();
      await gate(titular, errors, 'e4b-05-owner-apuracao');

      // Solicitação (G-E4-1, limitador fake) → autorização pelo papel autorizador → resolução com cancelamento.
      const request = await requestAuthorization(page, second, 'Invalidação');
      await gate(page, adminErrors, 'e4b-12-admin-solicitacao-registrada');
      await authorizeE2eBookingAction(request);
      await page.goto(`/admin/reservas/${second}/resolucao`);
      await expect(page.locator('.lx-message--warning')).toHaveCount(0);
      await page.getByRole('radio', { name: /Cancelar a reserva/ }).check();
      await expect(
        page.getByRole('status').filter({ hasText: 'Usa a autorização de invalidação' }),
      ).toBeVisible();
      await page.getByRole('radio', { name: /Manter a reserva/ }).check();
      await expect(page.getByText(/Usa a autorização de invalidação/)).toHaveCount(0);
      await page.getByRole('radio', { name: /Cancelar a reserva/ }).check();
      await gate(page, adminErrors, 'e4b-13-admin-resolver-cancelar');
      await page.getByLabel('Base registrada').fill('INC-2026-0007-PARECER');
      await page.getByRole('button', { name: 'Registrar resolução' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Exceção resolvida.' }),
      ).toBeVisible();
      await expect(page.locator('.lx-page-header__lead')).toContainText('Cancelada');

      // No-show: estadia já começada (fixture histórico) → fila de comparecimento → autorização → declaração atestada.
      const started = await seedE2eStartedOwnerBooking(home);
      await page.goto('/admin/reservas');
      await expect(page.getByRole('list', { name: 'A verificar comparecimento' })).toContainText(
        label,
      );
      await gate(page, adminErrors, 'e4b-14-admin-filas');
      await page.goto(`/admin/reservas/${started.bookingId}/no-show`);
      await expect(page.getByText('Sem autorização válida para este ato')).toBeVisible();
      const noShow = await requestAuthorization(page, started.bookingId, 'No-show');
      await authorizeE2eBookingAction(noShow);
      await page.goto(`/admin/reservas/${started.bookingId}/no-show`);
      await expect(page.locator('#efeito')).toContainText('calendário do Owner');
      await page
        .getByLabel('Registro de não comparecimento', { exact: true })
        .fill('ADM-SERRA-2026-118');
      await page.getByRole('button', { name: 'Declarar no-show' }).click();
      await expect(page.locator('#attest-erro')).toContainText('Marque a atestação');
      await page.getByRole('checkbox').check();
      await gate(page, adminErrors, 'e4b-15-admin-no-show');
      await page.getByRole('button', { name: 'Declarar no-show' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'No-show registrado.' }),
      ).toBeVisible();
      await gate(page, adminErrors, 'e4b-16-admin-detalhe-no-show');

      // Avisos (REQ-097), pelo consumidor real do outbox: título curto + "O que mudou".
      await job(page, 'outbox');
      await titular.goto('/titular/notificacoes');
      for (const title of [
        'Reserva confirmada',
        'Reserva cancelada',
        'Reserva em apuração',
        'Reserva invalidada',
        'No-show registrado',
      ])
        await expect(
          titular.getByRole('listitem').filter({ hasText: title }).first(),
        ).toBeVisible();
      await expect(titular.locator('main')).not.toContainText(/party|INC-2026|TCK-2026|ADM-SERRA/);
      await gate(titular, errors, 'e4b-06-owner-avisos');
      await titular.goto('/titular/reservas');
      await expect(titular.getByRole('list', { name: 'Histórico' })).toContainText('Cancelada');
      await gate(titular, errors, 'e4b-07-owner-lista');
    } finally {
      await setE2eOwnUseLifecycle(false);
      await setE2eOwnUseBooking(false);
      await context.close();
    }
  });

  test('[REQ-080][PD-010][BR-284][EC-10][G-E4-1] Co-Owner: exceção operacional e cancelamento que a encerra; fora do prazo e recuperação de capacidade futura', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS * 2);
    const label = `Second Home sintética Ciclo Co ${Date.now().toString(36)}`;
    const { home, acquirers } = await formalizedCoOwner(page, label);
    const { titular, context } = await titularFor(page, browser, acquirers[0]);
    const errors = collectConsoleErrors(titular);
    const adminErrors = collectConsoleErrors(page);
    try {
      await setE2eOwnUseBooking(true);
      await setE2eOwnUseLifecycle(true);
      // Duas noites próximas (fixture dentro de 15 dias): uma para a exceção operacional, outra fora do prazo.
      const operational = await seedE2eSoonCoOwnerBooking(home, acquirers[0], 3);
      const late = await seedE2eSoonCoOwnerBooking(home, acquirers[0], 6);

      // Admin abre exceção operacional (sem efeito em noites, saldo ou custódia).
      await page.goto(`/admin/reservas/${operational.bookingId}/excecao`);
      await page.getByRole('radio', { name: /^Exceção operacional/ }).check();
      await page.getByRole('radio', { name: 'Manutenção emergencial' }).check();
      await page.getByLabel('Base registrada').fill('TCK-2026-0099');
      await page.getByRole('button', { name: 'Abrir exceção' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Exceção aberta.' })).toBeVisible();

      // Titular: aviso da exceção sem sugerir restituição; prévia fora do prazo; cancelar encerra a exceção.
      await titular.goto(`/titular/reservas/${operational.bookingId}`);
      await expect(titular.locator('main')).toContainText('Em exceção operacional desde');
      await expect(titular.locator('main')).toContainText(
        'a exceção não muda o que acontece com as noites',
      );
      await titular.getByRole('link', { name: 'Ver condições de cancelamento' }).tap();
      await expect(titular.locator('#consequencia')).toHaveText(
        /não volta ao Direito de Uso desta Ação/,
      );
      await expect(titular.locator('.lx-form')).toContainText('a exceção é encerrada');
      await gate(titular, errors, 'e4b-08-co-owner-excecao');
      await titular.getByRole('button', { name: 'Confirmar cancelamento' }).tap();
      await expect(
        titular.getByRole('status').filter({ hasText: 'Reserva cancelada' }),
      ).toBeVisible();
      await expect(titular.locator('.lx-page-header__lead')).toContainText(
        'Cancelada fora do prazo',
      );

      // Fora do prazo pelo Titular → capacidade futura recuperável → solicitação → autorização → recuperação.
      await titular.goto(`/titular/reservas/${late.bookingId}/cancelamento`);
      await expect(titular.locator('#consequencia')).toHaveText(
        'A noite não volta ao Direito de Uso desta Ação',
      );
      // Aviso fixo da prévia (sem região viva): o porquê da perda.
      await expect(titular.locator('.lx-message--warning')).toContainText(
        'O prazo de 15 dias terminou',
      );
      await gate(titular, errors, 'e4b-09-co-owner-fora-do-prazo');
      await titular.getByRole('button', { name: 'Confirmar cancelamento' }).tap();
      await expect(
        titular.getByRole('status').filter({ hasText: 'não voltou ao Direito de Uso desta Ação' }),
      ).toBeVisible();

      await page.goto('/admin/reservas');
      await expect(page.getByRole('list', { name: 'Capacidade futura recuperável' })).toContainText(
        label,
      );
      await page.goto(`/admin/reservas/${late.bookingId}/recuperacao`);
      await expect(page.getByText('Sem autorização válida para este ato')).toBeVisible();
      const request = await requestAuthorization(
        page,
        late.bookingId,
        'Recuperação de capacidade futura',
      );
      await authorizeE2eBookingAction(request);
      await page.goto(`/admin/reservas/${late.bookingId}/recuperacao`);
      await expect(page.locator('#efeito')).toHaveText('1 noite passa ao Inventário Luxtory');
      await page.getByLabel('Base registrada').fill('OPS-2026-0311');
      await gate(page, adminErrors, 'e4b-17-admin-recuperacao');
      await page.getByRole('button', { name: 'Recuperar noites' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Capacidade futura recuperada' }),
      ).toBeVisible();
      await expect(page.locator('main')).toContainText('Inventário Luxtory');

      await job(page, 'outbox');
      await titular.goto('/titular/notificacoes');
      await expect(
        titular.getByRole('listitem').filter({ hasText: 'Reserva em exceção operacional' }),
      ).toContainText('(horário da Second Home)');
      await expect(
        titular
          .getByRole('listitem')
          .filter({ hasText: 'A exceção foi encerrada com o cancelamento.' }),
      ).toHaveCount(1);
      await gate(titular, errors, 'e4b-10-co-owner-avisos');
    } finally {
      await setE2eOwnUseLifecycle(false);
      await setE2eOwnUseBooking(false);
      await context.close();
    }
  });

  test('[REQ-097][REQ-096] Avisos: as 19 variações do ciclo e a confirmação na central real, sem marcação de leitura', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const label = `Second Home sintética Avisos ${Date.now().toString(36)}`;
    const { home, acquirer } = await formalizedOwner(page, label, addDays(civilToday(), -3));
    // A representação vem antes do fixture: o ator da operação histórica é a representação ativa da party.
    const { titular, context } = await titularFor(page, browser, acquirer);
    const errors = collectConsoleErrors(titular);
    try {
      // Reserva real (link válido) e um evento entregue por variação, no formato do consumidor da E3 (só banco
      // descartável).
      const { bookingId } = await seedE2eStartedOwnerBooking(home);
      await seedE2eNotifications(
        acquirer,
        home,
        bookingId,
        NOTIFICATION_VARIANTS.map(([, kind, data]) => ({ kind, data })),
      );
      await titular.goto('/titular/notificacoes');
      const items = await titular
        .getByRole('list', { name: 'Notificações' })
        .locator('.lx-record-list__item')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            title: node.querySelector('.lx-record-list__title')?.textContent?.trim() ?? '',
            href: node.querySelector('a')?.getAttribute('href') ?? null,
            meta: Object.fromEntries(
              [...node.querySelectorAll('.lx-record-list__meta-item')].map((pair) => [
                pair.querySelector('dt')?.textContent?.trim() ?? '',
                pair.querySelector('dd')?.textContent?.trim() ?? '',
              ]),
            ),
          })),
        );
      // Cada variação aparece uma única vez, com título curto, Second Home, "O que mudou" e extras exatos, link para a
      // reserva, na ordem da central (mais recente primeiro).
      const positions = NOTIFICATION_VARIANTS.map(([name, , , title, what, extra]) => {
        const matches = items.flatMap((item, index) =>
          item.title === title &&
          item.meta['Second Home'] === label &&
          item.meta['O que mudou'] === what &&
          extra.every(([key, value]) => item.meta[key] === value)
            ? [index]
            : [],
        );
        expect(matches, name).toHaveLength(1);
        expect(items[matches[0]!]!.href, name).toBe(`/titular/reservas/${bookingId}`);
        return matches[0]!;
      });
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      await expect(titular.locator('main')).not.toContainText(/party|\bcota|di[aá]ria/i);
      // Central só leitura: abrir a lista não marca nenhum aviso como lido.
      expect(await countReadE2eNotifications(acquirer)).toBe(0);
      await gate(titular, errors, 'e4b-18-avisos-variacoes');

      // O link do aviso abre a reserva certa.
      await titular
        .getByRole('list', { name: 'Notificações' })
        .getByRole('link', { name: 'Reserva confirmada' })
        .first()
        .tap();
      await expect(titular).toHaveURL(`/titular/reservas/${bookingId}`);
      await expect(titular.getByRole('heading', { level: 1 })).toHaveText(label);
    } finally {
      await context.close();
    }
  });
});
