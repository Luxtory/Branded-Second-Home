import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  OwnUseAdminForm,
  type AdminFormAct,
} from '@/features/booking/presentation/own-use-admin-form';
import type { AdminActState } from '@/features/booking/presentation/own-use-admin-state';

// W13 E4b (spec booking §10.15): o HTML inicial dos atos do Admin. A troca de tipo, o erro que reflete o controle e o
// teclado rodam no navegador (E2E `own-use-lifecycle`); aqui, o que a página entrega antes de qualquer interação.
const render = (act: AdminFormAct, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(OwnUseAdminForm, {
      act,
      action: async (state: AdminActState) => state,
      idempotencyKey: '00000000-0000-4000-8000-000000000000',
      hidden: {},
      backHref: '/admin/reservas',
      ...extra,
    }),
  );

describe('W13 E4b — formulário dos atos do Admin', () => {
  it('[REQ-084][PD-010] Abrir exceção: sem tipo escolhido, nem motivo (P-A) nem referência (P-B); Base registrada sempre', () => {
    const html = render('open_exception');
    expect(html).toContain('name="type" value="operational"');
    expect(html).toContain('name="type" value="unauthorized_booking"');
    expect(html).not.toContain('name="reason"');
    expect(html).not.toContain('name="incident_ref"');
    expect(html).toContain('name="basis"');
    expect(html).not.toContain('aria-invalid');
  });

  it('[TECH-046] no-show: atestação desmarcada e sem erro antes do primeiro envio', () => {
    const html = render('no_show', { attest: 'no_show', destructive: true });
    expect(html).toContain('type="checkbox" name="attest"');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('attest-erro');
    expect(html).not.toContain('aria-invalid');
  });
});
