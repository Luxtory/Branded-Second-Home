// Fluxos reais de preparação das reservas de uso próprio (W12, extraídos para reuso na W13 E4b): Admin formaliza, os
// jobs reais selam o exercício e o Titular ativa a representação num contexto móvel próprio.
import { randomUUID } from 'node:crypto';
import { expect, type Browser, type Page } from '@playwright/test';
import { partialAcquisitionScenario } from '../../support/acquisition-scenario';
import { ensureE2eInstitution } from '../../support/e2e-acquisition-database.mjs';
import { completeE2eInitialDraw, e2eCronSecret } from '../../support/e2e-initial-draw';
import { randomCpf, validCnpj } from '../../support/documents';
import { signIn, STAFF_EMAIL, TEST_CODE } from './auth';
import { readSeed } from './discovery';
import { captureForReview, expectResponsive } from './ui';

export const FLOW_TIMEOUT_MS = 300_000;
export const MOBILE = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  timezoneId: 'America/Sao_Paulo',
  locale: 'pt-BR',
} as const;
export const gateMode = process['env']['E2E_ACQUISITION_GATE'];
export const DAY_MS = 86_400_000;

export const civilToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@luxtory.test`;

export async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data,
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { id: string };
}

export async function job(page: Page, name: string) {
  const response = await page.request.get(`/api/jobs/${name}`, {
    headers: { authorization: `Bearer ${e2eCronSecret()}` },
  });
  expect(response.status(), `${name}: ${await response.text()}`).toBe(200);
}

export const section = (page: Page, id: string) => page.locator(`#${id}`).locator('..');

/** Owner formalizado com início da operação hoje, pela tela do Admin (contrato já provado na W8). */
export async function formalizedOwner(page: Page, label: string, startDate: string = civilToday()) {
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
  await form.getByLabel('Data de início da operação (base civil)').fill(startDate);
  await form.getByLabel('Modalidade', { exact: true }).selectOption('owner');
  await form.getByLabel('Adquirente 1', { exact: true }).selectOption(acquirer);
  await form.getByLabel('Referência da base registrada').fill('Ato sintético Owner W12');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Formalizar aquisição' }).tap();
  await expect(page.locator('#registered')).toContainText('Registro concluído.');
  const start = section(page, 'operation-start-form');
  await start.getByLabel('Data efetiva de início').fill(startDate);
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
export async function formalizedCoOwner(page: Page, label: string) {
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
export async function titularFor(page: Page, browser: Browser, partyId: string) {
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

export async function gate(page: Page, errors: readonly string[], name: string) {
  await expectResponsive(page, errors);
  await captureForReview(page, name, { fromTop: true });
}
