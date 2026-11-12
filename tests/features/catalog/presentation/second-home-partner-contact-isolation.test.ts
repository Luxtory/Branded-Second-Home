import { describe, expect, it, vi } from 'vitest';
import type { ContactMailer } from '@/features/catalog/application/brand-partner-contact';
import { createBrandPartnerContactRoute } from '@/features/catalog/presentation/brand-partner-contact-route';
import { createSecondHomePartnerContactRoute } from '@/features/catalog/presentation/second-home-partner-contact-route';
import { createMemoryRateLimiter, withRoute } from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';

// Isolamento entre os contatos Brand Partners e Second Home Partners (ADR-0028, catalog §18.4): as chaves de
// configuração são compartilhadas, mas portões, contadores, chaves de idempotência, destinatários e falhas não.

const upstashNamespaces = vi.hoisted(() => [] as string[]);
vi.mock('@/features/platform', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/platform')>();
  return {
    ...original,
    createUpstashRateLimiter: (
      options: Parameters<typeof original.createUpstashRateLimiter>[0],
    ) => {
      upstashNamespaces.push(options.namespace);
      return original.createUpstashRateLimiter(options);
    },
  };
});

const ORIGIN = 'https://luxtory.test';
const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';

const FAKE_ENV = {
  BRAND_PARTNERS_CONTACT_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  BRAND_PARTNERS_ALLOWED_ORIGINS: ORIGIN,
  BRAND_PARTNERS_CONTACT_NETWORK_LIMIT: '2',
  BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS: '60',
  BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT: '100',
  BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS: '60',
} as const;

/** Modo real com todas as chaves, valores sintéticos; os adaptadores são injetados depois da configuração validada. */
const LIVE_ENV = {
  ...FAKE_ENV,
  BRAND_PARTNERS_CONTACT_MODE: '',
  RESEND_API_KEY: 're_sintetica_123',
  BRAND_PARTNERS_CONTACT_FROM: 'Luxtory <contato@luxtory.test>',
  BRAND_PARTNERS_CONTACT_TO: 'brand-partners@luxtory.test',
  SECOND_HOME_PARTNERS_CONTACT_TO: 'incorporadoras@luxtory.test',
  UPSTASH_REDIS_REST_URL: 'https://upstash.luxtory.test',
  UPSTASH_REDIS_REST_TOKEN: 't'.repeat(24),
  BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS: '2000',
  BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS: '500',
} as const;

const BP_BODY = {
  name: 'Ana',
  brand: 'Marca',
  email: 'ana@exemplo.test',
  message: 'Olá.',
};
const SHP_BODY = {
  name: 'Ana',
  company: 'Incorporadora',
  email: 'ana@exemplo.test',
  development: 'Empreendimento, Trancoso',
  stage: 'construction_or_sales',
};

type Env = Readonly<Record<string, string>>;
interface Adapters {
  readonly mailer?: ContactMailer;
  readonly limiter?: ReturnType<typeof createMemoryRateLimiter>;
}

function request(path: string, body: object, key = ATTEMPT_ID) {
  return new Request(`${ORIGIN}/v1${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  });
}

function brandPartners(env: Env, adapters: Adapters = {}) {
  const route = withRoute(
    createBrandPartnerContactRoute({ env, ...adapters }),
    captureLogger().logger,
  );
  return (body: object = BP_BODY, key?: string) =>
    route(request('/brand-partner-contacts', body, key));
}

function secondHomePartners(env: Env, adapters: Adapters = {}) {
  const { logger, entries } = captureLogger();
  const route = withRoute(createSecondHomePartnerContactRoute({ env, ...adapters }), logger);
  const call = (body: object = SHP_BODY, key?: string) =>
    route(request('/second-home-partner-contacts', body, key));
  return Object.assign(call, { logged: () => JSON.stringify(entries()) });
}

/** Limitador novo por chamada: só o teste de limite usa os adaptadores determinísticos padrão de cada rota. */
const fresh = () =>
  createMemoryRateLimiter({
    network: { limit: 10, windowSeconds: 60 },
    global: { limit: 100, windowSeconds: 60 },
  });

/** Um único provedor compartilhado (como a conta Resend): registra chave e destinatário lógico de cada envio. */
function sharedProvider() {
  const sent = new Map<string, string>();
  const mailer: ContactMailer = {
    send(email, providerKey) {
      const previous = sent.get(providerKey);
      if (previous !== undefined && previous !== email.text) {
        return Promise.resolve({ status: 'conflict' });
      }
      sent.set(providerKey, email.text);
      return Promise.resolve({ status: 'accepted' });
    },
  };
  return { mailer, keys: () => [...sent.keys()] };
}

describe('isolamento entre os contatos Brand Partners e Second Home Partners (ADR-0028)', () => {
  it('[REQ-105] portões independentes: cada jornada abre e fecha sem afetar a outra', async () => {
    const shpOnly = {
      ...FAKE_ENV,
      SECOND_HOME_PARTNERS_SITE: 'open',
      BRAND_PARTNERS_SITE: 'closed',
    };
    expect((await secondHomePartners(shpOnly, { limiter: fresh() })()).status).toBe(202);
    expect((await brandPartners(shpOnly, { limiter: fresh() })()).status).toBe(404);

    const bpOnly = {
      ...FAKE_ENV,
      SECOND_HOME_PARTNERS_SITE: 'closed',
      BRAND_PARTNERS_SITE: 'open',
    };
    expect((await secondHomePartners(bpOnly, { limiter: fresh() })()).status).toBe(404);
    expect((await brandPartners(bpOnly, { limiter: fresh() })()).status).toBe(202);
  });

  it('[TECH-057] esgotar o limite de uma jornada não gera 429 na outra', async () => {
    const env = { ...FAKE_ENV, SECOND_HOME_PARTNERS_SITE: 'open', BRAND_PARTNERS_SITE: 'open' };
    const bp = brandPartners(env);
    const keys = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ];
    const statuses = [];
    for (const key of keys) statuses.push((await bp(BP_BODY, key)).status);

    expect(statuses.at(-1)).toBe(429);
    expect((await secondHomePartners(env)()).status).toBe(202);
  });

  it('[TECH-057] o modo real cria o limitador Upstash no namespace próprio de cada jornada', async () => {
    upstashNamespaces.length = 0;
    const provider = sharedProvider();
    const limiter = createMemoryRateLimiter({
      network: { limit: 10, windowSeconds: 60 },
      global: { limit: 100, windowSeconds: 60 },
    });
    const env = { ...LIVE_ENV, SECOND_HOME_PARTNERS_SITE: 'open', BRAND_PARTNERS_SITE: 'open' };

    expect((await brandPartners(env, { mailer: provider.mailer, limiter })()).status).toBe(202);
    expect((await secondHomePartners(env, { mailer: provider.mailer, limiter })()).status).toBe(
      202,
    );
    expect(upstashNamespaces).toEqual([
      'luxtory:brand-partner-contact:local',
      'luxtory:second-home-partner-contact:local',
    ]);
  });

  it('[TECH-057] a mesma Idempotency-Key nos dois endpoints, num provedor compartilhado, não gera 409 cruzado', async () => {
    const provider = sharedProvider();
    const env = { ...FAKE_ENV, SECOND_HOME_PARTNERS_SITE: 'open', BRAND_PARTNERS_SITE: 'open' };

    expect((await brandPartners(env, { mailer: provider.mailer, limiter: fresh() })()).status).toBe(
      202,
    );
    expect(
      (await secondHomePartners(env, { mailer: provider.mailer, limiter: fresh() })()).status,
    ).toBe(202);
    expect(provider.keys()).toEqual([
      `luxtory:brand-partner-contact:local:${ATTEMPT_ID}`,
      `luxtory:second-home-partner-contact:local:${ATTEMPT_ID}`,
    ]);
  });

  it('[REQ-105] assunto próprio; o corpo do formulário Brand Partners é recusado pelo contrato novo', async () => {
    const subjects: string[] = [];
    const mailer: ContactMailer = {
      send(email) {
        subjects.push(email.subject);
        return Promise.resolve({ status: 'accepted' });
      },
    };
    const env = { ...FAKE_ENV, SECOND_HOME_PARTNERS_SITE: 'open' };
    const shp = secondHomePartners(env, { mailer, limiter: fresh() });

    expect((await shp()).status).toBe(202);
    expect((await shp(BP_BODY, '44444444-4444-4444-8444-444444444444')).status).toBe(400);
    expect(subjects).toEqual(['Second Home Partners — mensagem pelo site']);
  });

  it('[TECH-057] sem SECOND_HOME_PARTNERS_CONTACT_TO só o contato novo recusa (503, nomeando a chave); Brand Partners segue', async () => {
    const withoutTo = Object.fromEntries(
      Object.entries(LIVE_ENV).filter(([name]) => name !== 'SECOND_HOME_PARTNERS_CONTACT_TO'),
    );
    const env = { ...withoutTo, SECOND_HOME_PARTNERS_SITE: 'open', BRAND_PARTNERS_SITE: 'open' };
    const provider = sharedProvider();
    const shp = secondHomePartners(env, { mailer: provider.mailer, limiter: fresh() });

    expect((await shp()).status).toBe(503);
    expect(shp.logged()).toContain('SECOND_HOME_PARTNERS_CONTACT_TO');
    expect((await brandPartners(env, { mailer: provider.mailer, limiter: fresh() })()).status).toBe(
      202,
    );
  });
});
