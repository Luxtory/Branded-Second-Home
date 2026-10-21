import { describe, expect, it, vi } from 'vitest';
import type {
  InterestStore,
  InterestTarget,
  InterestTargets,
} from '@/features/ownership/application/ports';
import { createInterestRoute } from '@/features/ownership/presentation/interest-route';
import {
  PRIVACY_NOTICE_TOPICS,
  type PrivacyNotice,
} from '@/features/ownership/domain/privacy-notice';
import {
  createMemoryRateLimiter,
  PublicAttemptUnverifiableError,
  RateLimiterUnavailableError,
  withRoute,
  type RateLimiter,
} from '@/features/platform';
import { captureLogger } from '../../../support/capture-logger';
import {
  coOwnerBody,
  INTEREST_SECRETS,
  presentationContext,
  SENTINEL_CONTACT,
} from '../../../support/interest-fixtures';
import { responseValidator } from '../../../support/openapi';

// Borda HTTP do POST /v1/interests (spec ownership §5, §14) com adaptadores falsos; o registro em PostgreSQL real está
// em tests/features/ownership/interest.db.test.ts.
const PATH = '/interests';
const HOST = 'luxtory.test';
const ORIGIN = `https://${HOST}`;
const ATTEMPT_ID = '0f8b8a4e-3c1d-4f6a-9b2e-7d5c4b3a2f10';
const HOME_CONCEPT = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const HOME_EDITION = '66666666-7777-4888-9999-aaaaaaaaaaaa';

const ENV = {
  INTEREST_LIMITER_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  ...INTEREST_SECRETS,
  INTEREST_NETWORK_LIMIT: '5',
  INTEREST_NETWORK_WINDOW_SECONDS: '60',
  INTEREST_GLOBAL_LIMIT: '100',
  INTEREST_GLOBAL_WINDOW_SECONDS: '60',
} as const;

/** Ambiente sem a chave `key` (chave ausente = não configurada). */
function omit(env: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => name !== key));
}

// Valores sensíveis de propósito: nenhum deles pode aparecer em log ou resposta (inclusive o contato sentinela).
const INTEREST = coOwnerBody(HOME_EDITION, {
  desired_location: 'Rua Sigilosa 123, Ana Sigilosa',
  origin: 'telefone 11 99999-0000',
  partner_ref: 'Parceiro Confidencial',
});

/** Aviso estruturalmente completo, texto fictício de teste — só para exercitar o portão. */
const APPROVED: PrivacyNotice = {
  status: 'approved',
  version: 'fixture-1',
  approvedOn: '2026-10-20',
  sections: PRIVACY_NOTICE_TOPICS.map((topic) => ({
    topic,
    title: `Título de teste ${topic}`,
    paragraphs: [`Parágrafo de teste ${topic}.`],
    links: topic === 'channel' ? [{ label: 'Canal', href: 'mailto:canal@example.com' }] : [],
  })),
};

/** JSON com cada unidade UTF-16 fora do ASCII escapada como `\uXXXX` (o pior caso em bytes do mesmo conteúdo). */
function escapedJson(value: unknown): string {
  const json = JSON.stringify(value);
  let escaped = '';
  for (let index = 0; index < json.length; index += 1) {
    const unit = json.charCodeAt(index);
    escaped += unit < 0x80 ? json.charAt(index) : `\\u${unit.toString(16).padStart(4, '0')}`;
  }
  return escaped;
}

const TARGET: InterestTarget = { homeEditionId: HOME_EDITION, homeConceptId: HOME_CONCEPT };

interface SetupOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly notice?: PrivacyNotice;
  readonly limiter?: RateLimiter;
  readonly store?: InterestStore;
  readonly target?: InterestTarget | null;
}

function setup(options: SetupOptions = {}) {
  const { logger, entries } = captureLogger();
  const store: InterestStore = options.store ?? {
    priorAttempt: vi.fn(() => Promise.resolve(null)),
    register: vi.fn(() => Promise.resolve('registered' as const)),
  };
  const targets: InterestTargets = {
    find: vi.fn(() => Promise.resolve(options.target === undefined ? TARGET : options.target)),
  };
  // `limiter: undefined` explícito = sem injeção: a rota monta o limitador do ambiente.
  const limiter = Object.hasOwn(options, 'limiter')
    ? options.limiter
    : createMemoryRateLimiter({
        network: { limit: 5, windowSeconds: 60 },
        global: { limit: 100, windowSeconds: 60 },
      });
  const route = withRoute(
    createInterestRoute({
      env: options.env ?? ENV,
      ...(options.notice === undefined ? {} : { notice: options.notice }),
      limiter,
      store,
      targets,
    }),
    logger,
  );
  const call = ({
    headers = {},
    body,
  }: { headers?: Readonly<Record<string, string | null>>; body?: BodyInit | null } = {}) => {
    const all = new Headers({
      host: HOST,
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
      body: body === undefined ? JSON.stringify(INTEREST) : body,
      duplex: 'half',
    } as RequestInit;
    return route(new Request(`${ORIGIN}/v1${PATH}`, init));
  };
  return { call, store, targets, logged: () => JSON.stringify(entries()), entries };
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

function expectNoEffect(store: InterestStore) {
  expect(store.priorAttempt).not.toHaveBeenCalled();
  expect(store.register).not.toHaveBeenCalled();
}

describe('POST /v1/interests — registro (REQ-022–REQ-025)', () => {
  it('[REQ-023] 201 conforme o OpenAPI, sem id interno, no-store e sem CORS', async () => {
    const { call, store } = setup();

    const response = await call();

    const body: unknown = await response.json();
    const valid = responseValidator(PATH, 'post', 201);
    expect(response.status).toBe(201);
    expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
    expect(body).toEqual({ status: 'registered' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('idempotency-replayed')).toBeNull();
    expect(response.headers.get('x-correlation-id')).toBeTruthy();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(store.register).toHaveBeenCalledOnce();
  });

  it('[TECH-056] repetição da mesma tentativa: 201 com idempotency-replayed', async () => {
    const { call } = setup({
      store: {
        priorAttempt: vi.fn(() => Promise.resolve('replayed' as const)),
        register: vi.fn(),
      },
    });

    const response = await call();

    expect(response.status).toBe(201);
    expect(response.headers.get('idempotency-replayed')).toBe('true');
    expect(await response.json()).toEqual({ status: 'registered' });
  });

  it('[TECH-056] mesma chave com outro conteúdo → 409 ERR_IDEMPOTENCY_CONFLICT', async () => {
    const { call } = setup({
      store: {
        priorAttempt: vi.fn(() => Promise.resolve('conflict' as const)),
        register: vi.fn(),
      },
    });

    await expectError(await call(), 409, 'ERR_IDEMPOTENCY_CONFLICT');
  });

  it('[REQ-022] Home Edition não pública → 404, sem gravar', async () => {
    const { call, store } = setup({ target: null });

    await expectError(await call(), 404, 'ERR_NOT_FOUND');
    expect(store.register).not.toHaveBeenCalled();
  });
});

describe('POST /v1/interests — validação sem eco (TECH-100)', () => {
  it('[TECH-100] 400 com nome e código dos campos, nunca os valores', async () => {
    const { call, logged } = setup();
    const body = JSON.stringify({ ...INTEREST, modality: 'owner', desired_location: '' });

    const error = await expectError(await call({ body }), 400, 'ERR_VALIDATION');

    expect(error).toMatchObject({ fields: [{ field: 'desired_location', code: 'required' }] });
    expect(JSON.stringify(error)).not.toContain('telefone');
    expect(logged()).not.toContain('telefone');
  });

  it('[REQ-025] approx_days para Owner → 400 not_allowed', async () => {
    const { call } = setup();
    const body = JSON.stringify({ ...INTEREST, modality: 'owner' });

    const error = await expectError(await call({ body }), 400, 'ERR_VALIDATION');

    expect(error).toMatchObject({ fields: [{ field: 'approx_days', code: 'not_allowed' }] });
  });

  it('[TECH-056] Idempotency-Key ausente ou fora do formato UUID → 400', async () => {
    const { call, store } = setup();

    await expectError(await call({ headers: { 'idempotency-key': null } }), 400, 'ERR_VALIDATION');
    await expectError(await call({ headers: { 'idempotency-key': '1' } }), 400, 'ERR_VALIDATION');
    expectNoEffect(store);
  });

  it('JSON inválido ou UTF-8 inválido → 400; tipo errado → 415; corpo grande → 413', async () => {
    const { call, store } = setup();

    await expectError(await call({ body: '{"home_edition_id":' }), 400, 'ERR_VALIDATION');
    await expectError(await call({ body: new Uint8Array([0xff, 0xfe]) }), 400, 'ERR_VALIDATION');
    await expectError(
      await call({ headers: { 'content-type': 'text/plain' } }),
      415,
      'ERR_UNSUPPORTED_MEDIA_TYPE',
    );
    await expectError(
      await call({ body: JSON.stringify({ ...INTEREST, desired_location: 'x'.repeat(17_000) }) }),
      413,
      'ERR_PAYLOAD_TOO_LARGE',
    );
    expectNoEffect(store);
  });

  it('[TECH-100] 16 KiB comprovados: o pior caso válido, com todos os textos no limite e escapados, passa de 8 KiB', async () => {
    const { call, store } = setup();
    // Cada ponto de código fora do BMP vira um par substituto escapado: 12 bytes no JSON.
    const longest = '😀'.repeat(200);
    const worst = escapedJson(
      coOwnerBody(HOME_EDITION, {
        desired_location: longest,
        name: longest,
        origin: longest,
        partner_ref: longest,
        email: `${'😀'.repeat(248)}@x.com`,
        // Separadores Unicode removidos na normalização: 32 pontos de código digitados.
        phone: `+55${'\u3000'.repeat(17)}11987654321`,
        approx_days: 2_147_483_647,
      }),
    );

    expect(new TextEncoder().encode(worst).byteLength).toBeGreaterThan(8 * 1024);
    expect(new TextEncoder().encode(worst).byteLength).toBeLessThanOrEqual(16 * 1024);
    expect((await call({ body: worst })).status).toBe(201);
    expect(store.register).toHaveBeenCalledOnce();
  });

  it('[REQ-022] contexto de apresentação adulterado ou de outra Home Edition → 400 sem efeito', async () => {
    const { call, store } = setup();
    const other = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';

    for (const context of [
      presentationContext(other),
      presentationContext(HOME_EDITION).replace(/\.[^.]+$/, '.AAAA'),
    ]) {
      const error = await expectError(
        await call({ body: JSON.stringify({ ...INTEREST, presentation_context: context }) }),
        400,
        'ERR_VALIDATION',
      );
      expect(error).toMatchObject({ fields: [{ field: 'presentation_context', code: 'invalid' }] });
    }
    expectNoEffect(store);
  });
});

describe('POST /v1/interests — abuso e falha fechada (TECH-100)', () => {
  it('[TECH-100] excesso de requisições → 429 com Retry-After e sem efeito', async () => {
    const limiter: RateLimiter = {
      consume: vi.fn(() => Promise.resolve({ allowed: false as const, retryAfterSeconds: 42 })),
    };
    const { call, store, targets } = setup({ limiter });

    const response = await call();

    await expectError(response, 429, 'ERR_RATE_LIMITED');
    expect(response.headers.get('retry-after')).toBe('42');
    expectNoEffect(store);
    expect(targets.find).not.toHaveBeenCalled();
  });

  it('[TECH-100] limitador indisponível → 503 antes de tocar o banco', async () => {
    const limiter: RateLimiter = {
      consume: vi.fn(() => Promise.reject(new RateLimiterUnavailableError('backend'))),
    };
    const { call, store, targets, entries } = setup({ limiter });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expectNoEffect(store);
    expect(targets.find).not.toHaveBeenCalled();
    expect(entries()).toContainEqual(
      expect.objectContaining({ stage: 'limiter', reason: 'backend' }),
    );
  });

  it('[TECH-100] o limitador conta as tentativas recusadas depois e usa o pseudônimo da superfície', async () => {
    const consume = vi.fn(() => Promise.resolve({ allowed: true as const }));
    const { call } = setup({ limiter: { consume } });

    await call({ body: '{"invalido"' });

    expect(consume).toHaveBeenCalledOnce();
    const [key] = consume.mock.calls[0] as unknown as [string];
    expect(key).not.toContain('local');
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('[TECH-100] Origin ausente ou de outro host → 403 sem efeito (CSRF)', async () => {
    const { call, store } = setup();

    await expectError(await call({ headers: { origin: null } }), 403, 'ERR_PERMISSION');
    await expectError(
      await call({ headers: { origin: 'https://atacante.test' } }),
      403,
      'ERR_PERMISSION',
    );
    expectNoEffect(store);
  });

  it('[TECH-100] escrita fechada → 404: Production sem INTEREST_WRITES=open, ou closed', async () => {
    const live = omit(ENV, 'INTEREST_LIMITER_MODE');
    const production = setup({ env: { ...live, VERCEL_ENV: 'production', PUBLIC_SITE: 'open' } });
    const closed = setup({ env: { ...ENV, INTEREST_WRITES: 'closed' } });

    await expectError(await production.call(), 404, 'ERR_NOT_FOUND');
    await expectError(await closed.call(), 404, 'ERR_NOT_FOUND');
    expectNoEffect(production.store);
    expect(production.entries()).toContainEqual(expect.objectContaining({ stage: 'closed' }));
  });

  it('[TECH-100] Production com INTEREST_WRITES=open e Aviso pendente → 404; com Aviso aprovado, a escrita abre', async () => {
    const live = omit(ENV, 'INTEREST_LIMITER_MODE');
    const production = {
      ...live,
      VERCEL_ENV: 'production',
      PUBLIC_SITE: 'open',
      INTEREST_WRITES: 'open',
      UPSTASH_REDIS_REST_URL: 'https://upstash.example',
      UPSTASH_REDIS_REST_TOKEN: 't'.repeat(24),
      INTEREST_LIMITER_TIMEOUT_MS: '500',
    };
    const pending = setup({ env: production });
    const approved = setup({ env: production, notice: APPROVED });

    await expectError(await pending.call(), 404, 'ERR_NOT_FOUND');
    expectNoEffect(pending.store);
    // Aprovado e aberto: passa do portão (e para na origem de rede, ausente fora da Vercel real).
    await expectError(await approved.call(), 503, 'ERR_UNAVAILABLE');
    expect(approved.entries()).toContainEqual(
      expect.objectContaining({ stage: 'network_identity' }),
    );
  });

  it('[TECH-001] sem os segredos próprios da W6 → 503 nomeando só as chaves', async () => {
    const env = omit(omit(ENV, 'INTEREST_REQUEST_HMAC_SECRET'), 'INTEREST_CONTEXT_HMAC_SECRET');
    const { call, store, entries } = setup({ env });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expectNoEffect(store);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        stage: 'configuration',
        reason: 'INTEREST_REQUEST_HMAC_SECRET,INTEREST_CONTEXT_HMAC_SECRET',
      }),
    );
  });

  it('[TECH-056] registro de idempotência com chave de hash desconhecida → 503 sem efeito (ADR-0018)', async () => {
    const { call, store, entries } = setup({
      store: {
        priorAttempt: vi.fn(() =>
          Promise.reject(new PublicAttemptUnverifiableError('interest', 'hmac_sha256', 'v9')),
        ),
        register: vi.fn(),
      },
    });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expect(store.register).not.toHaveBeenCalled();
    expect(entries()).toContainEqual(
      expect.objectContaining({ stage: 'idempotency', reason: 'hash_key_unavailable' }),
    );
  });

  it('[TECH-001] ambiente inválido (modo fake na Vercel) falha fechado com 503, antes do portão', async () => {
    const { call, store } = setup({
      env: { ...ENV, VERCEL_ENV: 'production', PUBLIC_SITE: 'open', INTEREST_WRITES: 'open' },
    });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expectNoEffect(store);
  });

  it('[TECH-001] configuração ausente → 503 nomeando só as chaves no log', async () => {
    const partial = omit(ENV, 'INTEREST_NETWORK_LIMIT');
    const { call, store, entries } = setup({ env: partial });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
    expectNoEffect(store);
    expect(entries()).toContainEqual(
      expect.objectContaining({ stage: 'configuration', reason: 'INTEREST_NETWORK_LIMIT' }),
    );
  });

  it('[TECH-001] modo real sem Upstash → 503 nomeando as chaves; nunca o modo fake na Vercel', async () => {
    const live = omit(ENV, 'INTEREST_LIMITER_MODE');
    const missingUpstash = setup({ env: live, limiter: undefined });
    const fakeOnVercel = setup({ env: { ...ENV, VERCEL_ENV: 'preview' }, limiter: undefined });

    await expectError(await missingUpstash.call(), 503, 'ERR_UNAVAILABLE');
    await expectError(await fakeOnVercel.call(), 503, 'ERR_UNAVAILABLE');
    expect(missingUpstash.entries()).toContainEqual(
      expect.objectContaining({
        reason: 'UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,INTEREST_LIMITER_TIMEOUT_MS',
      }),
    );
  });

  it('[TECH-100] origem de rede ausente na Vercel → 503', async () => {
    const env = {
      ...ENV,
      INTEREST_LIMITER_MODE: '',
      VERCEL_ENV: 'production',
      PUBLIC_SITE: 'open',
    };
    const { call } = setup({ env: { ...env, INTEREST_WRITES: 'open' }, notice: APPROVED });

    await expectError(await call(), 503, 'ERR_UNAVAILABLE');
  });

  it('[TECH-056] banco inalcançável no registro → 503; erro inesperado → 500 genérico', async () => {
    const offline = setup({
      store: {
        priorAttempt: vi.fn(() =>
          Promise.reject(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })),
        ),
        register: vi.fn(),
      },
    });
    const broken = setup({
      store: {
        priorAttempt: vi.fn(() => Promise.reject(new TypeError('detalhe interno sigiloso'))),
        register: vi.fn(),
      },
    });

    await expectError(await offline.call(), 503, 'ERR_UNAVAILABLE');
    const internal = await expectError(await broken.call(), 500, 'ERR_INTERNAL');
    expect(JSON.stringify(internal)).not.toContain('sigiloso');
    expect(broken.entries()).toContainEqual(
      expect.objectContaining({ stage: 'internal', reason: 'TypeError' }),
    );
  });

  it('[TECH-100] log estruturado sem corpo, contato, pré-qualificação, contexto, IP, chave ou hash', async () => {
    const { call, entries, logged } = setup();

    await call();

    expect(entries()).toContainEqual(
      expect.objectContaining({ event: 'interest_registration', stage: 'registered', status: 201 }),
    );
    for (const secret of [
      'Sigilosa',
      'telefone',
      'Confidencial',
      ATTEMPT_ID,
      HOME_EDITION,
      SENTINEL_CONTACT.name,
      SENTINEL_CONTACT.email,
      '98765',
      'from_500k_to_1m',
      'with_partner_or_family',
      String(INTEREST.presentation_context).slice(0, 20),
    ]) {
      expect(logged(), secret).not.toContain(secret);
    }
  });
});
