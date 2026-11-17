import { describe, expect, it } from 'vitest';
import {
  parseSecondHomePartnerContact,
  submitSecondHomePartnerContact,
} from '@/features/catalog/application/second-home-partner-contact';
import { composeSecondHomePartnerContactEmail } from '@/features/catalog/domain/second-home-partner-contact';
import { secondHomePartnersMessages } from '@/features/catalog/presentation/i18n/second-home-partners-pt-br';

// Contrato do formulário Second Home Partners (REQ-105, spec catalog §20.3): bordas que a rota não isola.

const VALID = {
  profile: 'developer',
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
        'Qual é o seu perfil?: Incorporadora',
        'Nome: Ana',
        'Empresa: Incorporadora',
        'E-mail: ana@exemplo.test',
        'Empreendimento e localização: Empreendimento, Trancoso',
        'Fase do empreendimento: Planejamento ou lançamento',
      ].join('\n'),
    );
  });

  it.each(['agency', 'broker'])(
    '[REQ-105] %s usa região e não precisa de empreendimento nem fase',
    (profile) => {
      expect(
        parseSecondHomePartnerContact({
          profile,
          name: 'Ana',
          email: 'ana@exemplo.test',
          company: 'Empresa',
          region: '  Serra Gaúcha  ',
        }),
      ).toMatchObject({ ok: true, contact: { profile, region: 'Serra Gaúcha' } });
    },
  );

  it('[REQ-105] empresa é opcional somente para corretor; vazio é ausente no e-mail', () => {
    const broker = {
      profile: 'broker',
      name: 'Ana',
      email: 'ana@exemplo.test',
      region: 'Trancoso',
    };
    for (const company of [undefined, '', '  ']) {
      const parsed = parseSecondHomePartnerContact({
        ...broker,
        ...(company === undefined ? {} : { company }),
      });
      expect(parsed).toMatchObject({ ok: true, contact: { company: null } });
      if (!parsed.ok) throw new Error('corretor válido recusado');
      const email = composeSecondHomePartnerContactEmail(
        parsed.contact,
        secondHomePartnersMessages.contactEmail,
      );
      expect(email.text).toContain('Qual é o seu perfil?: Corretor(a)');
      expect(email.text).toContain('Cidade ou região de atuação: Trancoso');
      expect(email.text).not.toMatch(/Empresa:|Empreendimento|Fase|undefined|null/);
      expect(email.replyTo).toBe(broker.email);
    }
    expect(parseSecondHomePartnerContact({ ...broker, profile: 'agency' })).toEqual({
      ok: false,
      issues: [{ field: 'company', code: 'required' }],
    });
  });

  it('[REQ-105] não presume perfil e recusa campos exclusivos de outro perfil, mesmo vazios', () => {
    const legacy = Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== 'profile'));
    expect(parseSecondHomePartnerContact(legacy)).toEqual({
      ok: false,
      issues: [{ field: 'profile', code: 'required' }],
    });
    expect(parseSecondHomePartnerContact({ ...VALID, profile: 'unknown' })).toEqual({
      ok: false,
      issues: [{ field: 'profile', code: 'invalid' }],
    });
    expect(parseSecondHomePartnerContact({ ...VALID, region: '' }).ok).toBe(false);
    const broker = {
      profile: 'broker',
      name: 'Ana',
      email: 'ana@exemplo.test',
      region: 'Trancoso',
    };
    for (const extra of [{ development: '' }, { stage: '' }, { privateData: 'x' }]) {
      expect(parseSecondHomePartnerContact({ ...broker, ...extra }).ok).toBe(false);
    }
  });

  it('[REQ-105] região obrigatória, sem controles, com limite de 200 pontos de código', () => {
    const broker = { profile: 'broker', name: 'Ana', email: 'ana@exemplo.test' };
    for (const region of [undefined, ''])
      expect(parseSecondHomePartnerContact({ ...broker, region })).toEqual({
        ok: false,
        issues: [{ field: 'region', code: 'required' }],
      });
    expect(parseSecondHomePartnerContact({ ...broker, region: '😀'.repeat(200) }).ok).toBe(true);
    expect(parseSecondHomePartnerContact({ ...broker, region: '😀'.repeat(201) })).toEqual({
      ok: false,
      issues: [{ field: 'region', code: 'too_long' }],
    });
    expect(parseSecondHomePartnerContact({ ...broker, region: 'A\r\nBcc: x@y.test' })).toEqual({
      ok: false,
      issues: [{ field: 'region', code: 'invalid' }],
    });
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
