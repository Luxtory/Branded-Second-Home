import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Interesse (W5 corrigida na W4.2, docs/specs/ownership.md §13): escrita pública pela API a partir da Home Edition e
// visão agrupada no Admin, mobile-first com paridade (ADR-0009). O banco do E2E é compartilhado: cada teste usa uma
// localização pretendida própria e não presume lista vazia.
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

/** Três Co-Owner (14, 14 e 30 dias) e um Owner numa localização própria da Home Edition publicada. */
async function seedInterests(request: APIRequestContext, origin: string, location: string) {
  const homeEditionId = readSeed().withHomeEdition.homeEdition.id;
  const coOwner = {
    home_edition_id: homeEditionId,
    modality: 'co_owner',
    desired_location: location,
  };
  for (const body of [
    { ...coOwner, approx_days: 14 },
    { ...coOwner, approx_days: 14 },
    { ...coOwner, approx_days: 30 },
    { home_edition_id: homeEditionId, modality: 'owner', desired_location: location },
  ]) {
    expect((await postInterest(request, origin, body)).status()).toBe(201);
  }
}

async function expectGroupedView(page: Page, location: string) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interesses');
  const seed = readSeed();
  const homeEdition = page.getByRole('region', { name: seed.withHomeEdition.homeEdition.name });
  await expect(homeEdition).toContainText(seed.withHomeEdition.title);
  const item = homeEdition.getByRole('listitem').filter({ hasText: location });
  await expect(item.getByRole('heading', { level: 3 })).toHaveText(location);
  await expect(item).toContainText('Owner1 interesse');
  await expect(item).toContainText('Co-Owner3 interesses');
  await expect(item).toContainText('Co-Owner · 14 dias2 interesses');
  await expect(item).toContainText('Co-Owner · 30 dias1 interesse');
}

test('[REQ-023] [REQ-022] [BR-030] [TECH-056] API pública: registra na Home Edition publicada, repete sem duplicar e recusa o não publicado', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  const seed = readSeed();
  const key = randomUUID();
  const body = {
    home_edition_id: seed.secondBrand.homeEdition.id,
    modality: 'co_owner',
    desired_location: unique('Serra E2E'),
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

  // Em preparação ou finalizada fora do site: 404 (02 §15, item 15); Home Concept sozinho não é interesse (BR-030).
  for (const id of [
    seed.withHomeEdition.draftHomeEdition.id,
    seed.withoutHomeEdition.hiddenHomeEdition.id,
  ]) {
    expect((await postInterest(request, origin, { ...body, home_edition_id: id })).status()).toBe(
      404,
    );
  }
  const conceptOnly = await postInterest(request, origin, {
    home_concept_id: seed.withoutHomeEdition.id,
    modality: 'owner',
    desired_location: 'Serra',
  });
  expect(conceptOnly.status()).toBe(400);

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

  test('[REQ-025] [TECH-092] visão de interesses a 390 px com toque: Home Edition → localização pretendida → modalidade com dias exatos; sem overflow e com axe 0', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const location = unique('Litoral E2E');
    await seedInterests(request, baseURL ?? '', location);
    const consoleErrors = collectConsoleErrors(page);

    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('button', { name: 'Abrir menu' }).tap();
    await page
      .getByRole('dialog', { name: 'Menu da administração' })
      .getByRole('link', { name: 'Interesses' })
      .tap();
    await expect(page).toHaveURL(/\/admin\/interesses$/);

    await expectGroupedView(page, location);
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
    const location = unique('Serra E2E');
    await seedInterests(request, baseURL ?? '', location);
    const consoleErrors = collectConsoleErrors(page);

    await signIn(page, STAFF_EMAIL);
    await page
      .getByRole('banner')
      .getByRole('navigation', { name: 'Navegação da administração' })
      .getByRole('link', { name: 'Interesses' })
      .click();
    await expect(page).toHaveURL(/\/admin\/interesses$/);

    await expectGroupedView(page, location);
    await expectResponsive(page, consoleErrors);
  });
});
