import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeContactMailer } from '@/features/catalog/infrastructure/fake-contact-mailer';
import {
  createMemoryRateLimiter,
  RateLimiterUnavailableError,
  withRoute,
  type EnvSource,
} from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';

const ORIGIN = 'https://luxtory.test';
const PREVIEW_ORIGIN = 'https://preview.luxtory.test';
const KEY = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const CORRELATION_ID = 'development-contact-test';
const FAKE_ENV = {
  SECOND_HOME_DEVELOPMENT_SITE: 'open',
  BRAND_PARTNERS_CONTACT_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  BRAND_PARTNERS_ALLOWED_ORIGINS: `${ORIGIN},${PREVIEW_ORIGIN}`,
  BRAND_PARTNERS_CONTACT_NETWORK_LIMIT: '10',
  BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS: '60',
  BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT: '100',
  BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS: '60',
} as const;
const LIVE_ENV = {
  ...FAKE_ENV,
  BRAND_PARTNERS_CONTACT_MODE: '',
  RESEND_API_KEY: 're_contact_test',
  BRAND_PARTNERS_CONTACT_FROM: 'Luxtory <sender@luxtory.test>',
  BRAND_PARTNERS_CONTACT_TO: 'brands@luxtory.test',
  SECOND_HOME_PARTNERS_CONTACT_TO: 'partners@luxtory.test',
  SECOND_HOME_DEVELOPMENT_CONTACT_TO: 'development@luxtory.test',
  UPSTASH_REDIS_REST_URL: 'https://upstash.luxtory.test',
  UPSTASH_REDIS_REST_TOKEN: 't'.repeat(24),
  BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS: '2000',
  BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS: '500',
} as const;
const CONTACT = {
  name: 'Ana Sigilosa',
  company: 'Incorporadora Confidencial',
  email: 'ana@exemplo.test',
  message: 'Gostaria de apresentar uma oportunidade.',
  website: 'https://empresa.exemplo.test',
};

async function setup({
  env = FAKE_ENV,
  mailer = createFakeContactMailer(),
  limiter = createMemoryRateLimiter({
    network: { limit: 20, windowSeconds: 60 },
    global: { limit: 100, windowSeconds: 60 },
  }),
  useResend = false,
}: {
  env?: EnvSource;
  mailer?: ReturnType<typeof createFakeContactMailer>;
  limiter?: ReturnType<typeof createMemoryRateLimiter>;
  useResend?: boolean;
} = {}) {
  const { createSecondHomeDevelopmentContactRoute } =
    await import('@/features/catalog/presentation/second-home-development-contact-route');
  const { logger, entries } = captureLogger();
  const route = withRoute(
    createSecondHomeDevelopmentContactRoute({ env, limiter, ...(useResend ? {} : { mailer }) }),
    logger,
  );
  const post = (body = JSON.stringify(CONTACT), headers?: HeadersInit) => {
    const requestHeaders = new Headers({
      origin: ORIGIN,
      host: new URL(ORIGIN).host,
      'content-type': 'application/json',
      'idempotency-key': KEY,
      'x-correlation-id': CORRELATION_ID,
    });
    new Headers(headers).forEach((value, name) => requestHeaders.set(name, value));
    return route(
      new Request(`${ORIGIN}/v1/second-home-development-contacts`, {
        method: 'POST',
        body,
        headers: requestHeaders,
      }),
    );
  };
  return { post, mailer, entries };
}

async function expectRejection(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-correlation-id')).toBe(CORRELATION_ID);
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  expect(await response.json()).toMatchObject({ code, correlation_id: CORRELATION_ID });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /v1/second-home-development-contacts (catalog §23, TECH-057, TECH-100)', () => {
  it('confirma 202 só com ID de aceite do Resend e repete com o mesmo conteúdo e chave', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ id: 'synthetic-email-id' }));
    vi.stubGlobal('fetch', fetch);
    const { post, entries } = await setup({ env: LIVE_ENV, useResend: true });

    await expectRejection(await post(), 503, 'ERR_UNAVAILABLE');
    const accepted = await post();
    expect(accepted.status).toBe(202);
    expect(accepted.headers.get('cache-control')).toBe('no-store');
    expect(accepted.headers.get('x-correlation-id')).toBe(CORRELATION_ID);
    expect(await accepted.json()).toEqual({ status: 'accepted' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [target, first] = fetch.mock.calls[0] ?? [];
    const [, second] = fetch.mock.calls[1] ?? [];
    expect(target).toBe('https://api.resend.com/emails');
    expect(second?.body).toBe(first?.body);
    const providerKey = `luxtory:second-home-development-contact:local:${KEY}`;
    expect(new Headers(first?.headers).get('idempotency-key')).toBe(providerKey);
    expect(new Headers(second?.headers).get('idempotency-key')).toBe(providerKey);
    expect(JSON.parse(String(first?.body))).toEqual({
      from: LIVE_ENV.BRAND_PARTNERS_CONTACT_FROM,
      to: [LIVE_ENV.SECOND_HOME_DEVELOPMENT_CONTACT_TO],
      subject: 'Second Home Development — mensagem pelo site',
      reply_to: CONTACT.email,
      text: expect.stringContaining(CONTACT.message),
    });
    const logs = JSON.stringify(entries());
    expect(logs).toContain(CORRELATION_ID);
    for (const privateValue of [...Object.values(CONTACT), KEY, LIVE_ENV.RESEND_API_KEY]) {
      expect(logs).not.toContain(privateValue);
    }
  });

  it('reutiliza o aceite da mesma submissão e recusa conteúdo diferente com a mesma chave', async () => {
    const { post, mailer } = await setup();
    const body = JSON.stringify({ ...CONTACT, website: undefined });
    expect((await post(body)).status).toBe(202);
    expect((await post(body)).status).toBe(202);
    const changed = JSON.stringify({ ...CONTACT, message: 'Outra oportunidade.' });
    await expectRejection(await post(changed), 409, 'ERR_IDEMPOTENCY_CONFLICT');
    expect(mailer.sent()).toBe(1);
  });

  it('respeita o portão próprio e exige o destinatário Development no modo real', async () => {
    for (const env of [
      { ...FAKE_ENV, SECOND_HOME_DEVELOPMENT_SITE: 'closed', SECOND_HOME_PARTNERS_SITE: 'open' },
      { ...LIVE_ENV, VERCEL_ENV: 'production', SECOND_HOME_DEVELOPMENT_SITE: undefined },
    ]) {
      const { post, mailer } = await setup({ env });
      await expectRejection(await post(), 404, 'ERR_NOT_FOUND');
      expect(mailer.sent()).toBe(0);
    }
    const closedPartners = await setup({
      env: { ...FAKE_ENV, SECOND_HOME_PARTNERS_SITE: 'closed' },
    });
    expect((await closedPartners.post()).status).toBe(202);

    const missing = await setup({
      env: { ...LIVE_ENV, SECOND_HOME_DEVELOPMENT_CONTACT_TO: undefined },
    });
    await expectRejection(await missing.post(), 503, 'ERR_UNAVAILABLE');
    expect(missing.mailer.sent()).toBe(0);
    expect(JSON.stringify(missing.entries())).toContain('SECOND_HOME_DEVELOPMENT_CONTACT_TO');
  });

  it('recusa fake na Vercel e novos envios quando o limitador estiver indisponível', async () => {
    const preview = await setup({ env: { ...FAKE_ENV, VERCEL_ENV: 'preview' } });
    await expectRejection(await preview.post(), 503, 'ERR_UNAVAILABLE');
    const unavailable = await setup({
      limiter: { consume: () => Promise.reject(new RateLimiterUnavailableError('backend')) },
    });
    await expectRejection(await unavailable.post(), 503, 'ERR_UNAVAILABLE');
    expect(unavailable.mailer.sent()).toBe(0);
  });

  it('recusa outra origem autorizada para outro host, tipo não JSON, corpo grande e honeypot', async () => {
    const { post, mailer } = await setup();
    await expectRejection(await post(undefined, { origin: PREVIEW_ORIGIN }), 403, 'ERR_PERMISSION');
    await expectRejection(await post(undefined, { origin: 'null' }), 403, 'ERR_PERMISSION');
    await expectRejection(
      await post(undefined, { 'content-type': 'text/plain' }),
      415,
      'ERR_UNSUPPORTED_MEDIA_TYPE',
    );
    await expectRejection(await post(' '.repeat(32 * 1024 + 1)), 413, 'ERR_PAYLOAD_TOO_LARGE');
    await expectRejection(
      await post(JSON.stringify({ ...CONTACT, _trap: 'robô' })),
      403,
      'ERR_PERMISSION',
    );
    expect(mailer.sent()).toBe(0);
  });

  it('valida campos obrigatórios, limites em pontos de código, site HTTP(S) e chave UUID', async () => {
    const { post, mailer } = await setup();
    for (const body of [
      { ...CONTACT, message: undefined },
      { ...CONTACT, message: ' ' },
      { ...CONTACT, name: 'n'.repeat(121) },
      { ...CONTACT, company: 'e'.repeat(161) },
      { ...CONTACT, email: `${'e'.repeat(254)}@exemplo.test` },
      { ...CONTACT, message: '😀'.repeat(2001) },
      { ...CONTACT, website: `https://example.test/${'s'.repeat(300)}` },
      { ...CONTACT, website: 'ftp://exemplo.test' },
      { ...CONTACT, profile: 'developer' },
    ]) {
      await expectRejection(await post(JSON.stringify(body)), 400, 'ERR_VALIDATION');
    }
    await expectRejection(
      await post(undefined, { 'idempotency-key': 'invalid' }),
      400,
      'ERR_VALIDATION',
    );
    expect(mailer.sent()).toBe(0);
    const maximum = { ...CONTACT, message: '😀'.repeat(2000) };
    expect((await post(JSON.stringify(maximum))).status).toBe(202);
  });

  it('conta recusas no limite e devolve Retry-After sem novo envio', async () => {
    const { post, mailer } = await setup({
      limiter: createMemoryRateLimiter({
        network: { limit: 10, windowSeconds: 60 },
        global: { limit: 1, windowSeconds: 60 },
      }),
    });
    await expectRejection(await post('{ JSON inválido'), 400, 'ERR_VALIDATION');
    const limited = await post();
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    await expectRejection(limited, 429, 'ERR_RATE_LIMITED');
    expect(mailer.sent()).toBe(0);
  });
});
