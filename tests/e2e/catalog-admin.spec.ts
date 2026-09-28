import { expect, test, type Page } from '@playwright/test';
import { signIn, STAFF_EMAIL, VISITOR_EMAIL } from './support/auth';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

// Catálogo no Admin (W3, docs/specs/catalog.md): telas sobre o App Shell, mobile-first com paridade (ADR-0009).
// O banco do E2E é compartilhado entre os testes: cada teste usa nomes próprios e não presume lista vazia.
const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

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
    test.slow();
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
    await expectResponsive(page, consoleErrors);
    await captureForReview(page, '06-brand-partner-encerrada');

    await page.getByRole('link', { name: 'Catálogo', exact: true }).first().tap();
    await expect(page.getByRole('link', { name: brand })).toBeVisible();
    await captureForReview(page, '07-catalogo-com-registros');
  });
});

test('[TECH-050] quem não tem papel Admin recebe 403 no catálogo e não vê o item de navegação', async ({
  page,
}) => {
  await signIn(page, VISITOR_EMAIL);
  await page.goto('/admin/catalogo');
  await expect(page.getByText('Acesso negado')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Catálogo' })).toHaveCount(0);
});
