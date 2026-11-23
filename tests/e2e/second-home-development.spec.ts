import { expect, test, type Page } from '@playwright/test';
import { captureForReview, collectConsoleErrors, expectResponsive } from './support/ui';

const PAGE = '/Second-Home-Development';
const PARTNERS = '/second-home-partner';
const CONTACT = '/v1/second-home-development-contacts';
const PRODUCTION = 'http://127.0.0.1:3102';
const HEADLINE = 'Second Homes extraordinárias. Desenvolvidas sob demanda.';

async function fillContact(page: Page) {
  const form = page.locator('#conversa form');
  await form.getByLabel('Nome').fill('Ana Teste');
  await form.getByLabel('Empresa', { exact: true }).fill('Projeto de teste');
  await form.getByLabel('E-mail').fill('ana@example.test');
  await form.getByLabel('Mensagem').fill('Gostaríamos de avaliar um projeto em fase de estudo.');
  return form;
}

test('a proposta B2B tem a rota canônica, as modalidades e as seis etapas (catalog §23)', async ({
  page,
}) => {
  expect((await page.goto(PAGE))?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', PAGE);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('#para-quem-vive h3')).toContainText([
    'Patrimônio',
    'Liberdade',
    'Pertencimento',
    'Formas de aquisição',
  ]);
  await expect(page.locator('#para-quem-vive h4')).toHaveText(['Owner', 'Co-Owner']);
  await expect(page.locator('#como-funciona .lx-numbered > li')).toHaveCount(6);
  await expect(page.locator('#governanca h3')).toHaveCount(5);
  await expect(
    page.locator('#inicio').getByRole('link', { name: 'Conversar sobre uma oportunidade' }),
  ).toHaveAttribute('href', '#conversa');
});

test.describe('jornada em celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Partners encaminha à nova rota entre os cards e as soluções, com acesso por toque', async ({
    page,
  }) => {
    await page.goto(PARTNERS);
    await expect(page.locator('#empreendimentos h3').first()).toHaveText('Imóveis em condomínios');
    await expect(page.locator('#empreendimentos img')).toHaveCount(3);
    await expect(page.locator('#empreendimentos + #desenvolvimento + #solucoes')).toHaveCount(1);
    await page
      .locator('#desenvolvimento')
      .getByRole('link', { name: 'Conheça Second Home Development' })
      .tap();
    await expect(page).toHaveURL(new RegExp(PAGE + '$'));

    const question = page.locator('#perguntas details').first();
    const control = question.locator('summary');
    await control.focus();
    await page.keyboard.press('Enter');
    await expect(question).toHaveAttribute('open', '');
    await page
      .locator('#inicio')
      .getByRole('link', { name: 'Conversar sobre uma oportunidade' })
      .tap();
    await expect(page).toHaveURL(/#conversa$/);
    await expect(page.locator('#conversa form')).toBeVisible();
  });
});

test('portão de produção protege rota, metadados e contato, com Partners ainda acessível', async ({
  request,
}) => {
  const page = await request.get(PRODUCTION + PAGE);
  expect(page.status()).toBe(404);
  expect(await page.text()).not.toContain(HEADLINE);
  expect((await request.post(PRODUCTION + CONTACT)).status()).toBe(404);

  const partners = await request.get(PRODUCTION + PARTNERS);
  expect(partners.status()).toBe(200);
  expect(await partners.text()).not.toContain('Conheça Second Home Development');
});

test('o contato preserva a mensagem e a chave ao repetir após falha', async ({ page }) => {
  await page.goto(PAGE);
  const form = await fillContact(page);
  const keys: string[] = [];
  await page.route(`**${CONTACT}`, async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (keys.length === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else {
      await route.continue();
    }
  });

  const submit = form.getByRole('button', { name: 'Enviar mensagem' });
  await submit.click();
  await expect(form.getByText(/Envio sem confirmação/)).toBeVisible();
  await expect(form.getByLabel('Mensagem')).toHaveValue(
    'Gostaríamos de avaliar um projeto em fase de estudo.',
  );
  const accepted = page.waitForResponse(
    (response) => response.url().endsWith(CONTACT) && response.status() === 202,
  );
  await submit.click();
  await accepted;
  await expect(page.locator('#conversa')).toContainText('Mensagem enviada.');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(keys[1]).toBe(keys[0]);
});

test('acessibilidade, contraste e reflow da página de 320 a 1920 px (ADR-0009)', async ({
  page,
}) => {
  test.slow();
  const errors = collectConsoleErrors(page);
  await page.goto(PAGE);
  await expectResponsive(page, errors);
  await captureForReview(page, 'second-home-development');
});
