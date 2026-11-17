import { describe, expect, it } from 'vitest';
import {
  parseSecondHomePartnerContact,
  submitSecondHomePartnerContact,
} from '@/features/catalog/application/second-home-partner-contact';
import { composeSecondHomePartnerContactEmail } from '@/features/catalog/domain/second-home-partner-contact';
import { secondHomePartnersMessages } from '@/features/catalog/presentation/i18n/second-home-partners-pt-br';

// Contrato do formulário Second Home Partners (REQ-105, spec catalog §20.3): bordas que a rota não isola.

const VALID = {
  name: 'Ana',
  company: 'Incorporadora',
  email: 'ana@exemplo.test',
  development: 'Empreendimento, Trancoso',
  stage: 'planning_or_launch',
};

describe('contato Second Home Partners — schema e e-mail (REQ-105)', () => {
  it('[REQ-105] limites em pontos de código: 200 emojis cabem em Incorporadora, 201 não', () => {
    expect(parseSecondHomePartnerContact({ ...VALID, company: '😀'.repeat(200) }).ok).toBe(true);
    expect(parseSecondHomePartnerContact({ ...VALID, company: '😀'.repeat(201) })).toEqual({
      ok: false,
      issues: [{ field: 'company', code: 'too_long' }],
    });
  });

  it('[TECH-057] controles de linha, site com credenciais e fase vazia são recusados por campo, em ordem', () => {
    const result = parseSecondHomePartnerContact({
      ...VALID,
      name: 'Ana\r\nBcc: x@y.test',
      stage: '',
      website: 'https://user:pass@exemplo.test',
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: 'name', code: 'invalid' },
        { field: 'stage', code: 'required' },
        { field: 'website', code: 'invalid' },
      ],
    });
  });

  it('[REQ-105] opcionais vazios viram ausentes; a mensagem preserva quebras de linha; honeypot marca a tentativa', () => {
    const parsed = parseSecondHomePartnerContact({
      ...VALID,
      message: '  Linha 1\nLinha 2  ',
      website: '',
      _trap: 'x',
    });

    expect(parsed).toMatchObject({
      ok: true,
      trapped: true,
      contact: { message: 'Linha 1\nLinha 2', website: null },
    });
  });

  it('[REQ-105] o e-mail é determinístico e só traz o que foi enviado', () => {
    const parsed = parseSecondHomePartnerContact(VALID);
    if (!parsed.ok) throw new Error('contato válido recusado');
    const email = composeSecondHomePartnerContactEmail(
      parsed.contact,
      secondHomePartnersMessages.contactEmail,
    );

    expect(email).toEqual(
      composeSecondHomePartnerContactEmail(parsed.contact, secondHomePartnersMessages.contactEmail),
    );
    expect(email.text).toBe(
      [
        'Nome: Ana',
        'Incorporadora: Incorporadora',
        'E-mail: ana@exemplo.test',
        'Empreendimento e localização: Empreendimento, Trancoso',
        'Fase do empreendimento: Planejamento ou lançamento',
      ].join('\n'),
    );
  });

  it('[TECH-057] honeypot recusa sem chamar o provedor', async () => {
    let calls = 0;
    const result = await submitSecondHomePartnerContact(
      { ...VALID, _trap: 'robô' },
      '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10',
      {
        mailer: {
          send: () => {
            calls += 1;
            return Promise.resolve({ status: 'accepted' });
          },
        },
        namespace: 'luxtory:second-home-partner-contact:test',
        emailText: secondHomePartnersMessages.contactEmail,
      },
    );

    expect(result).toEqual({ status: 'refused' });
    expect(calls).toBe(0);
  });
});
