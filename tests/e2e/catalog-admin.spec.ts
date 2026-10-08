import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { signIn, STAFF_EMAIL, VISITOR_EMAIL } from './support/auth';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

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
    await expect(page.getByRole('link', { name: 'Registrar Concept' })).toBeVisible();
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
    await expect(page.getByRole('link', { name: 'Registrar Concept' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Registrar encerramento' })).toHaveCount(0);
    // Sem ação permitida, o cabeçalho não reserva a área de ações (nenhum espaço vazio).
    await expect(page.locator('.lx-page-header__actions')).toHaveCount(0);
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '06-brand-partner-encerrada');

    await page.getByRole('link', { name: 'Catálogo', exact: true }).first().tap();
    await expect(page.getByRole('link', { name: brand })).toBeVisible();
    await captureForReview(page, '07-catalogo-com-registros');
  });

  test('[REQ-020] [REQ-027] [BR-025] fluxo completo a 390 px com toque: Concept → aprovação → Edition → Investor → Residence; cada tela sem overflow e com axe 0', async ({
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

    // Concept com a versão 1 (listas uma por linha).
    await page.getByRole('link', { name: 'Registrar Concept' }).tap();
    await expect(heading).toHaveText('Registrar Concept');
    await gate('09-registrar-concept');
    await page.getByLabel('Nome do Concept').fill('Casa do Pátio');
    await page.getByLabel('Elementos essenciais').fill('Pátio central\nFachada em pedra local');
    await page.getByLabel('Premissas de preservação').fill('Materiais regionais');
    await page.getByLabel('Especificação').fill('Especificação para implantação replicável.');
    await page.getByRole('button', { name: 'Registrar Concept' }).tap();
    await expect(heading).toHaveText('Casa do Pátio');
    await expect(page.getByText('Não aprovado', { exact: true })).toBeVisible();
    // Sem versão aprovada não há Edition (REQ-020).
    await expect(page.getByRole('link', { name: 'Registrar Edition' })).toHaveCount(0);
    await gate('10-concept-nao-aprovado');

    // Aprovação: revisão editorial da versão e referências das aprovações (REQ-096).
    await page.getByRole('link', { name: 'Versão 1' }).tap();
    await expect(heading).toHaveText('Aprovar versão 1');
    await expect(page.getByText('Fachada em pedra local')).toBeVisible();
    await gate('11-aprovar-versao');
    await page.getByLabel('Aprovações registradas').fill('Ata de aprovação 2026-09');
    await page.getByRole('button', { name: 'Aprovar versão 1' }).tap();
    await expect(status).toContainText('Versão aprovada.');
    await expect(page.getByText('Aprovado (versão 1)', { exact: true })).toBeVisible();

    // Edition com a modalidade escolhida explicitamente.
    await page.getByRole('link', { name: 'Registrar Edition' }).tap();
    await expect(heading).toHaveText('Registrar Edition');
    await gate('12-registrar-edition');
    await page.getByLabel('Região').fill('Litoral norte de São Paulo');
    await page.getByRole('radio', { name: /Owner e Co-Owner/ }).check();
    await page.getByLabel('Condições comerciais').fill('Condições registradas pela Luxtory.');
    await page.getByRole('button', { name: 'Registrar Edition' }).tap();
    await expect(heading).toHaveText('Casa do Pátio — Litoral norte de São Paulo');
    await gate('13-edition');

    // Autorização de Investor para o Concept (REQ-027).
    await page.getByRole('link', { name: 'Casa do Pátio', exact: true }).tap();
    await page.getByRole('link', { name: 'Registrar autorização de Investor' }).tap();
    await expect(heading).toHaveText('Registrar autorização de Investor');
    await gate('14-registrar-autorizacao');
    await page.getByLabel('Instrumento de autorização').fill('Contrato INV-001');
    await page.getByLabel('Início da vigência').fill('2026-01-01T00:00');
    await page.getByRole('button', { name: 'Registrar autorização' }).tap();
    await expect(page.getByRole('link', { name: 'Contrato INV-001' })).toBeVisible();
    await gate('15-concept-aprovado');

    // Residence com Investor: o registro fixa a versão vigente (BR-025).
    await page.getByRole('link', { name: 'Litoral norte de São Paulo' }).tap();
    await page.getByRole('link', { name: 'Registrar Residence' }).tap();
    await expect(heading).toHaveText('Registrar Residence');
    await expect(page.getByText('A versão 1 do Concept, vigente agora, será fixada')).toBeVisible();
    await gate('16-registrar-residence');
    await page.getByLabel('Referência interna').fill('Unidade 01');
    await page.getByLabel('Fuso horário da Residence').selectOption('America/Sao_Paulo');
    await page.getByLabel('Investor', { exact: true }).selectOption({ label: 'Contrato INV-001' });
    await page.getByRole('button', { name: 'Registrar Residence' }).tap();
    await expect(heading).toHaveText('Unidade 01');
    await expect(page.getByText('Versão 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Contrato INV-001')).toBeVisible();
    await gate('17-residence');

    // Revogação (ação destrutiva discreta) não muda a Residence registrada.
    await page.getByRole('link', { name: /Casa do Pátio — Litoral/ }).tap();
    await page.getByRole('link', { name: 'Casa do Pátio', exact: true }).tap();
    await page.getByRole('link', { name: 'Contrato INV-001' }).tap();
    await expect(heading).toHaveText('Revogar autorização de Investor');
    await gate('18-revogar-autorizacao');
    await page.getByLabel('Base da revogação').fill('Distrato 2026-09');
    await page.getByRole('button', { name: 'Revogar autorização' }).tap();
    await expect(status).toContainText('Autorização revogada.');
    await expect(page.getByText('Revogada', { exact: true })).toBeVisible();

    // Nova versão parte da mais recente e nasce não aprovada.
    await page.getByRole('link', { name: 'Nova versão' }).tap();
    await expect(heading).toHaveText('Nova versão');
    await expect(page.getByLabel('Especificação')).toHaveValue(
      'Especificação para implantação replicável.',
    );
    await gate('19-nova-versao');
    await page.getByRole('button', { name: 'Registrar versão' }).tap();
    await expect(page.getByRole('link', { name: 'Versão 2' })).toBeVisible();
  });

  test('[REQ-020] [REQ-100] [REQ-103] Coleção no Admin a 390 px com toque: vocabulário, classificação, capa, curadoria e valor de referência; cada tela sem overflow e com axe 0', async ({
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
    await gate('20-vocabularios');
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

    // Concept com classificação e atributos (spec catalog §13.12).
    const brand = unique('Maison Coleção');
    await page.goto('/admin/catalogo/brand-partners/nova');
    await page.getByLabel('Nome da marca').fill(brand);
    await page.getByRole('button', { name: 'Registrar Brand Partner' }).tap();
    await expect(heading).toHaveText(brand);
    await page.getByRole('link', { name: 'Registrar Concept' }).tap();
    await page.getByLabel('Nome do Concept').fill('Casa do Silêncio');
    await page.getByLabel('Elementos essenciais').fill('Pátio de pedra seca');
    await page.getByLabel('Premissas de preservação').fill('Materiais regionais');
    await page.getByLabel('Especificação').fill('Especificação para implantação replicável.');
    await page
      .getByRole('group', { name: 'Lifestyle' })
      .getByLabel('Principal')
      .selectOption({ label: lifestyle });
    await page
      .getByRole('group', { name: 'Estilo arquitetônico' })
      .getByLabel('Principal')
      .selectOption({ label: style });
    await page.getByLabel('Pessoas (no máximo)').fill('10');
    await page.getByLabel('Suítes').fill('5');
    await page.getByLabel('Área construída (m²)').fill('520');
    await gate('21-registrar-concept-colecao');
    await page.getByRole('button', { name: 'Registrar Concept' }).tap();
    await expect(heading).toHaveText('Casa do Silêncio');
    await page.getByRole('link', { name: 'Versão 1' }).tap();
    await page.getByLabel('Aprovações registradas').fill('Ata de aprovação 2026-10');
    await page.getByRole('button', { name: 'Aprovar versão 1' }).tap();
    // A versão vigente mostra a classificação e os atributos da Coleção.
    await expect(page.getByText(`${lifestyle} · ${style}`).first()).toBeVisible();
    await expect(page.getByText('Até 10 pessoas · 5 suítes · 520 m²').first()).toBeVisible();

    // Capa: arquivo pequeno é recusado no campo; o válido nasce pendente e é aprovado (ADR-0015).
    await page.getByRole('link', { name: 'Enviar capa' }).tap();
    await expect(heading).toHaveText('Enviar capa');
    await gate('22-enviar-capa');
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
    await expect(heading).toHaveText('Capa do Concept');
    await expect(status).toContainText('Registro concluído.');
    await expect(page.getByRole('img', { name: alt })).toBeVisible();
    await gate('23-capa-pendente');
    await page.getByRole('button', { name: 'Aprovar capa' }).tap();
    await expect(status).toContainText('Capa aprovada.');

    // Curadoria: destaque explícito, com capa aprovada.
    await page.getByRole('link', { name: 'Casa do Silêncio', exact: true }).tap();
    await page.getByRole('link', { name: 'Editar curadoria' }).tap();
    await expect(heading).toHaveText('Curadoria');
    await gate('24-curadoria');
    await page.getByLabel('Posição na curadoria').fill('2');
    await page.getByRole('radio', { name: 'Em destaque', exact: true }).check();
    await page.getByRole('button', { name: 'Salvar curadoria' }).tap();
    await expect(status).toContainText('Alterações salvas.');
    await expect(page.getByText('Em destaque', { exact: true })).toBeVisible();

    // Edition e valor de referência na base da Ação (Co-Owner), nunca por dia (REQ-100).
    await page.getByRole('link', { name: 'Registrar Edition' }).tap();
    await page.getByLabel('Região').fill('Serra da Mantiqueira');
    await page.getByRole('radio', { name: /Owner e Co-Owner/ }).check();
    await page.getByLabel('Condições comerciais').fill('Condições registradas pela Luxtory.');
    await page.getByRole('button', { name: 'Registrar Edition' }).tap();
    await expect(heading).toHaveText('Casa do Silêncio — Serra da Mantiqueira');
    await page.getByRole('link', { name: 'Registrar valor de referência' }).tap();
    await expect(heading).toHaveText('Registrar valor de referência');
    await gate('25-valor-de-referencia');
    await page.getByRole('radio', { name: 'Co-Owner · uma Ação' }).check();
    await page.getByLabel('Valor (R$)').fill('seiscentos mil');
    await page.getByRole('button', { name: 'Registrar valor' }).tap();
    await expect(page.getByText(/Digite o valor em reais/)).toBeVisible();
    await page.getByLabel('Valor (R$)').fill('620.000');
    await page.getByRole('button', { name: 'Registrar valor' }).tap();
    await expect(status).toContainText('Registro concluído.');
    const value = page.getByRole('link', { name: /Co-Owner · uma Ação — R\$\s620\.000/ });
    await expect(value).toBeVisible();
    await gate('26-edition-com-valor');
    await value.tap();
    await expect(heading).toHaveText('Encerrar valor de referência');
    await page.getByRole('button', { name: 'Encerrar agora' }).tap();
    await expect(status).toContainText('Vigência encerrada.');
    await expect(page.getByText('Encerrado', { exact: true })).toBeVisible();

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
