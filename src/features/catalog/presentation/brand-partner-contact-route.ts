import {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  errorResponse,
  hasAllowedOrigin,
  isBrandPartnersSiteOpen,
  isJsonRequest,
  loadEnv,
  loadRuntimeConfig,
  pseudonymizeNetwork,
  RateLimiterUnavailableError,
  readBoundedText,
  trustedClientAddress,
  unavailableKeys,
  withRoute,
  type Env,
  type EnvSource,
  type ErrorCode,
  type RateLimiter,
  type RateLimitPolicies,
  type RouteContext,
} from '@/features/platform';
import {
  submitBrandPartnerContact,
  type ContactFieldIssue,
  type ContactMailer,
  type ContactSubmission,
} from '../application/brand-partner-contact';
import { CONTACT_BODY_MAX_BYTES } from '../domain/brand-partner-contact';
import { createFakeContactMailer } from '../infrastructure/fake-contact-mailer';
import { createResendContactMailer } from '../infrastructure/resend-contact-mailer';
import { brandPartnersMessages } from './i18n/brand-partners-pt-br';

const HTTP_ACCEPTED = 202;
const NO_STORE = 'no-store';

/** Chaves comuns aos dois modos; o modo real acrescenta provedor, Upstash e timeouts (runbook, TECH-001). */
const COMMON_KEYS = [
  'BRAND_PARTNERS_CONTACT_HMAC_SECRET',
  'BRAND_PARTNERS_ALLOWED_ORIGINS',
  'BRAND_PARTNERS_CONTACT_NETWORK_LIMIT',
  'BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS',
  'BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT',
  'BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS',
] as const;
const LIVE_KEYS = [
  'RESEND_API_KEY',
  'BRAND_PARTNERS_CONTACT_FROM',
  'BRAND_PARTNERS_CONTACT_TO',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS',
  'BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS',
] as const;

interface ContactConfig {
  readonly env: Env;
  readonly origins: readonly string[];
  readonly hmacSecret: string;
  readonly namespace: string;
  readonly mailer: ContactMailer;
  readonly limiter: RateLimiter;
}

// Adaptadores determinísticos de local/CI: estado em memória do processo (contadores e impressões digitais).
let fakeAdapters: { readonly mailer: ContactMailer; readonly limiter: RateLimiter } | null = null;

function fakeAdaptersFor(policies: RateLimitPolicies) {
  fakeAdapters ??= {
    mailer: createFakeContactMailer(),
    limiter: createMemoryRateLimiter(policies),
  };
  return fakeAdapters;
}

/** Configuração completa do ambiente ou erro explícito com os nomes das chaves (TECH-001); nunca um default. */
function loadContactConfig(source: EnvSource): ContactConfig {
  const env = loadEnv(source);
  const common = loadRuntimeConfig(COMMON_KEYS, source);
  const policies: RateLimitPolicies = {
    network: {
      limit: common.BRAND_PARTNERS_CONTACT_NETWORK_LIMIT,
      windowSeconds: common.BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS,
    },
    global: {
      limit: common.BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT,
      windowSeconds: common.BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS,
    },
  };
  const namespace = `luxtory:brand-partner-contact:${env.VERCEL_ENV ?? 'local'}`;
  const shared = {
    env,
    origins: common.BRAND_PARTNERS_ALLOWED_ORIGINS,
    hmacSecret: common.BRAND_PARTNERS_CONTACT_HMAC_SECRET,
    namespace,
  };
  if (env.BRAND_PARTNERS_CONTACT_MODE === 'fake')
    return { ...shared, ...fakeAdaptersFor(policies) };
  const live = loadRuntimeConfig(LIVE_KEYS, source);
  return {
    ...shared,
    mailer: createResendContactMailer({
      apiKey: live.RESEND_API_KEY,
      from: live.BRAND_PARTNERS_CONTACT_FROM,
      to: live.BRAND_PARTNERS_CONTACT_TO,
      timeoutMs: live.BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS,
    }),
    limiter: createUpstashRateLimiter({
      url: live.UPSTASH_REDIS_REST_URL,
      token: live.UPSTASH_REDIS_REST_TOKEN,
      namespace,
      policies,
      timeoutMs: live.BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS,
    }),
  };
}

/** Resultado registrado no log: só códigos de um conjunto fechado, nunca campos, corpo, IP, chave ou resposta bruta. */
type Stage =
  | 'closed'
  | 'configuration'
  | 'origin'
  | 'media_type'
  | 'body'
  | 'network_identity'
  | 'limiter'
  | 'rate_limited'
  | 'json'
  | 'schema'
  | 'honeypot'
  | 'conflict'
  | 'provider'
  | 'accepted'
  | 'internal';

interface Outcome {
  readonly response: Response;
  readonly stage: Stage;
  readonly reason?: string;
}

const reject = (code: ErrorCode, correlationId: string, stage: Stage, reason?: string) => ({
  response: errorResponse(code, correlationId),
  stage,
  ...(reason === undefined ? {} : { reason }),
});

/** `ERR_VALIDATION` com os campos recusados: só nome e código, nunca o valor enviado (§14.4). */
async function validationResponse(issues: readonly ContactFieldIssue[], correlationId: string) {
  const base = errorResponse('ERR_VALIDATION', correlationId);
  const body = (await base.json()) as Readonly<Record<string, unknown>>;
  return Response.json({ ...body, fields: issues }, { status: base.status });
}

async function submissionOutcome(
  submission: ContactSubmission,
  correlationId: string,
): Promise<Outcome> {
  switch (submission.status) {
    case 'accepted':
      return {
        response: Response.json({ status: 'accepted' }, { status: HTTP_ACCEPTED }),
        stage: 'accepted',
      };
    case 'invalid':
      return {
        response: await validationResponse(submission.issues, correlationId),
        stage: 'schema',
      };
    // Honeypot: a mesma resposta da origem recusada — não revela a proteção acionada, nunca falso sucesso.
    case 'refused':
      return reject('ERR_PERMISSION', correlationId, 'honeypot');
    case 'conflict':
      return reject('ERR_IDEMPOTENCY_CONFLICT', correlationId, 'conflict');
    case 'unavailable':
      return reject('ERR_UNAVAILABLE', correlationId, 'provider', submission.reason);
  }
}

async function handleContact(
  request: Request,
  correlationId: string,
  source: EnvSource,
  adapters: { readonly mailer?: ContactMailer; readonly limiter?: RateLimiter },
): Promise<Outcome> {
  let config: ContactConfig;
  try {
    if (!isBrandPartnersSiteOpen(source)) return reject('ERR_NOT_FOUND', correlationId, 'closed');
    const loaded = loadContactConfig(source);
    config = {
      ...loaded,
      mailer: adapters.mailer ?? loaded.mailer,
      limiter: adapters.limiter ?? loaded.limiter,
    };
  } catch (error) {
    // Ambiente inválido ou incompleto: falha fechada, nomeando só as chaves.
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    return reject('ERR_UNAVAILABLE', correlationId, 'configuration', keys.join(','));
  }
  if (!hasAllowedOrigin(request, config.origins)) {
    return reject('ERR_PERMISSION', correlationId, 'origin');
  }
  if (!isJsonRequest(request))
    return reject('ERR_UNSUPPORTED_MEDIA_TYPE', correlationId, 'media_type');
  const text = await readBoundedText(request, CONTACT_BODY_MAX_BYTES);
  if (text === BODY_TOO_LARGE) return reject('ERR_PAYLOAD_TOO_LARGE', correlationId, 'body');
  if (text === BODY_NOT_TEXT) return reject('ERR_VALIDATION', correlationId, 'body');

  // O limitador conta toda tentativa que chegou até aqui — inclusive as que o schema ou o honeypot recusam depois.
  const address = trustedClientAddress(request, config.env);
  if (address === null) return reject('ERR_UNAVAILABLE', correlationId, 'network_identity');
  let decision;
  try {
    decision = await config.limiter.consume(pseudonymizeNetwork(address, config.hmacSecret));
  } catch (error) {
    if (!(error instanceof RateLimiterUnavailableError)) throw error;
    return reject('ERR_UNAVAILABLE', correlationId, 'limiter', error.reason);
  }
  if (!decision.allowed) {
    const limited = errorResponse('ERR_RATE_LIMITED', correlationId);
    limited.headers.set('retry-after', String(decision.retryAfterSeconds));
    return { response: limited, stage: 'rate_limited' };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reject('ERR_VALIDATION', correlationId, 'json');
  }
  const submission = await submitBrandPartnerContact(
    body,
    request.headers.get('idempotency-key') ?? '',
    {
      mailer: config.mailer,
      namespace: config.namespace,
      emailText: brandPartnersMessages.contactEmail,
    },
  );
  return submissionOutcome(submission, correlationId);
}

export interface BrandPartnerContactRouteOptions {
  /** Ambiente lido pela rota (injeção nos testes). */
  readonly env?: EnvSource;
  /** Adaptadores no lugar dos do ambiente, depois da configuração validada (injeção nos testes). */
  readonly mailer?: ContactMailer;
  readonly limiter?: RateLimiter;
}

/**
 * `POST /v1/brand-partner-contacts` (OpenAPI `createBrandPartnerContact`, TECH-057), sem o `withRoute` (injeção nos
 * testes). Publicação e configuração → origem → tipo e corpo → limitador → schema, chave e honeypot → envio. Toda
 * resposta é `no-store`, sem CORS. Erros nunca sobem crus ao `withRoute`: o log leva só etapa, código e duração.
 */
export function createBrandPartnerContactRoute({
  env,
  mailer,
  limiter,
}: BrandPartnerContactRouteOptions = {}) {
  return async (request: Request, { correlationId, log }: RouteContext): Promise<Response> => {
    const started = performance.now();
    let outcome: Outcome;
    try {
      outcome = await handleContact(request, correlationId, env ?? process.env, {
        mailer,
        limiter,
      });
    } catch (error) {
      outcome = reject(
        'ERR_INTERNAL',
        correlationId,
        'internal',
        error instanceof Error ? error.name : 'unknown',
      );
    }
    const { response, stage, reason } = outcome;
    response.headers.set('cache-control', NO_STORE);
    const fields = {
      event: 'brand_partner_contact',
      stage,
      status: response.status,
      duration_ms: Math.round(performance.now() - started),
      ...(reason === undefined ? {} : { reason }),
    };
    if (response.status >= 500) log.error('brand partner contact failed', fields);
    else log.info('brand partner contact', fields);
    return response;
  };
}

/** Handler de produção do `POST /v1/brand-partner-contacts`, com correlação (`withRoute`). */
export const createBrandPartnerContact = withRoute(createBrandPartnerContactRoute());
