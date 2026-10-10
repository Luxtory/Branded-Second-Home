import { describe, expect, it, vi } from 'vitest';
import type { ContactMailer } from '@/features/catalog/application/brand-partner-contact';
import { createFakeContactMailer } from '@/features/catalog/infrastructure/fake-contact-mailer';
import { createBrandPartnerContactRoute } from '@/features/catalog/presentation/brand-partner-contact-route';
import {
  createMemoryRateLimiter,
  RateLimiterUnavailableError,
  withRoute,
  type RateLimiter,
} from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';
import { responseValidator } from '../../../support/openapi';

const PATH = '/brand-partner-contacts';
const ORIGIN = 'https://luxtory.test';
const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const OTHER_ATTEMPT_ID = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const IP = '203.0.113.7';

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
  brand: 'Marca Confidencial',
  email: 'ana.sigilosa@exemplo.test',
  message: 'Mensagem sigilosa do visitante.',
  website: 'https://marca-confidencial.test',
};

interface CallOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly mailer?: ContactMailer;
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
    createBrandPartnerContactRoute({ env: options.env ?? ENV, mailer, limiter }),
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
  return { call, mailer, limiter, logged: () => JSON.stringify(entries()), entries };
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

describe('POST /v1/brand-partner-contacts — aceite (REQ-028, TECH-057)', () => {
  it('[REQ-028] 202 só com aceite confirmado; corpo conforme o OpenAPI, no-store e sem CORS', async () => {
    const send = vi.fn(() => Promise.resolve({ status: 'accepted' as const }));
    const { call } = setup({ mailer: { send } });

    const response = await call();

    const body: unknown = await response.json();
    const valid = responseValidator(PATH, 'post', 202);
    expect(response.status).toBe(202);
    expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-correlation-id')).toBeTruthy();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: CONTACT.email }),
      `luxtory:brand-partner-contact:local:${ATTEMPT_ID}`,
    );
  });

  it('[TECH-057] replay com a mesma chave e o mesmo conteúdo = 202 sem novo envio', async () => {
    const mailer = createFakeContactMailer();
    const { call } = setup({ mailer });

    expect((await call()).status).toBe(202);
    expect((await call()).status).toBe(202);
    expect(mailer.sent()).toBe(1);
  });

  it('[TECH-057] mesma chave com outro conteúdo = 409; nova chave = nova tentativa explícita', async () => {
    const mailer = createFakeContactMailer();
    const { call } = setup({ mailer });
    const changed = JSON.stringify({ ...CONTACT, message: 'Outra mensagem.' });

    expect((await call()).status).toBe(202);
    await expectError(await call({ body: changed }), 409, 'ERR_IDEMPOTENCY_CONFLICT');
    expect(
      (await call({ body: changed, headers: { 'idempotency-key': OTHER_ATTEMPT_ID } })).status,
    ).toBe(202);
    expect(mailer.sent()).toBe(2);
  });
});

describe('POST /v1/brand-partner-contacts — publicação e configuração (catalog §14.1, §14.6)', () => {
  it('[REQ-028] superfície fechada = 404, independente de PUBLIC_SITE', async () => {
    for (const env of [
      { ...ENV, BRAND_PARTNERS_SITE: 'closed' },
      { ...ENV, BRAND_PARTNERS_CONTACT_MODE: '', VERCEL_ENV: 'production', PUBLIC_SITE: 'open' },
    ]) {
      const { call, mailer } = setup({ env });
      await expectError(await call(), 404, 'ERR_NOT_FOUND');
      expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
    }
  });

  it('[TECH-057] configuração ausente = 503 sem envio; o log nomeia só as chaves', async () => {
    const { call, logged } = setup({
      env: { BRAND_PARTNERS_SITE: 'open', BRAND_PARTNERS_CONTACT_MODE: 'fake' },
    });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(logged()).toContain('BRAND_PARTNERS_CONTACT_HMAC_SECRET');
  });

  it('[TECH-057] modo real sem Resend/Upstash configurados = 503 (falha fechada, sem simular sucesso)', async () => {
    const live = { ...ENV, BRAND_PARTNERS_CONTACT_MODE: '' };
    const { call, logged } = setup({ env: live });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(logged()).toContain('RESEND_API_KEY');
  });

  it('[TECH-057] adaptador determinístico é recusado na Vercel, inclusive em Preview', async () => {
    const { call } = setup({ env: { ...ENV, VERCEL_ENV: 'preview' } });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
  });
});

describe('POST /v1/brand-partner-contacts — borda e abuso (catalog §14.3–14.4)', () => {
  it('[TECH-057] Origin ausente, null ou de outro domínio = 403 — nunca derivada do Host', async () => {
    const { call, mailer } = setup();

    for (const origin of [null, 'null', 'https://evil.test', `${ORIGIN}/`, 'http://luxtory.test']) {
      await expectError(await call({ headers: { origin } }), 403, 'ERR_PERMISSION');
    }
    await expectError(
      await call({ headers: { origin: 'https://evil.test', host: 'evil.test' } }),
      403,
      'ERR_PERMISSION',
    );
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
    expect((await call({ headers: { origin: 'https://www.luxtory.test' } })).status).toBe(202);
  });

  it('[TECH-057] tipo de conteúdo diferente de JSON UTF-8 = 415', async () => {
    const { call } = setup();

    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'application/json; charset=latin1',
    ]) {
      await expectError(
        await call({ headers: { 'content-type': type } }),
        415,
        'ERR_UNSUPPORTED_MEDIA_TYPE',
      );
    }
    expect(
      (await call({ headers: { 'content-type': 'application/json; charset=UTF-8' } })).status,
    ).toBe(202);
  });

  it('[TECH-057] corpo acima de 32 KiB = 413, com ou sem Content-Length', async () => {
    const { call } = setup();
    const big = JSON.stringify({ ...CONTACT, message: 'x'.repeat(33 * 1024) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });

    const declared = String(new TextEncoder().encode(big).byteLength);
    await expectError(
      await call({ body: big, headers: { 'content-length': declared } }),
      413,
      'ERR_PAYLOAD_TOO_LARGE',
    );
    await expectError(await call({ body: big }), 413, 'ERR_PAYLOAD_TOO_LARGE');
    const unsized = await call({ body: stream, headers: { 'content-length': null } });
    await expectError(unsized, 413, 'ERR_PAYLOAD_TOO_LARGE');
  });

  it('[TECH-057] JSON inválido, campo extra e campos fora do contrato = 400 com nomes/códigos, nunca valores', async () => {
    const { call, mailer } = setup();

    await expectError(await call({ body: '{"name":' }), 400, 'ERR_VALIDATION');
    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, cnpj: '00.000.000/0001-00' }) }),
      400,
      'ERR_VALIDATION',
    );
    const body = await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, email: 'não-é-email', name: '' }) }),
      400,
      'ERR_VALIDATION',
    );
    expect(body).toMatchObject({
      fields: [
        { field: 'name', code: 'required' },
        { field: 'email', code: 'invalid' },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('não-é-email');
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
  });

  it('[TECH-057] Idempotency-Key ausente ou fora do formato UUID = 400 sem envio', async () => {
    const { call, mailer } = setup();

    await expectError(await call({ headers: { 'idempotency-key': null } }), 400, 'ERR_VALIDATION');
    await expectError(await call({ headers: { 'idempotency-key': 'abc' } }), 400, 'ERR_VALIDATION');
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
  });

  it('[TECH-057] honeypot preenchido = 403 sem envio e sem falso sucesso', async () => {
    const { call, mailer } = setup();

    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, _trap: 'preenchido' }) }),
      403,
      'ERR_PERMISSION',
    );
    expect((mailer as ReturnType<typeof createFakeContactMailer>).sent()).toBe(0);
  });

  it('[TECH-057] limite excedido = 429 com Retry-After; tentativas recusadas também contam', async () => {
    const limiter = createMemoryRateLimiter({
      network: { limit: 2, windowSeconds: 60 },
      global: { limit: 100, windowSeconds: 60 },
    });
    const { call } = setup({ limiter });

    await expectError(await call({ body: '{}' }), 400, 'ERR_VALIDATION');
    await expectError(
      await call({ body: JSON.stringify({ ...CONTACT, _trap: 'x' }) }),
      403,
      'ERR_PERMISSION',
    );
    const limited = await call();
    await expectError(limited, 429, 'ERR_RATE_LIMITED');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  it('[TECH-057] limitador indisponível = 503 sem envio (falha fechada)', async () => {
    const send = vi.fn(() => Promise.resolve({ status: 'accepted' as const }));
    const limiter: RateLimiter = {
      consume: () => Promise.reject(new RateLimiterUnavailableError('timeout')),
    };
    const { call } = setup({ limiter, mailer: { send } });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(send).not.toHaveBeenCalled();
  });

  it('[TECH-057] na Vercel, a origem de rede vem do metadado da plataforma, pseudonimizada por HMAC', async () => {
    const consume = vi.fn(() => Promise.resolve({ allowed: true as const }));
    const send = vi.fn(() => Promise.resolve({ status: 'accepted' as const }));
    const env = {
      ...ENV,
      BRAND_PARTNERS_CONTACT_MODE: '',
      VERCEL_ENV: 'preview',
      BRAND_PARTNERS_SITE: 'open',
    };
    // Modo real: a configuração do provedor e do Upstash existe, mas os adaptadores são os do teste.
    const live = {
      ...env,
      RESEND_API_KEY: 're_teste_123',
      BRAND_PARTNERS_CONTACT_FROM: 'Luxtory <contato@luxtory.test>',
      BRAND_PARTNERS_CONTACT_TO: 'caixa-teste@luxtory.test',
      UPSTASH_REDIS_REST_URL: 'https://redis.luxtory.test',
      UPSTASH_REDIS_REST_TOKEN: 't'.repeat(24),
      BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS: '5000',
      BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS: '1000',
    };
    const { call } = setup({ env: live, limiter: { consume }, mailer: { send } });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(consume).not.toHaveBeenCalled();

    expect((await call({ headers: { 'x-real-ip': IP } })).status).toBe(202);
    const [networkKey] = consume.mock.calls[0] as unknown as [string];
    expect(networkKey).not.toContain(IP);
    expect(networkKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      `luxtory:brand-partner-contact:preview:${ATTEMPT_ID}`,
    );
  });
});

describe('POST /v1/brand-partner-contacts — falhas do provedor e logs (TECH-057, TECH-100)', () => {
  it('[TECH-057] timeout ou indisponibilidade do provedor = 503, nunca sucesso', async () => {
    for (const reason of ['timeout', 'provider_rate_limited', 'provider_error'] as const) {
      const { call } = setup({
        mailer: { send: () => Promise.resolve({ status: 'unavailable', reason }) },
      });
      await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    }
  });

  it('[TECH-057] erro inesperado = 500 genérico; o log leva só o nome do erro', async () => {
    const { call, logged } = setup({
      mailer: { send: () => Promise.reject(new Error(`falhou com ${CONTACT.email}`)) },
    });

    const body = await expectError(await call(), 500, 'ERR_INTERNAL');
    expect(JSON.stringify(body)).not.toContain(CONTACT.email);
    expect(logged()).not.toContain(CONTACT.email);
    expect(logged()).toContain('"reason":"Error"');
  });

  it('[TECH-057] nenhum campo, corpo, IP, chave ou resposta bruta nos logs — em nenhum resultado', async () => {
    const { call, logged, entries } = setup();

    await call();
    await call({ body: JSON.stringify({ ...CONTACT, website: 'ftp://x' }) });
    await call({ body: JSON.stringify({ ...CONTACT, _trap: 'x' }) });
    await call({ headers: { origin: 'https://evil.test', 'x-real-ip': IP } });

    const text = logged();
    for (const secret of [
      CONTACT.name,
      CONTACT.brand,
      CONTACT.email,
      CONTACT.message,
      CONTACT.website,
      IP,
      ATTEMPT_ID,
      ENV.BRAND_PARTNERS_CONTACT_HMAC_SECRET,
    ]) {
      expect(text).not.toContain(secret);
    }
    for (const entry of entries()) {
      expect(Object.keys(entry).sort()).toEqual(
        ['correlation_id', 'duration_ms', 'event', 'level', 'msg', 'stage', 'status', 'time']
          .concat('reason' in entry ? ['reason'] : [])
          .sort(),
      );
    }
  });
});
