import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL } from './support/auth';
import { readSeed } from './support/discovery';
import { collectConsoleErrors, expectResponsive } from './support/ui';

// Solicitação de conversa na página da Home Edition (W6, docs/specs/ownership.md §14; b2c.md D-B2C-28): formulário
// mobile-first com paridade (ADR-0009), dimensão de investimento nas duas variantes, estados de envio, Aviso de
// Privacidade e o drill-down do Admin até o contato e a pré-qualificação. O banco do E2E é compartilhado: cada teste usa
// uma localização pretendida própria.
const FLOW_TIMEOUT_MS = 300_000;
const unique = (prefix: string) =>
  `${prefix} ${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;

const TEXT = {
  title: 'Solicite uma conversa sobre esta Home Edition',
  modality: 'Como você imagina ter sua Second Home?',
  referenceFit:
    'Como a média projetada de investimento desta Home Edition se compara ao que você considera investir?',
  definition: 'Em relação ao investimento, qual opção melhor descreve seu momento?',
  referenceNote:
    'Referência aproximada do investimento total projetado para materializar uma Second Home desta Home Edition. Não é preço, proposta ou condição comercial.',
  coOwnerNote:
    'No Co-Owner, o investimento individual depende da configuração da Second Home, definida pela Luxtory durante a estruturação. Por isso, a média projetada da Home Edition não representa o valor de uma Ação.',
  daysHint:
    'Para Co-Owner, os dias informados representam apenas uma preferência e não criam Direito de Uso.',
  decisionUnit: 'Quem participa dessa decisão com você?',
  horizon: 'Quando você imagina avançar com essa decisão?',
  notAcquisition: 'Manifestar interesse não é uma aquisição.',
  privacy:
    'Usaremos seus dados para responder à sua solicitação de conversa e conduzir a pré-qualificação comercial relacionada a esta Home Edition.',
  success: 'Recebemos sua solicitação de conversa.',
} as const;

const PRESENTED = /Média projetada apresentada: R\$\s4\.800\.000\./u;

function pathOf(homeConceptId: string, homeEditionId: string) {
  return `/colecao/${homeConceptId}/home-editions/${homeEditionId}`;
}

function sectionOf(page: Page): Locator {
  return page.locator('section#solicitar-conversa');
}

const group = (section: Locator, legend: string) => section.getByRole('group', { name: legend });

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
    'cota',
    'diária',
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
}

test.describe('desktop (1440 px, teclado)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });

  test('[REQ-022] [REQ-024] [REQ-025] [REQ-100] [REQ-101] Owner com média apresentada: variantes, dias só para Co-Owner, teclado, sucesso só como solicitação recebida; Admin até contato e pré-qualificação', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().withHomeEdition;
    const location = unique('Serra Keyboard E2E');
    const consoleErrors = collectConsoleErrors(page);
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(TEXT.title);
    await expect(section.getByText(TEXT.referenceFit)).toHaveCount(0);
    await expect(section.getByLabel('Quantos dias por ano, aproximadamente?')).toHaveCount(0);
    await capture(section, 'inicial');

    // Envio vazio: resumo acessível e foco no primeiro campo inválido.
    await section.getByRole('button', { name: 'Solicitar uma conversa' }).click();
    await expect(section.getByRole('alert')).toContainText('Revise os campos indicados.');
    const modality = group(section, TEXT.modality);
    await expect(modality.getByRole('radio').first()).toBeFocused();
    await capture(section, 'erros');

    // Teclado: Espaço escolhe Owner; o erro da modalidade some; com a média apresentada, a comparação declarada (A1).
    await page.keyboard.press('Space');
    await expect(modality.getByRole('radio', { name: /^Owner/u })).toBeChecked();
    await expect(modality.getByText('Escolha uma opção.')).toHaveCount(0);
    const referenceFit = group(section, TEXT.referenceFit);
    await expect(referenceFit).toBeVisible();
    await expect(referenceFit.getByText(PRESENTED)).toBeVisible();
    await expect(referenceFit.getByText(TEXT.referenceNote)).toBeVisible();
    await expect(section.getByLabel('Quantos dias por ano, aproximadamente?')).toHaveCount(0);

    // Seta para baixo: Co-Owner — dias aparecem como preferência; a pergunta vira estágio de definição, com a nota.
    await page.keyboard.press('ArrowDown');
    await expect(modality.getByRole('radio', { name: /^Co-Owner/u })).toBeChecked();
    await expect(section.getByLabel('Quantos dias por ano, aproximadamente?')).toBeVisible();
    await expect(section.getByText(TEXT.daysHint)).toBeVisible();
    const definition = group(section, TEXT.definition);
    await expect(definition.getByText(TEXT.coOwnerNote)).toBeVisible();
    await expect(section.getByText(PRESENTED)).toHaveCount(0);
    await capture(section, 'co-owner');

    // De volta a Owner: a resposta de investimento da outra variante foi descartada.
    await definition
      .getByRole('radio', { name: 'Já defini uma faixa que considero investir.' })
      .check();
    await modality.getByRole('radio', { name: /^Co-Owner/u }).focus();
    await page.keyboard.press('ArrowUp');
    await expect(modality.getByRole('radio', { name: /^Owner/u })).toBeChecked();
    await expect(referenceFit.getByRole('radio', { checked: true })).toHaveCount(0);

    await section.getByLabel('Onde você imagina sua Second Home?').fill(location);
    await referenceFit
      .getByRole('radio', { name: 'Está dentro do que considero investir.' })
      .check();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'Decido com meu parceiro, parceira ou família.' })
      .check();
    await group(section, TEXT.horizon).getByRole('radio', { name: 'Entre 6 e 12 meses.' }).check();
    await fillContact(section, 'Teclado');
    await expect(section.getByText(TEXT.notAcquisition)).toBeVisible();
    await expect(section.getByText(TEXT.privacy, { exact: false })).toBeVisible();
    const privacy = section.getByRole('link', { name: /Aviso de Privacidade/u });
    await expect(privacy).toHaveAttribute('href', '/privacidade');
    await expect(privacy).toHaveAttribute('target', '_blank');
    await capture(section, 'owner-preenchido');
    await expectResponsive(page, consoleErrors);

    await section.getByRole('button', { name: 'Solicitar uma conversa' }).focus();
    await page.keyboard.press('Enter');
    const success = section.getByRole('status').filter({ hasText: TEXT.success });
    await expect(success).toBeVisible();
    await expect(success).toBeFocused();
    await expect(section.locator('form')).toHaveCount(0);
    await expectNoForbiddenPromise(section);
    await capture(section, 'sucesso');

    // Admin: agregado → Home Edition → interesse → contato e pré-qualificação (spec §14.10).
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/u);
    await page.goto('/admin/interesses');
    await page
      .getByRole('region', { name: seed.homeEdition.name })
      .getByRole('link', { name: 'Ver as manifestações desta Home Edition' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seed.homeEdition.name);
    const located = page.getByRole('region', { name: location });
    await expect(located).not.toContainText(`Pessoa Teclado`);
    await located.getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Manifestação de interesse');
    await expect(page.getByText(location)).toBeVisible();
    await expect(page.getByText('Pessoa Teclado')).toHaveCount(0);
    await page.getByRole('link', { name: 'Ver contato e pré-qualificação' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contato e pré-qualificação');
    await expect(page.getByText('Pessoa Teclado')).toBeVisible();
    await expect(page.getByText('+5511987654321')).toBeVisible();
    await expect(page.getByText('pessoa.teclado@example.com')).toBeVisible();
    await expect(page.getByText(/Está dentro do que considero investir\./u)).toBeVisible();
    await expect(page.getByText(/R\$\s4\.800\.000/u)).toBeVisible();
    await expect(page.getByText('Decido com meu parceiro, parceira ou família.')).toBeVisible();
    await expect(page.getByText('Entre 6 e 12 meses.')).toBeVisible();
    await expectResponsive(page, consoleErrors);
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
    await section
      .getByLabel('Onde você imagina sua Second Home?')
      .fill(unique('Litoral Falhas E2E'));
    await group(section, TEXT.definition)
      .getByRole('radio', {
        name: 'Preciso entender melhor o investimento antes de definir uma faixa.',
      })
      .check();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'A decisão é minha.' })
      .check();
    await group(section, TEXT.horizon)
      .getByRole('radio', { name: 'Ainda estou explorando possibilidades.' })
      .check();
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

  test('[REQ-022] [REQ-025] Home Edition sem média projetada: Owner e Co-Owner respondem ao estágio de definição; fluxo completo com toque', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const seed = readSeed().secondBrand;
    const consoleErrors = collectConsoleErrors(page);
    await page.goto(pathOf(seed.id, seed.homeEdition.id));
    const section = sectionOf(page);
    await section.scrollIntoViewIfNeeded();
    await capture(section, 'inicial');
    const modality = group(section, TEXT.modality);

    await modality.getByRole('radio', { name: /^Owner/u }).tap();
    await expect(group(section, TEXT.definition)).toBeVisible();
    await expect(section.getByText(TEXT.referenceFit)).toHaveCount(0);
    await expect(section.getByText(TEXT.coOwnerNote)).toHaveCount(0);

    await modality.getByRole('radio', { name: /^Co-Owner/u }).tap();
    await expect(section.getByText(TEXT.coOwnerNote)).toBeVisible();
    await section
      .getByLabel('Onde você imagina sua Second Home?')
      .fill(unique('Litoral Toque E2E'));
    await section.getByLabel('Quantos dias por ano, aproximadamente?').fill('21');
    await group(section, TEXT.definition)
      .getByRole('radio', {
        name: 'Tenho uma ideia do que considero investir, mas ainda não defini uma faixa.',
      })
      .tap();
    await group(section, TEXT.decisionUnit)
      .getByRole('radio', { name: 'Outras pessoas também participam.' })
      .tap();
    await group(section, TEXT.horizon).getByRole('radio', { name: 'Mais de 12 meses.' }).tap();
    await fillContact(section, 'Toque');
    await capture(section, 'co-owner-preenchido');
    await expectResponsive(page, consoleErrors);

    await section.getByRole('button', { name: 'Solicitar uma conversa' }).tap();
    await expect(section.getByRole('status').filter({ hasText: TEXT.success })).toBeVisible();
    await expectNoForbiddenPromise(section);
    await capture(section, 'sucesso');
    await expectResponsive(page, consoleErrors);
  });
});
