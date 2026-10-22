import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { signIn, STAFF_EMAIL, VISITOR_EMAIL } from './support/auth';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';
import { punctuatedCpf, randomCpf } from '../support/documents';

// Catálogo no Admin (W3, docs/specs/catalog.md): telas sobre o App Shell, mobile-first com paridade (ADR-0009).
// O banco do E2E é compartilhado entre os testes: cada teste usa nomes próprios e não presume lista vazia.
const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
// Cada tela dos fluxos passa pelo gate responsivo (varredura 320–1920 + axe a 390 e 1440): o orçamento acompanha o
// número de telas, com a suíte rodando em paralelo.
const FLOW_TIMEOUT_MS = 300_000;

async function openCatalog(page: Page) {
  await page.getByRole('button', { name: 'Abrir menu' }).tap();
  await page
    .getByRole('dialog', { name: 'Menu da administração' })
    .getByRole('link', { name: 'Catálogo' })
    .tap();
  await expect(page).toHaveURL(/\/admin\/catalogo$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Catálogo');
}

test.describe('celular (390 px, toque)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
  });

  test('[REQ-095] [BR-021] Brand Partner a 390 px com toque: registrar, validar campo, encerrar; cada tela sem overflow e com axe 0', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const consoleErrors = collectConsoleErrors(page);
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);
    await openCatalog(page);
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '01-catalogo');

    await page.getByRole('link', { name: 'Registrar Brand Partner' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registrar Brand Partner');
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '02-registrar-brand-partner');

    // Campo obrigatório vazio → erro no campo, sem gravar.
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    // O anunciador de rota do Next também tem role="alert": filtra pelo texto.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Revise os campos indicados.' }),
    ).toBeVisible();
    const name = page.getByLabel('Nome da marca');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Preencha este campo.')).toBeVisible();
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '03-registrar-brand-partner-erro');

    // Termo vedado (REQ-100) → recusa com o campo indicado.
    await name.fill('Casa da cota');
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    await expect(page.getByText(/termo vedado/)).toBeVisible();

    const brand = unique('Maison Aurora');
    await name.fill(brand);
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(brand);
    await expect(page.getByRole('status')).toContainText('Registro concluído.');
    await expect(page.getByRole('link', { name: 'Registrar Home Concept' })).toBeVisible();
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '04-brand-partner');

    await page.getByRole('link', { name: 'Registrar encerramento' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registrar encerramento');
    await expect(page.getByText('Esta ação não pode ser desfeita')).toBeVisible();
    await expect(page.getByText(/America\/Sao_Paulo/)).toBeVisible();
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '05-encerramento');

    await page.getByLabel('Eficácia do encerramento').fill('2026-09-01T09:30');
    await page.getByLabel('Base do encerramento').fill('Aditivo 07/2026');
    await page.getByRole('button', { name: 'Registrar encerramento' }).tap();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(brand);
    await expect(page.getByRole('status')).toContainText('Encerramento registrado.');
    await expect(page.getByText('Parceria encerrada')).toBeVisible();
    await expect(page.getByText(/01\/09\/2026,? 09:30/)).toBeVisible();
    // Depois da eficácia, nenhum novo uso da marca é oferecido (BR-021).
    await expect(page.getByRole('link', { name: 'Registrar Home Concept' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Registrar encerramento' })).toHaveCount(0);
    // Sem ação permitida, o cabeçalho não reserva a área de ações (nenhum espaço vazio).
    await expect(page.locator('.lx-page-header__actions')).toHaveCount(0);
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '06-brand-partner-encerrada');

    await page.getByRole('link', { name: 'Catálogo', exact: true }).first().tap();
    await expect(page.getByRole('link', { name: brand })).toBeVisible();
    await captureForReview(page, '07-catalogo-com-registros');
  });

  test('[REQ-020] [REQ-027] [BR-025] [BR-036] fluxo completo a 390 px com toque: Home Concept → aprovação → Home Edition (preparação → finalização → publicação) → Investor → Second Home; cada tela sem overflow e com axe 0', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const consoleErrors = collectConsoleErrors(page);
    const heading = page.getByRole('heading', { level: 1 });
    const status = page.getByRole('status');
    const gate = async (name: string) => {
      await expectResponsive(page, consoleErrors);
      await captureForReview(page, name);
    };
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);

    // Brand Partner e autorização de exposição.
    const brand = unique('Maison Solar');
    await page.goto('/admin/catalogo/brand-partners/nova');
    await page.getByLabel('Nome da marca').fill(brand);
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    await expect(heading).toHaveText(brand);
    await page.getByRole('link', { name: 'Registrar autorização de exposição' }).tap();
    await expect(heading).toHaveText('Registrar autorização de exposição');
    await gate('08-exposicao');
    await page.getByLabel('Autorização de exposição pública').fill('Plano estratégico 2026-09');
    await page.getByRole('button', { name: 'Registrar autorização' }).tap();
    await expect(status).toContainText('Autorização de exposição registrada.');

    // Home Concept com a versão 1 (listas uma por linha).
    await page.getByRole('link', { name: 'Registrar Home Concept' }).tap();
    await expect(heading).toHaveText('Registrar Home Concept');
    await gate('09-registrar-home-concept');
    await page.getByLabel('Nome do Home Concept').fill('Casa do Pátio');
    await page.getByLabel('Elementos essenciais').fill('Pátio central\nFachada em pedra local');
    await page.getByLabel('Premissas de preservação').fill('Materiais regionais');
    await page
      .getByLabel('Especificação')
      .fill('Especificação para Home Editions fiéis ao Home Concept.');
    await page.getByRole('button', { name: 'Registrar Home Concept' }).tap();
    await expect(heading).toHaveText('Casa do Pátio');
    await expect(page.getByText('Não aprovado', { exact: true })).toBeVisible();
    // Sem versão aprovada não há Home Edition (REQ-020).
    await expect(page.getByRole('link', { name: 'Registrar Home Edition' })).toHaveCount(0);
    await gate('10-home-concept-nao-aprovado');

    // Aprovação: revisão editorial da versão e referências das aprovações (REQ-096).
    await page.getByRole('link', { name: 'Versão 1' }).tap();
    await expect(heading).toHaveText('Aprovar versão 1');
    await expect(page.getByText('Fachada em pedra local')).toBeVisible();
    await gate('11-aprovar-versao');
    await page.getByLabel('Aprovações registradas').fill('Ata de aprovação 2026-09');
    await page.getByRole('button', { name: 'Aprovar versão 1' }).tap();
    await expect(status).toContainText('Versão aprovada.');
    await expect(page.getByText('Aprovado (versão 1)', { exact: true })).toBeVisible();

    // Home Edition em preparação: definição material e textos, sem localização, modalidade nem condições (BR-031).
    await page.getByRole('link', { name: 'Registrar Home Edition' }).tap();
    await expect(heading).toHaveText('Registrar Home Edition');
    await gate('12-registrar-home-edition');
    await page.getByLabel('Nome da Home Edition').fill('Pátio Mar');
    await page.getByLabel('Descrição').fill('Uma casa térrea em torno do pátio central.');
    await page.getByLabel('Tipologia').fill('Casa térrea com pátio central');
    await page.getByLabel('Configuração dos espaços').fill('Estar e cozinha integrados ao pátio.');
    await page.getByLabel('Área projetada (m²)').fill('420');
    await page.getByLabel('Suítes').fill('4');
    await page.getByLabel('Capacidade (pessoas, no máximo)').fill('10');
    await page.getByLabel('Ambientes').fill('Estar\nJantar');
    await page.getByRole('button', { name: 'Registrar Home Edition' }).tap();
    await expect(heading).toHaveText('Pátio Mar');
    await expect(page.getByText('Em preparação · Fora do site')).toBeVisible();
    // Em preparação não origina Second Home nem vai ao site.
    await expect(page.getByRole('link', { name: 'Registrar Second Home' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Publicar', exact: true })).toHaveCount(0);
    await gate('13-home-edition-preparacao');

    // Correção da preparação: a definição material ainda muda.
    await page.getByRole('link', { name: 'Editar a preparação' }).tap();
    await expect(page.getByLabel('Suítes')).toHaveValue('4');
    await page.getByLabel('Suítes').fill('5');
    await page.getByRole('button', { name: 'Salvar preparação' }).tap();
    await expect(status).toContainText('Alterações salvas.');

    // Finalização (uma vez, sem volta) e publicação, cada uma com a sua confirmação (BR-036).
    await page.getByRole('link', { name: 'Finalizar a definição material' }).tap();
    await expect(page.getByText('Esta ação não pode ser desfeita')).toBeVisible();
    await gate('14-finalizar-home-edition');
    await page.getByRole('button', { name: 'Finalizar a definição material' }).tap();
    await expect(status).toContainText('Definição material finalizada.');
    await expect(page.getByRole('link', { name: 'Editar a preparação' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Publicar', exact: true }).tap();
    await page.getByRole('button', { name: 'Publicar', exact: true }).tap();
    await expect(status).toContainText('Home Edition publicada.');
    await expect(page.getByText('Finalizada · Publicada')).toBeVisible();

    // Autorização de Investor para o Home Concept (REQ-027), com a party do Investor já cadastrada (W7, D-W3-1).
    const investorCpf = randomCpf();
    const party = await page.request.post('/v1/admin/parties', {
      headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
      data: { document: investorCpf },
    });
    expect(party.status()).toBe(201);
    await page.getByRole('link', { name: 'Casa do Pátio', exact: true }).tap();
    await page.getByRole('link', { name: 'Registrar autorização de Investor' }).tap();
    await expect(heading).toHaveText('Registrar autorização de Investor');
    await gate('15-registrar-autorizacao');
    await page.getByLabel('CPF ou CNPJ do Investor').fill(punctuatedCpf(investorCpf));
    await page.getByLabel('Instrumento de autorização').fill('Contrato INV-001');
    await page.getByLabel('Início da vigência').fill('2026-01-01T00:00');
    await page.getByRole('button', { name: 'Registrar autorização' }).tap();
    await expect(page.getByRole('link', { name: 'Contrato INV-001' })).toBeVisible();
    await gate('16-home-concept-aprovado');

    // Second Home com Investor: o registro fixa a Home Edition e a versão vigente (BR-025).
    await page.getByRole('link', { name: 'Pátio Mar' }).tap();
    await page.getByRole('link', { name: 'Registrar Second Home' }).tap();
    await expect(heading).toHaveText('Registrar Second Home');
    await expect(
      page.getByText('A versão 1 do Home Concept, vigente agora, será fixada'),
    ).toBeVisible();
    await gate('17-registrar-second-home');
    await page.getByLabel('Referência interna').fill('Unidade 01');
    await page.getByLabel('Fuso horário da Second Home').selectOption('America/Sao_Paulo');
    await page.getByLabel('Investor', { exact: true }).selectOption({ label: 'Contrato INV-001' });
    await page.getByRole('button', { name: 'Registrar Second Home' }).tap();
    await expect(heading).toHaveText('Unidade 01');
    await expect(page.getByText('Versão 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Contrato INV-001')).toBeVisible();
    await gate('18-second-home');

    // Retirar do público não reabre a definição material nem muda a Second Home registrada.
    await page.getByRole('link', { name: 'Pátio Mar' }).tap();
    await page.getByRole('link', { name: 'Retirar do público' }).tap();
    await page.getByLabel('Base da retirada').fill('Revisão das imagens');
    await page.getByRole('button', { name: 'Retirar do público' }).tap();
    await expect(status).toContainText('Home Edition retirada do público.');
    await expect(page.getByText('Finalizada · Fora do site')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Unidade 01' })).toBeVisible();

    // Revogação (ação destrutiva discreta) não muda a Second Home registrada.
    await page.getByRole('link', { name: 'Casa do Pátio', exact: true }).tap();
    await page.getByRole('link', { name: 'Contrato INV-001' }).tap();
    await expect(heading).toHaveText('Revogar autorização de Investor');
    await gate('19-revogar-autorizacao');
    await page.getByLabel('Base da revogação').fill('Distrato 2026-09');
    await page.getByRole('button', { name: 'Revogar autorização' }).tap();
    await expect(status).toContainText('Autorização revogada.');
    await expect(page.getByText('Revogada', { exact: true })).toBeVisible();

    // Nova versão parte da mais recente e nasce não aprovada.
    await page.getByRole('link', { name: 'Nova versão' }).tap();
    await expect(heading).toHaveText('Nova versão');
    await expect(page.getByLabel('Especificação')).toHaveValue(
      'Especificação para Home Editions fiéis ao Home Concept.',
    );
    await gate('20-nova-versao');
    await page.getByRole('button', { name: 'Registrar versão' }).tap();
    await expect(page.getByRole('link', { name: 'Versão 2' })).toBeVisible();
  });

  test('[REQ-020] [REQ-100] [BR-034] Coleção no Admin a 390 px com toque: vocabulário, classificação, capa, curadoria, mídia e média projetada da Home Edition; cada tela sem overflow e com axe 0', async ({
    page,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const consoleErrors = collectConsoleErrors(page);
    const heading = page.getByRole('heading', { level: 1 });
    const status = page.getByRole('status');
    const gate = async (name: string) => {
      await expectResponsive(page, consoleErrors);
      await captureForReview(page, name);
    };
    await signIn(page, STAFF_EMAIL);
    await expect(page).toHaveURL(/\/admin$/);

    // Vocabulário controlado: termos únicos deste teste (banco compartilhado).
    await openCatalog(page);
    await page.getByRole('link', { name: 'Vocabulários da Coleção' }).tap();
    await expect(heading).toHaveText('Vocabulários da Coleção');
    await gate('21-vocabularios');
    const lifestyle = unique('Silêncio');
    const style = unique('Pedra seca');
    for (const [kind, label] of [
      [/^Lifestyle/, lifestyle],
      [/^Estilo arquitetônico/, style],
    ] as const) {
      await page.getByRole('radio', { name: kind }).check();
      await page.getByLabel('Rótulo').fill(label);
      await page.getByRole('button', { name: 'Registrar termo' }).tap();
      await expect(status).toContainText('Registro concluído.');
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }

    // Home Concept com classificação (spec catalog §13.12); pessoas, suítes e área são da Home Edition.
    const brand = unique('Maison Coleção');
    await page.goto('/admin/catalogo/brand-partners/nova');
    await page.getByLabel('Nome da marca').fill(brand);
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    await expect(heading).toHaveText(brand);
    await page.getByRole('link', { name: 'Registrar Home Concept' }).tap();
    await page.getByLabel('Nome do Home Concept').fill('Casa do Silêncio');
    await page.getByLabel('Elementos essenciais').fill('Pátio de pedra seca');
    await page.getByLabel('Premissas de preservação').fill('Materiais regionais');
    await page
      .getByLabel('Especificação')
      .fill('Especificação para Home Editions fiéis ao Home Concept.');
    await page
      .getByRole('group', { name: 'Lifestyle' })
      .getByLabel('Principal')
      .selectOption({ label: lifestyle });
    await page
      .getByRole('group', { name: 'Estilo arquitetônico' })
      .getByLabel('Principal')
      .selectOption({ label: style });
    await expect(page.getByLabel('Pessoas (no máximo)')).toHaveCount(0);
    await gate('22-registrar-home-concept-colecao');
    await page.getByRole('button', { name: 'Registrar Home Concept' }).tap();
    await expect(heading).toHaveText('Casa do Silêncio');
    await page.getByRole('link', { name: 'Versão 1' }).tap();
    await page.getByLabel('Aprovações registradas').fill('Ata de aprovação 2026-10');
    await page.getByRole('button', { name: 'Aprovar versão 1' }).tap();
    // A versão vigente mostra a classificação da Coleção.
    await expect(page.getByText(`${lifestyle} · ${style}`).first()).toBeVisible();

    // Capa: arquivo pequeno é recusado no campo; o válido nasce pendente e é aprovado (ADR-0015).
    await page.getByRole('link', { name: 'Enviar capa' }).tap();
    await expect(heading).toHaveText('Enviar capa');
    await gate('23-enviar-capa');
    const image = async (width: number, height: number) => ({
      name: 'capa.jpg',
      mimeType: 'image/jpeg',
      buffer: await sharp({
        create: { width, height, channels: 3, background: { r: 15, g: 78, b: 103 } },
      })
        .jpeg()
        .toBuffer(),
    });
    const alt = 'Imagem de teste do E2E — um campo de cor, nenhuma casa';
    await page.getByLabel('Arquivo da imagem').setInputFiles(await image(700, 500));
    await page.getByLabel('Texto alternativo').fill(alt);
    await page.getByRole('button', { name: 'Enviar para aprovação' }).tap();
    await expect(page.getByText(/pelo menos 720 × 520 px e até 40 megapixels/)).toBeVisible();
    await page.getByLabel('Arquivo da imagem').setInputFiles(await image(1600, 1200));
    await page.getByRole('button', { name: 'Enviar para aprovação' }).tap();
    await expect(heading).toHaveText('Capa do Home Concept');
    await expect(status).toContainText('Registro concluído.');
    await expect(page.getByRole('img', { name: alt })).toBeVisible();
    await gate('24-capa-pendente');
    await page.getByRole('button', { name: 'Aprovar capa' }).tap();
    await expect(status).toContainText('Capa aprovada.');

    // Curadoria: destaque explícito, com capa aprovada.
    await page.getByRole('link', { name: 'Casa do Silêncio', exact: true }).tap();
    await page.getByRole('link', { name: 'Editar curadoria' }).tap();
    await expect(heading).toHaveText('Curadoria');
    await gate('25-curadoria');
    await page.getByLabel('Posição na curadoria').fill('2');
    await page.getByRole('radio', { name: 'Em destaque', exact: true }).check();
    await page.getByRole('button', { name: 'Salvar curadoria' }).tap();
    await expect(status).toContainText('Alterações salvas.');
    await expect(page.getByText('Em destaque', { exact: true })).toBeVisible();

    // Home Edition com mídia (planta) e média projetada sem modalidade, base ou Ação, nunca por dia (BR-034, REQ-100).
    await page.getByRole('link', { name: 'Registrar Home Edition' }).tap();
    await page.getByLabel('Nome da Home Edition').fill('Silêncio Serra');
    await page.getByLabel('Descrição').fill('Uma casa de pedra seca na encosta.');
    await page.getByLabel('Tipologia').fill('Casa em dois pavimentos');
    await page.getByLabel('Configuração dos espaços').fill('Suítes no pavimento superior.');
    await page.getByLabel('Área projetada (m²)').fill('520');
    await page.getByLabel('Suítes').fill('5');
    await page.getByLabel('Capacidade (pessoas, no máximo)').fill('10');
    await page.getByRole('button', { name: 'Registrar Home Edition' }).tap();
    await expect(heading).toHaveText('Silêncio Serra');
    await expect(page.getByText('520 m² · 5 suítes · até 10 pessoas')).toBeVisible();

    await page.getByRole('link', { name: 'Enviar mídia' }).tap();
    await expect(heading).toHaveText('Enviar mídia');
    await gate('26-enviar-midia-home-edition');
    await page.getByRole('radio', { name: /^Planta/ }).check();
    await page.getByLabel('Arquivo da imagem').setInputFiles(await image(1600, 1200));
    await page
      .getByRole('textbox', { name: /^Texto alternativo/ })
      .fill('Planta de teste do E2E — um campo de cor');
    await page.getByRole('button', { name: 'Enviar para aprovação' }).tap();
    await expect(heading).toHaveText('Planta da Home Edition');
    await page.getByRole('button', { name: 'Aprovar mídia' }).tap();
    await expect(status).toContainText('Mídia aprovada.');

    await page.getByRole('link', { name: 'Silêncio Serra' }).tap();
    await page.getByRole('link', { name: 'Registrar média projetada' }).tap();
    await expect(heading).toHaveText('Registrar média projetada de investimento');
    await gate('27-media-projetada');
    await expect(page.getByRole('radio')).toHaveCount(0);
    await page.getByLabel('Média projetada (R$)').fill('quatro milhões');
    await page.getByRole('button', { name: 'Registrar média projetada' }).tap();
    await expect(page.getByText(/Digite o valor em reais/)).toBeVisible();
    await page.getByLabel('Média projetada (R$)').fill('4.800.000');
    await page.getByRole('button', { name: 'Registrar média projetada' }).tap();
    await expect(status).toContainText('Registro concluído.');
    const value = page.getByRole('link', { name: /^R\$\s4\.800\.000$/ });
    await expect(value).toBeVisible();
    await gate('28-home-edition-com-media-projetada');
    await value.tap();
    await expect(heading).toHaveText('Encerrar média projetada');
    await page.getByRole('button', { name: 'Encerrar agora' }).tap();
    await expect(status).toContainText('Vigência encerrada.');
    await expect(page.getByText('Encerrada', { exact: true })).toBeVisible();

    // Retirada da capa tira o destaque na mesma operação.
    await page.getByRole('link', { name: 'Casa do Silêncio', exact: true }).tap();
    await page.getByRole('link', { name: alt }).first().tap();
    await page.getByLabel('Motivo da retirada').fill('Nova sessão de fotos');
    await page.getByRole('button', { name: 'Retirar capa' }).tap();
    await expect(status).toContainText('Retirada registrada.');
    await page.getByRole('link', { name: 'Casa do Silêncio', exact: true }).tap();
    await expect(page.getByText('Sem destaque', { exact: true })).toBeVisible();
  });
});

test('[TECH-050] quem não tem papel Admin recebe 403 no catálogo e não vê o item de navegação', async ({
  page,
}) => {
  await signIn(page, VISITOR_EMAIL);
  // Espera a confirmação do segundo fator: navegar antes interromperia a sessão AAL2.
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/catalogo');
  await expect(page.getByText('Acesso negado')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Catálogo' })).toHaveCount(0);
});
