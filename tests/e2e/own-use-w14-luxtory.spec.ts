import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  backdateE2eFormalization,
  freeE2eNights,
  setE2eLuxtorySelection,
  setE2eOwnUseBooking,
} from '../support/e2e-acquisition-database.mjs';
import {
  addDays,
  civilToday,
  FLOW_TIMEOUT_MS,
  formalizedCoOwner,
  gate,
  MOBILE,
  titularFor,
} from './support/own-use';
import { collectConsoleErrors } from './support/ui';

// W14 E4 (ADR-0030; specs calendar §9, admin §13, booking §11): seleção Luxtory, regras de convidados e declaração
// pelas telas reais, com o PostgreSQL real. K1 e K3 ligadas só neste banco descartável e desligadas no fim; a
// formalização é recuada por fixture histórica para a janela N+1 do exercício seguinte já ter aberto. Em série.
test.describe.configure({ mode: 'serial' });

const BOOKING_PATH = /\/titular\/reservas\/([0-9a-f-]{36})(\?.*)?$/;

/** Reserva pela tela da W12 (calendário → prévia do servidor → confirmação); devolve o id da página da reserva. */
async function bookOwnUse(titular: Page, label: string, checkin: string, checkout: string) {
  await titular.goto('/titular');
  await titular
    .locator('section[aria-labelledby="titular-own-use"]')
    .getByRole('link', { name: label })
    .tap();
  await titular.getByLabel('Entrada', { exact: true }).fill(checkin);
  await titular.getByLabel('Saída', { exact: true }).fill(checkout);
  await expect(titular.locator('.lx-booking__status')).toHaveText('Período disponível.');
  await titular.getByRole('button', { name: 'Confirmar reserva' }).tap();
  await expect(titular).toHaveURL(BOOKING_PATH);
  return BOOKING_PATH.exec(titular.url())![1]!;
}

test.describe('W14 E4 — seleção Luxtory, regras de convidados e declaração', () => {
  test.use(MOBILE);

  test('[REQ-016][REQ-036][REQ-095][REQ-092][ADR-0030] Admin seleciona e publica regras; Titular declara; K3 fechada sem formulário', async ({
    page,
    browser,
  }) => {
    test.setTimeout(FLOW_TIMEOUT_MS);
    const errors = collectConsoleErrors(page);
    const label = `Second Home W14 ${randomUUID().slice(0, 6)}`;
    const { home, acquirers } = await formalizedCoOwner(page, label);
    const year = Number(civilToday().slice(0, 4)) + 1;

    // K3 fechada: só leitura e o estado fechado, sem formulário.
    await page.goto(`/admin/catalogo/second-homes/${home}`);
    await page.getByRole('link', { name: 'Seleção Luxtory' }).tap();
    await expect(page.getByText('Seleção Luxtory ainda não ativada')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Selecionar noites' })).toHaveCount(0);
    await gate(page, errors, 'w14-01-selecao-fechada');

    await backdateE2eFormalization(home);
    await setE2eLuxtorySelection(true);
    try {
      const first = await freeE2eNights(home, year, 'media', 2);
      await page.reload();
      await expect(page.getByText(`Exercício ${year}`)).toBeVisible();
      const form = page.getByRole('form', { name: 'Selecionar noites' });
      await form.getByRole('button', { name: 'Selecionar noites' }).tap();
      await expect(form.getByRole('alert')).toContainText('Revise os campos indicados.');
      await expect(form.getByText('Escolha a finalidade.')).toBeVisible();
      await gate(page, errors, 'w14-02-selecao-erros');

      await form.getByLabel('Primeira noite').fill(first);
      await form.getByLabel('Última noite').fill(addDays(first, 1));
      await form.getByLabel('Manutenção programada').check();
      await form.getByLabel('Base registrada').fill('Ata sintética W14');
      await form.getByRole('checkbox', { name: /Confirmo a seleção/ }).check();
      await form.getByRole('button', { name: 'Selecionar noites' }).tap();
      await expect(page).toHaveURL(/selecao-luxtory\?feito=1$/);
      await expect(page.getByRole('status')).toContainText('Noites selecionadas');
      await expect(page.getByText('2 de 6 selecionadas')).toBeVisible();
      await gate(page, errors, 'w14-03-selecao-registrada');

      // As mesmas noites de novo: recusa funcional, nada gravado.
      const again = page.getByRole('form', { name: 'Selecionar noites' });
      await again.getByLabel('Primeira noite').fill(first);
      await again.getByLabel('Última noite').fill(first);
      await again.getByLabel('Marketing').check();
      await again.getByLabel('Base registrada').fill('Ata sintética W14');
      await again.getByRole('checkbox', { name: /Confirmo a seleção/ }).check();
      await again.getByRole('button', { name: 'Selecionar noites' }).tap();
      await expect(again.getByRole('alert')).toContainText('Há noite indisponível no intervalo');
      await expect(page.getByText('2 de 6 selecionadas')).toBeVisible();
    } finally {
      await setE2eLuxtorySelection(false);
    }

    // Regras de convidados: estado vazio → publicação → em vigor e histórico.
    await page.goto(`/admin/catalogo/second-homes/${home}`);
    await page.getByRole('link', { name: 'Regras de convidados' }).tap();
    await expect(page.getByText('Nenhuma regra em vigor')).toBeVisible();
    await gate(page, errors, 'w14-04-regras-vazias');
    const rules = page.getByRole('form', { name: 'Publicar nova versão' });
    await rules
      .getByLabel('Texto das regras')
      .fill(
        'Convidados seguem as regras desta Second Home.\n\nO Titular continua responsável pelo uso.',
      );
    await rules.getByLabel('Base registrada', { exact: true }).fill('Ata sintética W14 regras');
    await rules.getByRole('button', { name: 'Publicar versão' }).tap();
    await expect(page).toHaveURL(/regras-de-convidados\?feito=1$/);
    await expect(page.getByRole('status')).toContainText('Versão publicada');
    await expect(page.locator('section[aria-labelledby="em-vigor"]')).toContainText(
      'O Titular continua responsável pelo uso.',
    );
    await gate(page, errors, 'w14-05-regras-publicadas');

    // Titular: reserva (K1 só neste banco), regras vigentes e declaração.
    const { titular, context } = await titularFor(page, browser, acquirers[0]);
    const titularErrors = collectConsoleErrors(titular);
    await setE2eOwnUseBooking(true);
    try {
      const checkin = await freeE2eNights(home, year, 'media', 1);
      const bookingId = await bookOwnUse(titular, label, checkin, addDays(checkin, 1));
      await titular.getByRole('link', { name: 'Ver regras e declarar' }).tap();
      await expect(titular).toHaveURL(/\/convidados$/);
      await expect(titular.getByText('O Titular continua responsável pelo uso.')).toBeVisible();
      await gate(titular, titularErrors, 'w14-06-titular-regras');
      await titular.getByRole('button', { name: 'Declarar uso por convidados' }).tap();
      await expect(titular.getByText('Marque a declaração para continuar.')).toBeVisible();
      await titular.getByRole('checkbox').check();
      await titular.getByRole('button', { name: 'Declarar uso por convidados' }).tap();
      await expect(titular).toHaveURL(/convidados\?declarado=1$/);
      await expect(titular.getByText('Uso por convidados declarado')).toBeVisible();
      await expect(
        titular.getByRole('button', { name: 'Declarar uso por convidados' }),
      ).toHaveCount(0);
      await gate(titular, titularErrors, 'w14-07-titular-declarado');

      await page.goto(`/admin/reservas/${bookingId}`);
      await expect(page.locator('section[aria-labelledby="convidados-admin"]')).toContainText(
        'Uso por convidados declarado em',
      );
      await gate(page, errors, 'w14-08-admin-reserva');
    } finally {
      await setE2eOwnUseBooking(false);
      await context.close();
    }
  });
});
