import { describe, expect, it, vi } from 'vitest';
import {
  parseBrandPartnerContact,
  submitBrandPartnerContact,
  type ContactMailer,
} from '@/features/catalog/application/brand-partner-contact';
import {
  CONTACT_LIMITS,
  composeContactEmail,
  type ContactEmailText,
} from '@/features/catalog/domain/brand-partner-contact';

const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const TEXT: ContactEmailText = {
  subject: 'Assunto fixo',
  labels: {
    name: 'Nome',
    brand: 'Marca',
    email: 'E-mail',
    message: 'Mensagem',
    website: 'Site da marca',
  },
};

const valid = {
  name: '  Ana Teste  ',
  brand: 'Marca Fictícia',
  email: 'ana@exemplo.test',
  message: 'Primeira linha.\nSegunda linha.',
  website: 'https://exemplo.test/marca',
};

const acceptingMailer = (): ContactMailer & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn(() => Promise.resolve({ status: 'accepted' as const })),
});

describe('contrato do formulário Brand Partners (catalog §14.3)', () => {
  it('[REQ-028] aceita os cinco campos autorizados, com trim e quebras de linha preservadas', () => {
    const parsed = parseBrandPartnerContact(valid);

    expect(parsed).toEqual({
      ok: true,
      trapped: false,
      contact: {
        name: 'Ana Teste',
        brand: 'Marca Fictícia',
        email: 'ana@exemplo.test',
        message: 'Primeira linha.\nSegunda linha.',
        website: 'https://exemplo.test/marca',
      },
    });
  });

  it('[REQ-028] Site da marca é opcional: ausente ou vazio vira ausente', () => {
    const withoutSite = Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== 'website'),
    );
    expect(parseBrandPartnerContact(withoutSite)).toMatchObject({
      ok: true,
      contact: { website: null },
    });
    expect(parseBrandPartnerContact({ ...valid, website: '   ' })).toMatchObject({
      ok: true,
      contact: { website: null },
    });
  });

  it('[REQ-028] Nome, Marca, E-mail e Mensagem são obrigatórios (ausentes ou só espaços)', () => {
    const parsed = parseBrandPartnerContact({ name: ' ', message: '\n\n' });

    expect(parsed).toEqual({
      ok: false,
      issues: [
        { field: 'name', code: 'required' },
        { field: 'brand', code: 'required' },
        { field: 'email', code: 'required' },
        { field: 'message', code: 'required' },
      ],
    });
  });

  it('[TECH-057] limites em pontos de código Unicode depois do trim, não em unidades UTF-16', () => {
    const emoji = '😀';
    const atLimit = { ...valid, name: emoji.repeat(CONTACT_LIMITS.name) };
    const overLimit = { ...valid, name: `${'a'.repeat(CONTACT_LIMITS.name)}b` };

    expect(parseBrandPartnerContact(atLimit).ok).toBe(true);
    expect(parseBrandPartnerContact(overLimit)).toEqual({
      ok: false,
      issues: [{ field: 'name', code: 'too_long' }],
    });
    for (const field of ['brand', 'message'] as const) {
      const value = 'x'.repeat(CONTACT_LIMITS[field] + 1);
      expect(parseBrandPartnerContact({ ...valid, [field]: value })).toEqual({
        ok: false,
        issues: [{ field, code: 'too_long' }],
      });
    }
    const longSite = `https://exemplo.test/${'a'.repeat(CONTACT_LIMITS.website)}`;
    expect(parseBrandPartnerContact({ ...valid, website: longSite })).toEqual({
      ok: false,
      issues: [{ field: 'website', code: 'too_long' }],
    });
  });

  it('[TECH-057] e-mail válido, até 254 caracteres e sem CR/LF; não exige domínio corporativo', () => {
    expect(parseBrandPartnerContact({ ...valid, email: 'pessoa@gmail.com' }).ok).toBe(true);
    for (const email of ['sem-arroba', 'a@b', 'ana@exemplo.test\r\nBcc: x@y.test']) {
      expect(parseBrandPartnerContact({ ...valid, email })).toEqual({
        ok: false,
        issues: [{ field: 'email', code: 'invalid' }],
      });
    }
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.test`;
    expect(parseBrandPartnerContact({ ...valid, email: `${local}@${domain}` })).toMatchObject({
      ok: false,
      issues: [{ field: 'email', code: 'too_long' }],
    });
  });

  it('[TECH-057] site só HTTP/HTTPS, sem credenciais nem espaços', () => {
    for (const website of [
      'exemplo.test',
      'ftp://exemplo.test',
      'javascript:alert(1)',
      'https://usuario:senha@exemplo.test',
      'https://exemplo .test',
      'https:exemplo.test',
    ]) {
      expect(parseBrandPartnerContact({ ...valid, website }), website).toEqual({
        ok: false,
        issues: [{ field: 'website', code: 'invalid' }],
      });
    }
    expect(parseBrandPartnerContact({ ...valid, website: 'http://exemplo.test' }).ok).toBe(true);
  });

  it('[TECH-057] schema fechado: campo extra, anexo ou tipo errado é recusado', () => {
    expect(parseBrandPartnerContact({ ...valid, cnpj: '00.000.000/0001-00' }).ok).toBe(false);
    expect(parseBrandPartnerContact({ ...valid, attachments: [] }).ok).toBe(false);
    expect(parseBrandPartnerContact({ ...valid, name: 42 })).toEqual({
      ok: false,
      issues: [{ field: 'name', code: 'invalid' }],
    });
    expect(parseBrandPartnerContact('texto').ok).toBe(false);
    expect(parseBrandPartnerContact(null).ok).toBe(false);
  });

  it('[TECH-057] texto simples: controles fora de tab/quebra de linha são recusados', () => {
    expect(parseBrandPartnerContact({ ...valid, message: 'a\u0000b' }).ok).toBe(false);
    expect(parseBrandPartnerContact({ ...valid, name: 'Ana\nTeste' }).ok).toBe(false);
    expect(parseBrandPartnerContact({ ...valid, message: 'a\tb\r\nc' }).ok).toBe(true);
  });

  it('[TECH-057] honeypot preenchido é marcado; vazio ou ausente, não', () => {
    expect(parseBrandPartnerContact({ ...valid, _trap: 'robô' })).toMatchObject({
      ok: true,
      trapped: true,
    });
    expect(parseBrandPartnerContact({ ...valid, _trap: '' })).toMatchObject({ trapped: false });
  });
});

describe('e-mail determinístico (catalog §14.5)', () => {
  it('[TECH-057] assunto fixo, texto simples, Reply-To só com o e-mail validado; sem horário nem correlação', () => {
    const parsed = parseBrandPartnerContact(valid);
    if (!parsed.ok) throw new Error('fixture inválida');

    const email = composeContactEmail(parsed.contact, TEXT);

    expect(email).toEqual({
      subject: 'Assunto fixo',
      replyTo: 'ana@exemplo.test',
      text: [
        'Nome: Ana Teste',
        'Marca: Marca Fictícia',
        'E-mail: ana@exemplo.test',
        'Site da marca: https://exemplo.test/marca',
        '',
        'Mensagem:',
        'Primeira linha.',
        'Segunda linha.',
      ].join('\n'),
    });
    expect(composeContactEmail(parsed.contact, TEXT)).toEqual(email);
  });

  it('[TECH-057] sem site, a linha do site não aparece', () => {
    const parsed = parseBrandPartnerContact({ ...valid, website: '' });
    if (!parsed.ok) throw new Error('fixture inválida');

    expect(composeContactEmail(parsed.contact, TEXT).text).not.toContain('Site da marca');
  });
});

describe('submissão do contato (REQ-028, TECH-057)', () => {
  const deps = (mailer: ContactMailer) => ({ mailer, namespace: 'luxtory:teste', emailText: TEXT });

  it('[REQ-028] aceite só com o aceite confirmado do provedor, com a chave no namespace do ambiente', async () => {
    const mailer = acceptingMailer();

    await expect(submitBrandPartnerContact(valid, ATTEMPT_ID, deps(mailer))).resolves.toEqual({
      status: 'accepted',
    });
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'ana@exemplo.test' }),
      `luxtory:teste:${ATTEMPT_ID}`,
    );
  });

  it('[REQ-028] falha do provedor não vira sucesso; conflito de chave é devolvido', async () => {
    const timeout: ContactMailer = {
      send: () => Promise.resolve({ status: 'unavailable', reason: 'timeout' }),
    };
    const conflict: ContactMailer = { send: () => Promise.resolve({ status: 'conflict' }) };

    await expect(submitBrandPartnerContact(valid, ATTEMPT_ID, deps(timeout))).resolves.toEqual({
      status: 'unavailable',
      reason: 'timeout',
    });
    await expect(submitBrandPartnerContact(valid, ATTEMPT_ID, deps(conflict))).resolves.toEqual({
      status: 'conflict',
    });
  });

  it('[TECH-057] chave ausente ou fora do formato UUID é inválida, sem envio', async () => {
    const mailer = acceptingMailer();

    for (const key of ['', 'chave-qualquer', `${ATTEMPT_ID}x`]) {
      await expect(submitBrandPartnerContact(valid, key, deps(mailer))).resolves.toEqual({
        status: 'invalid',
        issues: [],
      });
    }
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('[TECH-057] honeypot recusa sem envio e sem falso sucesso; corpo inválido não envia', async () => {
    const mailer = acceptingMailer();

    await expect(
      submitBrandPartnerContact({ ...valid, _trap: 'x' }, ATTEMPT_ID, deps(mailer)),
    ).resolves.toEqual({ status: 'refused' });
    await expect(
      submitBrandPartnerContact({ ...valid, email: '' }, ATTEMPT_ID, deps(mailer)),
    ).resolves.toEqual({
      status: 'invalid',
      issues: [{ field: 'email', code: 'required' }],
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
