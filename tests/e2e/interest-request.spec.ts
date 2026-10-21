import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Solicitação de conversa na página da Home Edition (W6, docs/specs/ownership.md §14; b2c.md D-B2C-28): formulário em
// 3 etapas na mesma seção, mobile-first com paridade (ADR-0009), pré-qualificação (faixa para iniciar, comparação com a
// média só para Owner com média, decisão e momento), estados de envio, Aviso de Privacidade e o Admin até contato e
// pré-qualificação. O banco do E2E é compartilhado: cada teste usa uma localização pretendida própria.
const FLOW_TIMEOUT_MS = 300_000;
const unique = (prefix: string) =>
  `${prefix} ${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;

const TEXT = {
  title: 'Solicite uma conversa sobre esta Home Edition',
  lead: 'Conte como você imagina sua Second Home. Com essas informações, podemos preparar uma conversa mais objetiva sobre esta Home Edition.',
  modality: 'Como você imagina ter sua Second Home?',
  location: 'Onde você imagina sua Second Home?',
  days: 'Quantos dias por ano, aproximadamente?',
  daysHint:
    'Para Co-Owner, os dias informados representam apenas uma preferência e não criam Direito de Uso.',
  band: 'Se decidir avançar, qual faixa de recursos você teria disponível para iniciar o investimento?',
  bandHint:
    'Essa referência nos ajuda a preparar uma conversa mais adequada ao seu momento. Não é uma proposta nem condição comercial.',
  referenceFit:
    /^Considerando a média projetada de R\$\s4\.800\.000 desta Home Edition, como ela se compara ao investimento total que você considera\?$/u,
  referenceNote:
    'Referência aproximada do investimento total projetado para materializar uma Second Home desta Home Edition. Não é preço, proposta ou condição comercial.',
  coOwnerNote:
    'No Co-Owner, o investimento individual depende da configuração da Second Home, definida pela Luxtory durante a estruturação. A média projetada da Home Edition não representa o valor de uma Ação.',
  decisionUnit: 'Quem participa dessa decisão com você?',
  horizon: 'Se encontrar uma opção que faça sentido, quando você estaria pronto para avançar?',
  notAcquisition: 'Manifestar interesse não é uma aquisição.',
  privacy:
    'Usaremos seus dados para responder à sua solicitação de conversa e conduzir a pré-qualificação comercial relacionada a esta Home Edition.',
  success: 'Recebemos sua solicitação de conversa.',
} as const;

function pathOf(homeConceptId: string, homeEditionId: string) {
  return `/colecao/${homeConceptId}/home-editions/${homeEditionId}`;
}

function sectionOf(page: Page): Locator {
  return page.locator('section#solicitar-conversa');
}

const group = (section: Locator, legend: string | RegExp) =>
  section.getByRole('group', { name: legend });
const stepTitle = (section: Locator) => section.locator('form h3');

/** Envios para a API: nenhum antes do envio final (spec §14.3). */
function trackPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/interests')) {
      posts.push(request.postData() ?? '');
    }
  });
  return posts;
}

/**
 * Capturas do checkpoint visual (material do PR): só a seção, com `UI_CAPTURE_DIR`. Recorte da página inteira rolada ao
 * topo: o cabeçalho fixo fica no alto da página, fora do recorte (sem CSS injetado, que a CSP do app recusa).
 */
async function capture(section: Locator, name: string) {
  const dir = process.env.UI_CAPTURE_DIR;
  if (dir === undefined || dir === '') return;
  const page = section.page();
  const width = page.viewportSize()?.width ?? 0;
  await page.evaluate(() => window.scrollTo(0, 0));
  const clip = await section.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
    };
  });
  await page.screenshot({
    path: `${dir}/w6-${name}-${width}.png`,
    fullPage: true,
    clip,
    animations: 'disabled',
  });
}

async function fillContact(section: Locator, suffix: string) {
  await section.getByLabel('Nome', { exact: true }).fill(`Pessoa ${suffix}`);
  await section.getByLabel('Telefone ou WhatsApp').fill('+55 (11) 98765-4321');
  await section.getByLabel('E-mail').fill(`pessoa.${suffix.toLowerCase()}@example.com`);
}

async function expectNoForbiddenPromise(section: Locator) {
  const text = (await section.innerText()).toLowerCase();
  for (const forbidden of [
    'agendad',
    'reserv',
    'garant',
    'prioridade',
    'aquisição confirmada',
    'entrada',
    'cota',
    'diária',
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
}

test.describe('desktop (1440 px, teclado)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });

  test('[REQ-022] [REQ-024] [REQ-025] [REQ-100] [REQ-101] 3 etapas com teclado: Owner com média (faixa + comparação), Voltar preserva, troca de modalidade invalida só o incompatível, nada enviado antes do fim; Admin até a pré-qualificação', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().withHomeEdition;
    const location = unique('Serra Etapas E2E');
    const consoleErrors = collectConsoleErrors(page);
    const posts = trackPosts(page);
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(TEXT.title);
    await expect(section.getByText(TEXT.lead)).toBeVisible();
    await expect(stepTitle(section)).toHaveText('1 de 3 — Sua Second Home');
    await expect(section.getByLabel(TEXT.days)).toHaveCount(0);
    await expect(group(section, TEXT.band)).toHaveCount(0);
    await capture(section, 'etapa1-inicial');

    // Continuar vazio: só a etapa 1 é validada; foco no primeiro campo inválido.
    await section.getByRole('button', { name: 'Continuar' }).click();
    await expect(section.getByRole('alert')).toContainText('Revise os campos indicados.');
    const modality = group(section, TEXT.modality);
    await expect(modality.getByRole('radio').first()).toBeFocused();
    await expect(stepTitle(section)).toHaveText('1 de 3 — Sua Second Home');

    // Teclado: Espaço escolhe Owner; Enter na localização avança; o foco vai ao título da etapa 2.
    await page.keyboard.press('Space');
    await expect(modality.getByRole('radio', { name: /^Owner/u })).toBeChecked();
    await section.getByLabel(TEXT.location).fill(location);
    await page.keyboard.press('Enter');
    await expect(stepTitle(section)).toHaveText('2 de 3 — Investimento e decisão');
    await expect(stepTitle(section)).toBeFocused();

    // Owner com média apresentada: faixa para iniciar + comparação com a média; sem a nota do Co-Owner.
    const band = group(section, TEXT.band);
    await expect(band.getByText(TEXT.bandHint)).toBeVisible();
    await expect(band.getByRole('radio')).toHaveCount(7);
    const fit = group(section, TEXT.referenceFit);
    await expect(fit).toBeVisible();
    await expect(fit.getByText(TEXT.referenceNote)).toBeVisible();
    await expect(section.getByText(TEXT.coOwnerNote)).toHaveCount(0);
    await capture(section, 'etapa2-owner-media');

    await section.getByRole('button', { name: 'Continuar' }).click();
    await expect(band.getByRole('radio').first()).toBeFocused();
    for (const legend of [TEXT.band, TEXT.decisionUnit, TEXT.horizon]) {
      await expect(group(section, legend).getByText('Escolha uma opção.')).toBeVisible();
    }
    await band.getByRole('radio', { name: /^De R\$\s1\smilhão a R\$\s2,5\smilhões$/u }).check();
    await fit
      .getByRole('radio', { name: 'Posso considerar, mas preciso entender melhor o investimento.' })
      .check();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'Decido em conjunto com meu parceiro, parceira ou família.' })
      .check();
    await group(section, TEXT.horizon)
      .getByRole('radio', { name: 'Imediatamente / nos próximos 30 dias' })
      .check();

    // Voltar preserva; Co-Owner descarta só a comparação e pede os dias.
    await section.getByRole('button', { name: 'Voltar' }).click();
    await expect(stepTitle(section)).toBeFocused();
    await expect(section.getByLabel(TEXT.location)).toHaveValue(location);
    await modality.getByRole('radio', { name: /^Owner/u }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(modality.getByRole('radio', { name: /^Co-Owner/u })).toBeChecked();
    await expect(section.getByText(TEXT.daysHint)).toBeVisible();
    await section.getByLabel(TEXT.days).fill('21');
    await section.getByRole('button', { name: 'Continuar' }).click();
    await expect(group(section, TEXT.referenceFit)).toHaveCount(0);
    await expect(section.getByText(TEXT.coOwnerNote)).toBeVisible();
    await expect(
      band.getByRole('radio', { name: /^De R\$\s1\smilhão a R\$\s2,5\smilhões$/u }),
    ).toBeChecked();
    await expect(
      group(section, TEXT.horizon).getByRole('radio', {
        name: 'Imediatamente / nos próximos 30 dias',
      }),
    ).toBeChecked();
    await capture(section, 'etapa2-co-owner');

    // De volta a Owner: os dias somem; a comparação volta a ser pedida, vazia.
    await section.getByRole('button', { name: 'Voltar' }).click();
    await modality.getByRole('radio', { name: /^Owner/u }).check();
    await expect(section.getByLabel(TEXT.days)).toHaveCount(0);
    await section.getByRole('button', { name: 'Continuar' }).click();
    await expect(fit.getByRole('radio', { checked: true })).toHaveCount(0);
    await fit.getByRole('radio', { name: 'Está dentro do que considero investir.' }).check();
    await section.getByRole('button', { name: 'Continuar' }).click();

    // Etapa 3: contato, transparência e o envio final.
    await expect(stepTitle(section)).toHaveText('3 de 3 — Contato');
    await expect(stepTitle(section)).toBeFocused();
    await fillContact(section, 'Etapas');
    await expect(section.getByText(TEXT.notAcquisition)).toBeVisible();
    await expect(section.getByText(TEXT.privacy, { exact: false })).toBeVisible();
    const privacy = section.getByRole('link', { name: /Aviso de Privacidade/u });
    await expect(privacy).toHaveAttribute('href', '/privacidade');
    await expect(privacy).toHaveAttribute('target', '_blank');
    await capture(section, 'etapa3-contato');
    expect(posts).toHaveLength(0);
    await expectResponsive(page, consoleErrors);

    await section.getByRole('button', { name: 'Solicitar uma conversa' }).focus();
    await page.keyboard.press('Enter');
    const success = section.getByRole('status').filter({ hasText: TEXT.success });
    await expect(success).toBeVisible();
    await expect(success).toBeFocused();
    await expect(section.locator('form')).toHaveCount(0);
    expect(posts).toHaveLength(1);
    const sent = JSON.parse(posts[0] ?? '{}') as Record<string, unknown>;
    expect(sent).toMatchObject({
      modality: 'owner',
      available_to_start_band: 'from_1m_to_2_5m',
      reference_fit: 'within',
      decision_unit: 'with_partner_or_family',
      decision_horizon: 'immediate',
    });
    expect(sent).not.toHaveProperty('approx_days');
    await expectNoForbiddenPromise(section);
    await capture(section, 'sucesso');

    // Admin: Second Home desejada → Pré-qualificação → Contato (spec §14.10).
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/u);
    await page.goto('/admin/interesses');
    await page
      .getByRole('region', { name: seed.homeEdition.name })
      .getByRole('link', { name: 'Ver as manifestações desta Home Edition' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.homeEdition.name);
    const located = page.getByRole('region', { name: location });
    await located.getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Manifestação de interesse');
    await expect(page.getByText('Pessoa Etapas')).toHaveCount(0);
    await page.getByRole('link', { name: 'Ver contato e pré-qualificação' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contato e pré-qualificação');
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(['Second Home desejada', 'Pré-qualificação', 'Contato']);
    const qualification = page.getByRole('region', { name: 'Pré-qualificação' });
    await expect(qualification).toContainText('Recursos para iniciar');
    await expect(qualification).toContainText(/De R\$\s1\smilhão a R\$\s2,5\smilhões/u);
    await expect(qualification).toContainText('Compatibilidade com a média projetada');
    await expect(qualification).toContainText('Está dentro do que considero investir.');
    await expect(qualification).toContainText(/R\$\s4\.800\.000/u);
    await expect(qualification).toContainText(
      'Decido em conjunto com meu parceiro, parceira ou família.',
    );
    await expect(qualification).toContainText('Imediatamente / nos próximos 30 dias');
    const desired = page.getByRole('region', { name: 'Second Home desejada' });
    await expect(desired).toContainText(location);
    await expect(desired).toContainText('Owner');
    const contact = page.getByRole('region', { name: 'Contato' });
    await expect(contact).toContainText('Pessoa Etapas');
    await expect(contact).toContainText('+5511987654321');
    await expect(contact).toContainText('pessoa.etapas@example.com');
    await expectResponsive(page, consoleErrors);
  });

  test('[REQ-022] [REQ-025] Home Edition sem média projetada: Owner e Co-Owner respondem só à faixa; sem comparação nem nota da média', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().secondBrand;
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    const modality = group(section, TEXT.modality);
    for (const choice of [/^Owner/u, /^Co-Owner/u]) {
      await modality.getByRole('radio', { name: choice }).check();
      await section.getByLabel(TEXT.location).fill(unique('Litoral Sem Média E2E'));
      if (String(choice).includes('Co-Owner')) await section.getByLabel(TEXT.days).fill('14');
      await section.getByRole('button', { name: 'Continuar' }).click();
      await expect(group(section, TEXT.band)).toBeVisible();
      await expect(section.getByText(/Considerando a média projetada/u)).toHaveCount(0);
      await expect(section.getByText(TEXT.coOwnerNote)).toHaveCount(0);
      await section.getByRole('button', { name: 'Voltar' }).click();
    }
  });

  test('[REQ-022] [EC-15] falhas: contexto recusado pede para atualizar; Home Edition indisponível oferece a Coleção; não confirmado repete com a mesma chave', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().secondBrand;
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    await group(section, TEXT.modality)
      .getByRole('radio', { name: /^Owner/u })
      .check();
    await section.getByLabel(TEXT.location).fill(unique('Litoral Falhas E2E'));
    await section.getByRole('button', { name: 'Continuar' }).click();
    await group(section, TEXT.band).getByRole('radio', { name: 'Ainda não defini' }).check();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'A decisão é minha.' })
      .check();
    await group(section, TEXT.horizon)
      .getByRole('radio', { name: 'Ainda estou explorando possibilidades' })
      .check();
    await section.getByRole('button', { name: 'Continuar' }).click();
    await fillContact(section, 'Falhas');
    const submit = section.getByRole('button', { name: 'Solicitar uma conversa' });

    // Contexto adulterado no caminho: o servidor recusa e a interface pede para atualizar a página.
    await page.route('**/v1/interests', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, presentation_context: 'a.b' }) });
    });
    await submit.click();
    await expect(
      section.getByText('Esta página ficou desatualizada.', { exact: false }),
    ).toBeVisible();
    await page.unroute('**/v1/interests');

    // Home Edition saiu do público entre a página e o envio (02 §15, item 15): mensagem e caminho para a Coleção.
    await page.route('**/v1/interests', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{"code":"ERR_NOT_FOUND"}',
      }),
    );
    await submit.click();
    await expect(
      section.getByText('Esta Home Edition não está mais disponível para solicitação de conversa.'),
    ).toBeVisible();
    await expect(section.getByRole('link', { name: 'Ver a Coleção' })).toHaveAttribute(
      'href',
      '/colecao',
    );
    await page.unroute('**/v1/interests');

    // Não confirmado: dados preservados; a nova tentativa usa a mesma chave (mesma tentativa lógica).
    const keys: string[] = [];
    await page.route('**/v1/interests', async (route) => {
      keys.push(route.request().headers()['idempotency-key'] ?? '');
      if (keys.length === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.continue();
    });
    await submit.click();
    await expect(
      section.getByText('Não foi possível confirmar o envio.', { exact: false }),
    ).toBeVisible();
    await expect(section.getByLabel('Nome', { exact: true })).toHaveValue('Pessoa Falhas');
    await submit.click();
    await expect(section.getByRole('status').filter({ hasText: TEXT.success })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test('Aviso de Privacidade da jornada: pendente fora de Production, sem texto inventado; axe 0', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/privacidade');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aviso de Privacidade');
    await expect(page.getByRole('status')).toContainText('ainda não foi publicado');
    await expectResponsive(page, consoleErrors);
  });
});

test.describe('celular (390 px, toque)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'pt-BR',
  });

  test('[REQ-022] [REQ-025] 3 etapas com toque: Owner com média e Co-Owner na etapa 2, contato e sucesso; sem overflow e axe 0', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().withHomeEdition;
    const consoleErrors = collectConsoleErrors(page);
    const posts = trackPosts(page);
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    await section.scrollIntoViewIfNeeded();
    await capture(section, 'etapa1-inicial');
    const modality = group(section, TEXT.modality);

    await modality.getByRole('radio', { name: /^Owner/u }).tap();
    await section.getByLabel(TEXT.location).fill(unique('Litoral Toque E2E'));
    await section.getByRole('button', { name: 'Continuar' }).tap();
    await expect(stepTitle(section)).toHaveText('2 de 3 — Investimento e decisão');
    await expect(group(section, TEXT.referenceFit)).toBeVisible();
    await capture(section, 'etapa2-owner-media');

    await section.getByRole('button', { name: 'Voltar' }).tap();
    await modality.getByRole('radio', { name: /^Co-Owner/u }).tap();
    await section.getByLabel(TEXT.days).fill('21');
    await section.getByRole('button', { name: 'Continuar' }).tap();
    await expect(section.getByText(TEXT.coOwnerNote)).toBeVisible();
    await expect(group(section, TEXT.referenceFit)).toHaveCount(0);
    await group(section, TEXT.band)
      .getByRole('radio', { name: /^De R\$\s250\smil a R\$\s500\smil$/u })
      .tap();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'Outras pessoas também participam da decisão.' })
      .tap();
    await group(section, TEXT.horizon).getByRole('radio', { name: 'Entre 1 e 3 meses' }).tap();
    await capture(section, 'etapa2-co-owner');
    await expectResponsive(page, consoleErrors);

    await section.getByRole('button', { name: 'Continuar' }).tap();
    await expect(stepTitle(section)).toHaveText('3 de 3 — Contato');
    await fillContact(section, 'Toque');
    await capture(section, 'etapa3-contato');
    await expectResponsive(page, consoleErrors);
    expect(posts).toHaveLength(0);

    await section.getByRole('button', { name: 'Solicitar uma conversa' }).tap();
    await expect(section.getByRole('status').filter({ hasText: TEXT.success })).toBeVisible();
    expect(JSON.parse(posts[0] ?? '{}')).toMatchObject({
      modality: 'co_owner',
      approx_days: 21,
      available_to_start_band: 'from_250k_to_500k',
      decision_unit: 'with_others',
      decision_horizon: 'one_to_three_months',
    });
    expect(JSON.parse(posts[0] ?? '{}')).not.toHaveProperty('reference_fit');
    await expectNoForbiddenPromise(section);
    await capture(section, 'sucesso');
    await expectResponsive(page, consoleErrors);
  });
});
