import { describe, expect, it, vi } from 'vitest';
import type {
  SecondHomePartnerContactMailer,
  SecondHomePartnerMailerOutcome,
} from '@/features/catalog/application/second-home-partner-contact';
import { createFakeContactMailer } from '@/features/catalog/infrastructure/fake-contact-mailer';
import { createSecondHomePartnerContactRoute } from '@/features/catalog/presentation/second-home-partner-contact-route';
import { createMemoryRateLimiter, withRoute, type RateLimiter } from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';
import { responseValidator } from '../../../support/openapi';

const PATH = '/second-home-partner-contacts';
const ORIGIN = 'https://luxtory.test';
const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const OTHER_ATTEMPT_ID = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

// Chaves reaproveitadas do contato Brand Partners (ADR-0028), em modo determinístico.
const ENV = {
  BRAND_PARTNERS_CONTACT_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  BRAND_PARTNERS_ALLOWED_ORIGINS: `${ORIGIN},https://www.luxtory.test`,
  BRAND_PARTNERS_CONTACT_NETWORK_LIMIT: '5',
  BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS: '60',
  BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT: '100',
  BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS: '60',
} as const;

const CONTACT = {
  name: 'Ana Sigilosa',
  company: 'Incorporadora Confidencial',
  email: 'ana.sigilosa@exemplo.test',
  development: 'Mirante Sigiloso, Trancoso',
  stage: 'planning_or_launch',
  message: 'Mensagem sigilosa do visitante.',
  website: 'https://incorporadora-confidencial.test',
};

/** O objeto sem as chaves indicadas. */
const without = (value: Readonly<Record<string, string>>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => !keys.includes(name)));

interface CallOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly mailer?: SecondHomePartnerContactMailer;
  readonly limiter?: RateLimiter;
  readonly headers?: Readonly<Record<string, string | null>>;
  readonly body?: BodyInit | null;
}

function setup(options: Omit<CallOptions, 'headers' | 'body'> = {}) {
  const { logger, entries } = captureLogger();
  const mailer = options.mailer ?? createFakeContactMailer();
  const limiter =
    options.limiter ??
    createMemoryRateLimiter({
      network: { limit: 5, windowSeconds: 60 },
      global: { limit: 100, windowSeconds: 60 },
    });
  const route = withRoute(
    createSecondHomePartnerContactRoute({ env: options.env ?? ENV, mailer, limiter }),
    logger,
  );
  const call = ({ headers = {}, body }: Pick<CallOptions, 'headers' | 'body'> = {}) => {
    const all = new Headers({
      origin: ORIGIN,
      'content-type': 'application/json',
      'idempotency-key': ATTEMPT_ID,
    });
    for (const [name, value] of Object.entries(headers)) {
      if (value === null) all.delete(name);
      else all.set(name, value);
    }
    // `duplex` é exigido pelo undici para corpo em stream (ainda fora do tipo RequestInit do DOM).
    const init = {
      method: 'POST',
      headers: all,
      body: body === undefined ? JSON.stringify(CONTACT) : body,
      duplex: 'half',
    } as RequestInit;
    return route(new Request(`${ORIGIN}/v1${PATH}`, init));
  };
  return { call, mailer, logged: () => JSON.stringify(entries()) };
}

async function expectError(response: Response, status: number, code: string) {
  const body: unknown = await response.json();
  const valid = responseValidator(PATH, 'post', status);
  expect(response.status).toBe(status);
  expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
  expect(body).toMatchObject({ code });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  return body;
}

describe('POST /v1/second-home-partner-contacts — aceite (REQ-105, TECH-057)', () => {
  it('[REQ-105] 202 só com aceite confirmado; e-mail próprio da jornada, no namespace próprio, conforme o OpenAPI', async () => {
    const send = vi.fn((): Promise<SecondHomePartnerMailerOutcome> =>
      Promise.resolve({ status: 'accepted' }),
    );
    const { call } = setup({ mailer: { send } });

    const response = await call();

    const body: unknown = await response.json();
    const valid = responseValidator(PATH, 'post', 202);
    expect(response.status).toBe(202);
    expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      {
        subject: 'Second Home Partners — mensagem pelo site',
        replyTo: CONTACT.email,
        text: [
          'Nome: Ana Sigilosa',
          'Incorporadora: Incorporadora Confidencial',
          'E-mail: ana.sigilosa@exemplo.test',
          'Empreendimento e localização: Mirante Sigiloso, Trancoso',
          'Fase do empreendimento: Planejamento ou lançamento',
          'Site: https://incorporadora-confidencial.test',
          '',
          'Mensagem:',
          'Mensagem sigilosa do visitante.',
        ].join('\n'),
      },
      `luxtory:second-home-partner-contact:local:${ATTEMPT_ID}`,
    );
  });

  it('[REQ-105] mensagem e site são opcionais: ausentes ou vazios não entram no e-mail', async () => {
    const send = vi.fn((): Promise<SecondHomePartnerMailerOutcome> =>
      Promise.resolve({ status: 'accepted' }),
    );
    const { call } = setup({ mailer: { send } });

    expect(
      (
        await call({
          body: JSON.stringify({ ...without(CONTACT, 'message', 'website'), message: '  ' }),
        })
      ).status,
    ).toBe(202);
    const [email] = send.mock.calls[0] as unknown as [{ readonly text: string }];
    expect(email.text).not.toMatch(/Mensagem|Site/);
  });

  it('[TECH-057] replay com a mesma chave e o mesmo conteúdo = 202 sem novo envio; outro conteúdo = 409', async () => {
    const mailer = createFakeContactMailer();
    const { call } = setup({ mailer });
    const changed = JSON.stringify({ ...CONTACT, message: 'Outra mensagem.' });

    expect((await call()).status).toBe(202);
    expect((await call()).status).toBe(202);
    await expectError(await call({ body: changed }), 409, 'ERR_IDEMPOTENCY_CONFLICT');
    expect(
      (await call({ body: changed, headers: { 'idempotency-key': OTHER_ATTEMPT_ID } })).status,
    ).toBe(202);
    expect(mailer.sent()).toBe(2);
  });
});

describe('POST /v1/second-home-partner-contacts — publicação e configuração (catalog §18.1, §18.4)', () => {
  it('[REQ-105] superfície fechada = 404, independente de PUBLIC_SITE e do portão Brand Partners', async () => {
    for (const env of [
      { ...ENV, SECOND_HOME_PARTNERS_SITE: 'closed', BRAND_PARTNERS_SITE: 'open' },
      { ...ENV, BRAND_PARTNERS_CONTACT_MODE: '', VERCEL_ENV: 'production', PUBLIC_SITE: 'open' },
    ]) {
      const { call, mailer } = setup({ env });
      await expectError(await call(), 404, 'ERR_NOT_FOUND');
      expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
    }
  });

  it('[TECH-057] configuração ausente = 503 sem envio; o log nomeia só as chaves', async () => {
    const { call, logged } = setup({ env: { BRAND_PARTNERS_CONTACT_MODE: 'fake' } });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(logged()).toContain('BRAND_PARTNERS_CONTACT_HMAC_SECRET');
  });

  it('[TECH-057] adaptador determinístico é recusado na Vercel, inclusive em Preview', async () => {
    const { call } = setup({ env: { ...ENV, VERCEL_ENV: 'preview' } });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
  });
});

describe('POST /v1/second-home-partner-contacts — borda e abuso (catalog §18.3–18.4)', () => {
  it('[TECH-057] Origin ausente ou de outro domínio = 403; tipo diferente de JSON = 415; corpo acima de 32 KiB = 413', async () => {
    const { call, mailer } = setup();

    await expectError(await call({ headers: { origin: null } }), 403, 'ERR_PERMISSION');
    await expectError(
      await call({ headers: { origin: 'https://evil.test' } }),
      403,
      'ERR_PERMISSION',
    );
    await expectError(
      await call({ headers: { 'content-type': 'text/plain' } }),
      415,
      'ERR_UNSUPPORTED_MEDIA_TYPE',
    );
    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, message: 'x'.repeat(33 * 1024) }) }),
      413,
      'ERR_PAYLOAD_TOO_LARGE',
    );
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
  });

  it('[REQ-105] fase ausente = required, fora da lista = invalid; campo extra = 400; só nomes e códigos', async () => {
    const { call, logged } = setup();

    const missing = await expectError(
      await call({ body: JSON.stringify({ ...without(CONTACT, 'stage'), company: '' }) }),
      400,
      'ERR_VALIDATION',
    );
    expect(missing).toMatchObject({
      fields: [
        { field: 'company', code: 'required' },
        { field: 'stage', code: 'required' },
      ],
    });
    const wrong = await expectError(
      await call({
        body: JSON.stringify({ ...CONTACT, stage: 'sold_out' }),
        headers: { 'idempotency-key': OTHER_ATTEMPT_ID },
      }),
      400,
      'ERR_VALIDATION',
    );
    expect(wrong).toMatchObject({ fields: [{ field: 'stage', code: 'invalid' }] });
    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, brand: 'Marca' }) }),
      400,
      'ERR_VALIDATION',
    );
    expect(logged()).not.toContain('Incorporadora Confidencial');
  });

  it('[TECH-057] Idempotency-Key ausente ou fora do formato = 400; honeypot preenchido = 403 sem envio', async () => {
    const { call, mailer } = setup();

    await expectError(await call({ headers: { 'idempotency-key': null } }), 400, 'ERR_VALIDATION');
    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, _trap: 'robô' }) }),
      403,
      'ERR_PERMISSION',
    );
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
  });

  it('[TECH-057] limite excedido = 429 com Retry-After; provedor indisponível = 503, nunca sucesso', async () => {
    const limited = setup({
      limiter: createMemoryRateLimiter({
        network: { limit: 1, windowSeconds: 60 },
        global: { limit: 100, windowSeconds: 60 },
      }),
    });
    expect((await limited.call()).status).toBe(202);
    const response = await limited.call({ headers: { 'idempotency-key': OTHER_ATTEMPT_ID } });
    await expectError(response, 429, 'ERR_RATE_LIMITED');
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);

    const failing = setup({
      mailer: { send: () => Promise.resolve({ status: 'unavailable', reason: 'timeout' }) },
    });
    await expectError(await failing.call(), 503, 'ERR_UNAVAILABLE');
  });

  it('[TECH-057] nenhum campo, corpo, chave ou resposta bruta nos logs', async () => {
    const { call, logged } = setup();

    await call();
    await call({ body: '{ inválido' });
    const log = logged();
    for (const value of [...Object.values(CONTACT), ATTEMPT_ID]) {
      expect(log).not.toContain(value);
    }
    expect(log).toContain('second_home_partner_contact');
  });
});
