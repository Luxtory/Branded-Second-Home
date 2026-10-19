import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Interesse (W5, docs/specs/ownership.md): escrita pública pela API e visão agrupada no Admin, mobile-first com paridade
// (ADR-0009). O banco do E2E é compartilhado: cada teste usa uma região própria e não presume lista vazia.
const FLOW_TIMEOUT_MS = 300_000;
const unique = (prefix: string) =>
  `${prefix} ${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;

function postInterest(
  request: APIRequestContext,
  origin: string,
  body: Record<string, unknown>,
  key: string = randomUUID(),
) {
  return request.post('/v1/interests', {
    headers: { origin, 'idempotency-key': key },
    data: body,
  });
}

/** Três Co-Owner (14, 14 e 30 dias) e um Owner numa região própria do Concept público com Edition. */
async function seedInterests(request: APIRequestContext, origin: string, region: string) {
  const conceptId = readSeed().withEdition.id;
  const coOwner = { concept_id: conceptId, modality: 'co_owner', region };
  for (const body of [
    { ...coOwner, approx_days: 14 },
    { ...coOwner, approx_days: 14 },
    { ...coOwner, approx_days: 30 },
    { concept_id: conceptId, modality: 'owner', region },
  ]) {
    expect((await postInterest(request, origin, body)).status()).toBe(201);
  }
}

async function expectGroupedView(page: Page, region: string) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interesses');
  const concept = page.getByRole('region', { name: readSeed().withEdition.title });
  const item = concept.getByRole('listitem').filter({ hasText: region });
  await expect(item.getByRole('heading', { level: 3 })).toHaveText(region);
  await expect(item).toContainText('Owner1 interesse');
  await expect(item).toContainText('Co-Owner3 interesses');
  await expect(item).toContainText('Co-Owner · 14 dias2 interesses');
  await expect(item).toContainText('Co-Owner · 30 dias1 interesse');
}

test('[REQ-023] [REQ-022] [TECH-056] API pública: registra no Concept sem Edition, repete sem duplicar e recusa o não publicado', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  const seed = readSeed();
  const key = randomUUID();
  const body = {
    concept_id: seed.withoutEdition.id,
    modality: 'co_owner',
    region: unique('Serra E2E'),
    approx_days: 21,
    origin: 'Campanha E2E',
    partner_ref: 'Parceiro E2E',
  };

  const first = await postInterest(request, origin, body, key);
  expect(first.status()).toBe(201);
  expect(await first.json()).toEqual({ status: 'registered' });
  expect(first.headers()['idempotency-replayed']).toBeUndefined();
  expect(first.headers()['cache-control']).toBe('no-store');

  const replay = await postInterest(request, origin, body, key);
  expect(replay.status()).toBe(201);
  expect(replay.headers()['idempotency-replayed']).toBe('true');

  const conflict = await postInterest(request, origin, { ...body, approx_days: 30 }, key);
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ code: 'ERR_IDEMPOTENCY_CONFLICT' });

  const hidden = seed.hidden[0];
  expect(hidden).toBeDefined();
  const notPublic = await postInterest(request, origin, { ...body, concept_id: hidden?.id });
  expect(notPublic.status()).toBe(404);

  const ownerWithDays = await postInterest(request, origin, { ...body, modality: 'owner' });
  expect(ownerWithDays.status()).toBe(400);
  expect(await ownerWithDays.json()).toMatchObject({
    fields: [{ field: 'approx_days', code: 'not_allowed' }],
  });

  const foreign = await postInterest(request, 'https://atacante.test', body);
  expect(foreign.status()).toBe(403);
});

test.describe('celular (390 px, toque)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'pt-BR',
  });

  test('[REQ-025] [TECH-092] visão de interesses a 390 px com toque: Concept → região → modalidade com dias exatos; sem overflow e com axe 0', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const region = unique('Litoral E2E');
    await seedInterests(request, baseURL ?? '', region);
    const consoleErrors = collectConsoleErrors(page);

    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await page
      .getByRole('dialog', { name: 'Menu da administração' })
      .getByRole('link', { name: 'Interesses' })
      .tap();
    await expect(page).toHaveURL(/\/admin\/interesses$/);

    await expectGroupedView(page, region);
    await expectResponsive(page, consoleErrors);
  });
});

test.describe('desktop (1440 px)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });

  test('[REQ-025] visão de interesses a 1440 px: navegação do Admin, agrupamento e axe 0', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const region = unique('Serra E2E');
    await seedInterests(request, baseURL ?? '', region);
    const consoleErrors = collectConsoleErrors(page);

    await signIn(page, STAFF_EMAIL);
    await page
      .getByRole('banner')
      .getByRole('navigation', { name: 'Navegação da administração' })
      .getByRole('link', { name: 'Interesses' })
      .click();
    await expect(page).toHaveURL(/\/admin\/interesses$/);

    await expectGroupedView(page, region);
    await expectResponsive(page, consoleErrors);
  });
});
