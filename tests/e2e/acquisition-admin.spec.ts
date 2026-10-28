import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { registerE2eInstitution } from '../support/e2e-acquisition-database.mjs';
import { completeE2eInitialDraw, e2eCronSecret } from '../support/e2e-initial-draw';
import { randomCpf, validCnpj } from '../support/documents';
import { partialAcquisitionScenario } from '../support/acquisition-scenario';
import { signIn, STAFF_EMAIL, TEST_CODE } from './support/auth';
import { readSeed } from './support/discovery';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';
const FLOW_TIMEOUT_MS = 300_000;
const closedNotice = 'Os novos registros estão indisponíveis neste ambiente.';
const gateMode = process['env']['E2E_ACQUISITION_GATE'];
if (gateMode !== undefined && gateMode !== 'closed')
  throw new Error('E2E_ACQUISITION_GATE must be absent or closed');
const closedMode = gateMode === 'closed';
async function assertGateMode(page: Page, closed: boolean, timeout?: number) {
  await expect(page.getByText(closedNotice, { exact: false })).toHaveCount(closed ? 1 : 0, {
    timeout,
  });
}
const day = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const cnpj = () => validCnpj(randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase());
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data,
  });
  expect(response.status(), path).toBe(201);
  return (await response.json()) as { id: string };
}
async function secondHome(page: Page, label: string) {
  return (
    await post(page, '/v1/admin/second-homes', {
      home_edition_id: readSeed().withHomeEdition.homeEdition.id,
      label,
      timezone: 'America/Sao_Paulo',
    })
  ).id;
}
async function party(page: Page, document = randomCpf()) {
  return (await post(page, '/v1/admin/parties', { document })).id;
}
const entry = (id: string) => `/admin/catalogo/second-homes/${id}/formalizacao`;
const section = (page: Page, id: string) => page.locator(`#${id}`).locator('..');
async function saved(page: Page) {
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  await expect(page.locator('#registered')).toBeFocused();
}
async function gate(page: Page, errors: readonly string[], name: string) {
  await expectResponsive(page, errors);
  await captureForReview(page, name, { fromTop: true });
}
async function enter(page: Page, label: string) {
  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);
  const id = await secondHome(page, label);
  await page.goto(entry(id));
  return id;
}

test.describe('W8 Admin 390 px com toque e PostgreSQL real', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
  });
  test('[REQ-024] [REQ-022] Owner: confirmação, base congelada, recusa de mudança e início único', async ({
    page,
  }) => {
    test.skip(closedMode, 'Open acquisition gate variant not selected');
    test.setTimeout(FLOW_TIMEOUT_MS);
    const operationDate = day();
    const errors = collectConsoleErrors(page);
    const home = await enter(page, 'Second Home sintética Owner');
    await assertGateMode(page, false);
    await expect(assertGateMode(page, true, 300)).rejects.toThrow();
    const acquirer = await party(page);
    await page.goto(`/admin/catalogo/second-homes/${home}`);
    await page.getByRole('link', { name: 'Formalização e operação' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Formalização e base civil');
    await page.goto(`${entry(home)}?registered=${randomUUID()}`);
    await expect(page.locator('#registered')).toHaveCount(0);
    await gate(page, errors, '01-owner-antes');
    const form = section(page, 'formalize-form');
    await form.getByLabel('Localização concreta').fill('Localização sintética · Pátio 01');
    await form.getByLabel('Data de início da operação (base civil)').fill(operationDate);
    await form.getByLabel('Modalidade', { exact: true }).selectOption('owner');
    await form.getByLabel('Adquirente 1', { exact: true }).selectOption(acquirer);
    await form.getByLabel('Referência da base registrada').fill('Ato sintético Owner');
    await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
    await expect(form.getByRole('checkbox')).toBeFocused();
    await expect(form.getByText('Confirme esta declaração para continuar.')).toBeVisible();
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
    await saved(page);
    await expect(page.getByText('Titularidade integral Owner registrada.')).toBeVisible();
    await expect(page.getByLabel('Localização concreta')).toHaveCount(0);
    await gate(page, errors, '02-owner-formalizado');
    const start = section(page, 'operation-start-form');
    await start.getByLabel('Data efetiva de início').fill('2020-01-01');
    await start.getByLabel('Referência da base registrada').fill('Declaração sintética Owner');
    await start.getByRole('checkbox').check();
    await start.getByRole('button', { name: 'Declarar início da operação' }).tap();
    await expect(start.getByRole('alert')).toContainText(
      'O estado atual não permite este registro.',
    );
    await expect(start.getByRole('alert')).toBeFocused();
    await expect(start.getByLabel('Data efetiva de início')).toHaveValue('2020-01-01');
    await start.getByLabel('Data efetiva de início').fill(operationDate);
    await start.getByRole('button', { name: 'Declarar início da operação' }).focus();
    await page.keyboard.press('Enter');
    await saved(page);
    await expect(
      page.getByRole('heading', { name: 'Início da operação registrado', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Declarar início da operação' })).toHaveCount(0);
    await gate(page, errors, '03-owner-inicio');
  });

  test.describe.serial('Co-Owner parcial — formalização e administração', () => {
    test.skip(closedMode, 'Open acquisition gate variant not selected');
    let fixture: {
      home: string;
      institution: string;
      acquirers: readonly [string, string];
      spe: string;
      provider: string;
      scenario: ReturnType<typeof partialAcquisitionScenario>;
    };
    test.beforeAll(async ({ browser }) => {
      const baseURL = test.info().project.use.baseURL;
      if (typeof baseURL !== 'string') throw new Error('Missing configured E2E origin');
      const page = await browser.newPage({ baseURL });
      try {
        const home = await enter(page, 'Second Home sintética Co-Owner');
        const institution = await party(page, cnpj());
        await registerE2eInstitution(institution);
        fixture = {
          home,
          institution,
          acquirers: [await party(page), await party(page)],
          spe: await party(page, cnpj()),
          provider: await party(page, cnpj()),
          scenario: partialAcquisitionScenario(new Date()),
        };
      } finally {
        await page.close();
      }
    });

    async function openScenario(page: Page) {
      await signIn(page, STAFF_EMAIL);
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto(entry(fixture.home));
      await assertGateMode(page, false);
    }
    test('[REQ-025] [REQ-026] [BR-071] [BR-081] alocação explícita, capacidade, SPE e grants', async ({
      page,
    }) => {
      test.setTimeout(FLOW_TIMEOUT_MS);
      const errors = collectConsoleErrors(page);
      await openScenario(page);
      const { scenario, spe, acquirers } = fixture;
      const operationDate = scenario.operationDate;
      const allocation = section(page, 'initial-allocation-form');
      await allocation.locator('summary').tap();
      await allocation.getByLabel('Configuração Co-Owner').selectOption('2');
      await allocation.getByLabel('Data de início da operação (base civil)').fill(operationDate);
      await allocation
        .getByLabel('Referência da base registrada')
        .fill('Alocação sintética parcial v1');
      await allocation.getByRole('button', { name: 'Registrar alocação inicial' }).tap();
      await expect(allocation.getByLabel('Alta por Ação')).toBeFocused();
      await expect(allocation.getByLabel('Alta por Ação')).toHaveValue('');
      for (const [label, value] of [
        ['Alta por Ação', '48'],
        ['Média por Ação', '128'],
        ['Alta Luxtory', '7'],
        ['Média Luxtory', '6'],
      ] as const)
        await allocation.getByLabel(label).fill(value);
      await allocation.getByRole('button', { name: 'Registrar alocação inicial' }).tap();
      await expect(allocation.getByRole('alert')).toContainText(
        'Nenhuma quantidade foi recalculada ou redistribuída.',
      );
      await expect(allocation.getByLabel('Alta por Ação')).toHaveValue('48');
      await gate(page, errors, '04-parcial-capacidade-recusada');
      for (const [label, value] of [
        ['Alta por Ação', String(scenario.alta)],
        ['Média por Ação', String(scenario.media)],
        ['Alta Luxtory', '0'],
        ['Média Luxtory', '0'],
      ] as const)
        await allocation.getByLabel(label).fill(value);
      await allocation.getByRole('button', { name: 'Registrar alocação inicial' }).tap();
      await saved(page);
      await expect(page.getByText('Alocação · versão 1', { exact: true })).toBeVisible();
      const form = section(page, 'formalize-form');
      await form.getByLabel('Localização concreta').fill('Localização sintética · Serra 02');
      await form.getByLabel('Data de início da operação (base civil)').fill(operationDate);
      await form.getByLabel('Modalidade', { exact: true }).selectOption('co_owner');
      await form.getByLabel('Configuração Co-Owner').selectOption('2');
      await form.getByLabel('Pessoa jurídica da SPE').selectOption(spe);
      await form.getByLabel('Alocação inicial registrada').selectOption({ index: 1 });
      const allocationId = await form.getByLabel('Alocação inicial registrada').inputValue();
      for (const [i, id] of acquirers.entries())
        await form.getByLabel(`Adquirente ${i + 1}`, { exact: true }).selectOption(id);
      await form.getByLabel('Referência da base registrada').fill('Ato sintético Co-Owner');
      await form.getByRole('checkbox').check();
      await form.getByLabel('Adquirente 2', { exact: true }).selectOption(acquirers[0]);
      await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
      await expect(form.getByText('Selecione uma pessoa diferente para cada Ação.')).toBeVisible();
      await expect(form.getByLabel('Adquirente 1', { exact: true })).toBeFocused();
      await expect(form.getByLabel('Modalidade', { exact: true })).toHaveValue('co_owner');
      await expect(form.getByLabel('Configuração Co-Owner')).toHaveValue('2');
      await expect(form.getByLabel('Pessoa jurídica da SPE')).toHaveValue(spe);
      await expect(form.getByLabel('Adquirente 1', { exact: true })).toHaveValue(acquirers[0]);
      await expect(form.getByLabel('Adquirente 2', { exact: true })).toHaveValue(acquirers[0]);
      await expect(form.getByLabel('Alocação inicial registrada')).toHaveValue(allocationId);
      await expect(form.getByLabel('Data de início da operação (base civil)')).toHaveValue(
        operationDate,
      );
      await expect(form.getByLabel('Localização concreta')).toHaveValue(
        'Localização sintética · Serra 02',
      );
      await expect(form.getByLabel('Referência da base registrada')).toHaveValue(
        'Ato sintético Co-Owner',
      );
      await expect(form.getByRole('checkbox')).toBeChecked();
      await form.getByLabel('Adquirente 2', { exact: true }).selectOption(acquirers[1]);
      await gate(page, errors, '05-parcial-pronto');
      await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
      await saved(page);
      await expect(page.getByText('Direitos de Uso iniciais', { exact: true })).toBeVisible();
      await expect(page.getByText(new RegExp(`Posição 1 .* alta: ${scenario.alta}`))).toBeVisible();
      await expect(
        page.getByText(new RegExp(`Posição 2 .* média: ${scenario.media}`)),
      ).toBeVisible();
      await gate(page, errors, '06-co-owner-formalizado');
    });

    test('[BR-077] [TECH-020] cobertura finita, recusa de início, substituição e histórico', async ({
      page,
    }) => {
      test.setTimeout(FLOW_TIMEOUT_MS);
      const errors = collectConsoleErrors(page);
      await openScenario(page);
      const { institution, provider } = fixture;
      const operationDate = fixture.scenario.operationDate;
      // Re-open referenced providers through the authorized lookup even if other tests filled the recent directory.
      for (const id of [provider, institution]) {
        await page.getByLabel('Identificador de outra pessoa ou empresa').fill(id);
        const lookup = page.getByRole('button', { name: 'Carregar pessoa pelo identificador' });
        await lookup.tap();
        await expect(lookup).toBeEnabled();
        await expect(
          page.getByText('Cadastro carregado. Agora ele pode ser selecionado.', { exact: true }),
        ).toBeVisible();
        await expect(
          page.locator(`#administration-provider_party_id option[value="${id}"]`),
        ).toHaveCount(1);
      }
      const admin = section(page, 'administration-form');
      await admin.locator('summary').tap();
      await admin.getByLabel('Prestador existente').selectOption(provider);
      await admin.getByLabel('Escopo', { exact: true }).selectOption('professional_administration');
      await admin.getByRole('checkbox').check();
      await admin.getByLabel('Início da vigência', { exact: true }).fill(operationDate);
      await admin.getByLabel('Termo final', { exact: true }).selectOption('defined');
      await admin
        .getByLabel('Fim da vigência (exclusivo)')
        .fill(`${Number(operationDate.slice(0, 4)) + 1}-01-01`);
      await admin
        .getByLabel('Referência da base registrada')
        .fill('Contrato sintético com termo final');
      await admin.getByLabel('Fim da vigência (exclusivo)').fill(operationDate);
      await admin.getByRole('button', { name: 'Registrar administração' }).tap();
      await expect(
        admin.getByText('O fim da vigência deve ser posterior ao início.'),
      ).toBeVisible();
      await expect(admin.getByLabel('Fim da vigência (exclusivo)')).toBeFocused();
      await expect(admin.getByLabel('Prestador existente')).toHaveValue(provider);
      await expect(admin.getByLabel('Escopo', { exact: true })).toHaveValue(
        'professional_administration',
      );
      await expect(admin.getByLabel('Termo final', { exact: true })).toHaveValue('defined');
      await expect(admin.getByLabel('Início da vigência', { exact: true })).toHaveValue(
        operationDate,
      );
      await expect(admin.getByLabel('Fim da vigência (exclusivo)')).toHaveValue(operationDate);
      await expect(admin.getByLabel('Referência da base registrada')).toHaveValue(
        'Contrato sintético com termo final',
      );
      await expect(admin.getByRole('checkbox')).toBeChecked();
      await admin
        .getByLabel('Fim da vigência (exclusivo)')
        .fill(`${Number(operationDate.slice(0, 4)) + 1}-01-01`);
      await gate(page, errors, '07-administracao-finita');
      await admin.getByRole('button', { name: 'Registrar administração' }).tap();
      await saved(page);
      const start = section(page, 'operation-start-form');
      await start.getByLabel('Data efetiva de início').fill(operationDate);
      await start.getByLabel('Referência da base registrada').fill('Declaração sintética Co-Owner');
      await start.getByRole('checkbox').check();
      await start.getByRole('button', { name: 'Declarar início da operação' }).tap();
      await expect(start.getByRole('alert')).toContainText(
        'A cobertura Co-Owner precisa sustentar toda a operação.',
      );
      await gate(page, errors, '08-inicio-cobertura-insuficiente');
      if ((await admin.locator('details').getAttribute('open')) === null)
        await admin.locator('summary').tap();
      await admin.getByLabel('Prestador existente').selectOption(institution);
      await admin.getByLabel('Escopo', { exact: true }).selectOption('full_luxtory_administration');
      await admin.getByRole('checkbox').check();
      await admin.getByLabel('Início da vigência', { exact: true }).fill(operationDate);
      await admin.getByLabel('Termo final', { exact: true }).selectOption('none');
      await admin.getByLabel('Cobertura a substituir').selectOption({ index: 1 });
      await admin
        .getByLabel('Referência da base registrada')
        .fill('Contrato sintético sem termo final real');
      await admin.getByRole('button', { name: 'Registrar administração' }).tap();
      await saved(page);
      await expect(
        page.getByText('Contrato sintético com termo final', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Contrato sintético sem termo final real', { exact: true }),
      ).toBeVisible();
      await start.getByLabel('Data efetiva de início').fill(operationDate);
      await start.getByLabel('Referência da base registrada').fill('Declaração sintética Co-Owner');
      await start.getByRole('checkbox').check();
      await start.getByRole('button', { name: 'Declarar início da operação' }).tap();
      await saved(page);
      await gate(page, errors, '09-co-owner-inicio-historico');
    });

    // W9 (spec ownership §16.7, AC1): a formalização Co-Owner acima agendou o sorteio; o job outbox real grava o
    // compromisso. O estado concluído liga uma rodada quicknet real gravada (fixture só do E2E).
    test('[PD-011] Admin e Titular veem a evidência do sorteio inicial em 390 px com toque', async ({
      page,
      browser,
    }) => {
      test.setTimeout(FLOW_TIMEOUT_MS);
      const errors = collectConsoleErrors(page);
      await openScenario(page);
      const job = await page.request.get('/api/jobs/outbox', {
        headers: { authorization: `Bearer ${e2eCronSecret()}` },
      });
      expect(job.status(), await job.text()).toBe(200);
      await page.reload();
      const draw = section(page, 'initial-draw');
      await expect(draw.getByRole('status')).toContainText('Compromisso registrado');
      await expect(draw.getByText('drand quicknet', { exact: true })).toBeVisible();
      for (const label of ['Ação 1', 'Ação 2'])
        await expect(draw.getByText(label, { exact: true })).toBeVisible();
      await expect(draw.getByText('Seed', { exact: true })).toHaveCount(0);
      await gate(page, errors, '10-sorteio-pendente');

      await completeE2eInitialDraw(fixture.home);
      await page.reload();
      await expect(draw.getByRole('status')).toContainText('Sorteio concluído em');
      for (const label of ['1ª posição', '2ª posição', 'Seed', 'Randomness da rodada'])
        await expect(draw.getByText(label, { exact: true })).toBeVisible();
      await gate(page, errors, '11-sorteio-concluido');

      // Titular de uma das Ações: convite, ativação e evidência com só a própria Ação destacada.
      const email = `titular-sorteio-${randomUUID().slice(0, 8)}@luxtory.test`;
      const delegation = await page.request.post(
        `/v1/admin/parties/${fixture.acquirers[0]}/delegations`,
        {
          headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
          data: { email, basis: 'Contrato social E2E do sorteio' },
        },
      );
      expect(delegation.status(), await delegation.text()).toBe(201);
      const context = await browser.newContext({
        baseURL: new URL(page.url()).origin,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        timezoneId: 'America/Sao_Paulo',
        locale: 'pt-BR',
      });
      const titular = await context.newPage();
      const titularErrors = collectConsoleErrors(titular);
      try {
        await titular.goto('/titular/ativar');
        await titular.getByLabel('E-mail').fill(email);
        await titular.getByLabel('Código do convite').fill(TEST_CODE);
        await titular.getByRole('button', { name: 'Continuar' }).tap();
        await expect(titular).toHaveURL(/\/titular$/);
        await titular.getByRole('button', { name: 'Ativar representação' }).tap();
        await expect(titular.getByRole('status')).toContainText('Representação ativada.');
        await expect(
          titular.getByRole('heading', { level: 2, name: 'Sorteio da ordem inicial' }),
        ).toBeVisible();
        await gate(titular, titularErrors, '12-titular-sorteios');
        await titular.getByRole('link', { name: /Second Home sintética Co-Owner/ }).tap();
        await expect(titular.getByRole('heading', { level: 1 })).toHaveText(
          'Sorteio da ordem inicial',
        );
        await expect(titular.getByRole('status')).toContainText('Sorteio concluído em');
        // Sua Ação: uma vez entre os participantes e uma no resultado; nenhuma pessoa ou empresa exibida.
        await expect(titular.getByText('Sua Ação', { exact: true })).toHaveCount(2);
        await expect(titular.getByText(/CPF|CNPJ/)).toHaveCount(0);
        await gate(titular, titularErrors, '13-titular-evidencia');
      } finally {
        await context.close();
      }
    });
  });

  test('gate W8 fechado: catálogo e consulta independentes, mutations indisponíveis', async ({
    page,
  }) => {
    test.skip(!closedMode, 'Closed acquisition gate variant not selected');
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    const home = await enter(page, 'Second Home sintética · gate fechado');
    await assertGateMode(page, true);
    await expect(assertGateMode(page, false, 300)).rejects.toThrow();
    await expect(page.getByRole('button', { name: 'Formalizar aquisição' })).toHaveCount(0);
    await expect(page.getByText('Versão 1', { exact: true })).toBeVisible();
    const acquirer = await party(page);
    const response = await page.request.post('/v1/admin/acquisitions', {
      headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
      data: {
        second_home_id: home,
        modality: 'owner',
        location: 'Local sintético',
        operation_start_date: day(),
        acquirer_party_ids: [acquirer],
        basis_ref: 'Ato sintético fechado',
      },
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({
      code: 'ERR_UNAVAILABLE',
      message: expect.any(String),
      correlation_id: response.headers()['x-correlation-id'],
    });
    await gate(page, errors, '10-gate-fechado');
    await page.getByRole('link', { name: 'Voltar à Second Home', exact: true }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Second Home sintética · gate fechado',
    );
  });
});
