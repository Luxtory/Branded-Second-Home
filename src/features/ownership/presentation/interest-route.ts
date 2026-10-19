import { randomUUID } from 'node:crypto';
import {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  errorResponse,
  getDatabase,
  isDatabaseUnavailable,
  isInterestWriteOpen,
  isJsonRequest,
  isSameOrigin,
  loadEnv,
  loadRuntimeConfig,
  pseudonymizeNetwork,
  RateLimiterUnavailableError,
  readBoundedText,
  systemClock,
  trustedClientAddress,
  unavailableKeys,
  withRoute,
  type Clock,
  type Database,
  type Env,
  type EnvSource,
  type ErrorCode,
  type RateLimiter,
  type RateLimitPolicies,
  type RouteContext,
} from '@/features/platform';
import type { InterestStore, InterestTargets } from '../application/ports';
import {
  INTEREST_SURFACE,
  registerInterest,
  type InterestFieldIssue,
  type InterestRegistration,
} from '../application/register-interest';
import { INTEREST_BODY_MAX_BYTES } from '../domain/interest';
import { createCatalogInterestTargets } from '../infrastructure/catalog-interest-targets';
import { createPostgresInterestStore } from '../infrastructure/postgres-interest-store';

const HTTP_CREATED = 201;
const NO_STORE = 'no-store';

/**
 * Chaves comuns aos dois modos (runbook, TECH-001): limites e o segredo da pseudonimização da origem de rede — o da BP1,
 * com separação de domínio pela superfície (STRIDE ownership T-407). O modo real acrescenta Upstash e o prazo.
 */
const COMMON_KEYS = [
  'BRAND_PARTNERS_CONTACT_HMAC_SECRET',
  'INTEREST_NETWORK_LIMIT',
  'INTEREST_NETWORK_WINDOW_SECONDS',
  'INTEREST_GLOBAL_LIMIT',
  'INTEREST_GLOBAL_WINDOW_SECONDS',
] as const;
const LIVE_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'INTEREST_LIMITER_TIMEOUT_MS',
] as const;

interface InterestConfig {
  readonly env: Env;
  readonly hmacSecret: string;
  readonly limiter: RateLimiter;
  readonly store: InterestStore;
  readonly targets: InterestTargets;
}

export interface InterestRouteOptions {
  /** Ambiente lido pela rota (injeção nos testes). */
  readonly env?: EnvSource;
  /** Adaptadores no lugar dos do ambiente, depois da configuração validada (injeção nos testes). */
  readonly limiter?: RateLimiter;
  readonly database?: Database;
  readonly store?: InterestStore;
  readonly targets?: InterestTargets;
  readonly clock?: Clock;
  readonly newId?: () => string;
}

// Limitador determinístico de local/CI: contadores em memória do processo.
let fakeLimiter: RateLimiter | null = null;

function limiterFor(env: Env, policies: RateLimitPolicies, source: EnvSource, namespace: string) {
  if (env.INTEREST_LIMITER_MODE === 'fake') {
    fakeLimiter ??= createMemoryRateLimiter(policies);
    return fakeLimiter;
  }
  const live = loadRuntimeConfig(LIVE_KEYS, source);
  return createUpstashRateLimiter({
    url: live.UPSTASH_REDIS_REST_URL,
    token: live.UPSTASH_REDIS_REST_TOKEN,
    namespace,
    policies,
    timeoutMs: live.INTEREST_LIMITER_TIMEOUT_MS,
  });
}

/** Configuração completa do ambiente ou erro explícito com os nomes das chaves (TECH-001); nunca um default. */
function loadInterestConfig(source: EnvSource, options: InterestRouteOptions): InterestConfig {
  const env = loadEnv(source);
  const common = loadRuntimeConfig(COMMON_KEYS, source);
  const policies: RateLimitPolicies = {
    network: {
      limit: common.INTEREST_NETWORK_LIMIT,
      windowSeconds: common.INTEREST_NETWORK_WINDOW_SECONDS,
    },
    global: {
      limit: common.INTEREST_GLOBAL_LIMIT,
      windowSeconds: common.INTEREST_GLOBAL_WINDOW_SECONDS,
    },
  };
  const namespace = `luxtory:${INTEREST_SURFACE}:${env.VERCEL_ENV ?? 'local'}`;
  const limiter = options.limiter ?? limiterFor(env, policies, source, namespace);
  const needsDatabase = options.store === undefined || options.targets === undefined;
  const db = needsDatabase ? (options.database ?? getDatabase(source)) : null;
  return {
    env,
    hmacSecret: common.BRAND_PARTNERS_CONTACT_HMAC_SECRET,
    limiter,
    store: options.store ?? createPostgresInterestStore(db as Database),
    targets: options.targets ?? createCatalogInterestTargets(db as Database),
  };
}

/** Resultado registrado no log: só códigos de um conjunto fechado, nunca campos, corpo, IP, chave ou hash. */
type Stage =
  | 'closed'
  | 'configuration'
  | 'origin'
  | 'media_type'
  | 'body'
  | 'network_identity'
  | 'limiter'
  | 'rate_limited'
  | 'database'
  | 'json'
  | 'schema'
  | 'not_found'
  | 'conflict'
  | 'registered'
  | 'replayed'
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

/** `ERR_VALIDATION` com os campos recusados: só nome e código, nunca o valor enviado (spec ownership §5.1). */
async function validationResponse(issues: readonly InterestFieldIssue[], correlationId: string) {
  const base = errorResponse('ERR_VALIDATION', correlationId);
  const body = (await base.json()) as Readonly<Record<string, unknown>>;
  return Response.json({ ...body, fields: issues }, { status: base.status });
}

async function registrationOutcome(
  registration: InterestRegistration,
  correlationId: string,
): Promise<Outcome> {
  switch (registration.status) {
    case 'registered': {
      const headers: Record<string, string> = {};
      if (registration.replayed) headers['idempotency-replayed'] = 'true';
      return {
        response: Response.json({ status: 'registered' }, { status: HTTP_CREATED, headers }),
        stage: registration.replayed ? 'replayed' : 'registered',
      };
    }
    case 'invalid':
      return {
        response: await validationResponse(registration.issues, correlationId),
        stage: 'schema',
      };
    case 'not_found':
      return reject('ERR_NOT_FOUND', correlationId, 'not_found');
    case 'conflict':
      return reject('ERR_IDEMPOTENCY_CONFLICT', correlationId, 'conflict');
  }
}

async function handleInterest(
  request: Request,
  correlationId: string,
  source: EnvSource,
  options: InterestRouteOptions,
): Promise<Outcome> {
  let config: InterestConfig;
  try {
    if (!isInterestWriteOpen(source)) return reject('ERR_NOT_FOUND', correlationId, 'closed');
    config = loadInterestConfig(source, options);
  } catch (error) {
    // Ambiente inválido ou incompleto: falha fechada, nomeando só as chaves.
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    return reject('ERR_UNAVAILABLE', correlationId, 'configuration', keys.join(','));
  }
  if (!isSameOrigin(request)) return reject('ERR_PERMISSION', correlationId, 'origin');
  if (!isJsonRequest(request)) {
    return reject('ERR_UNSUPPORTED_MEDIA_TYPE', correlationId, 'media_type');
  }
  const text = await readBoundedText(request, INTEREST_BODY_MAX_BYTES);
  if (text === BODY_TOO_LARGE) return reject('ERR_PAYLOAD_TOO_LARGE', correlationId, 'body');
  if (text === BODY_NOT_TEXT) return reject('ERR_VALIDATION', correlationId, 'body');
  // O limitador conta toda tentativa que chegou até aqui e roda antes de qualquer acesso ao banco.
  const address = trustedClientAddress(request, config.env);
  if (address === null) return reject('ERR_UNAVAILABLE', correlationId, 'network_identity');
  let decision;
  try {
    decision = await config.limiter.consume(
      pseudonymizeNetwork(address, config.hmacSecret, INTEREST_SURFACE),
    );
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
  const registration = await registerInterest(body, request.headers.get('idempotency-key') ?? '', {
    targets: config.targets,
    store: config.store,
    clock: options.clock ?? systemClock,
    newId: options.newId ?? randomUUID,
  });
  return registrationOutcome(registration, correlationId);
}

/** Banco inalcançável ou recusado no ambiente durante o registro: `503` sem detalhe; o resto é erro interno. */
function failureOutcome(error: unknown, correlationId: string): Outcome {
  const keys = unavailableKeys(error);
  if (keys !== null)
    return reject('ERR_UNAVAILABLE', correlationId, 'configuration', keys.join(','));
  if (isDatabaseUnavailable(error)) {
    return reject('ERR_UNAVAILABLE', correlationId, 'database', 'unavailable');
  }
  return reject(
    'ERR_INTERNAL',
    correlationId,
    'internal',
    error instanceof Error ? error.name : 'unknown',
  );
}

/**
 * `POST /v1/interests` (OpenAPI `createInterest`, spec ownership §5), sem o `withRoute` (injeção nos testes). Portão e
 * configuração → origem → tipo e corpo → limitador → schema e chave → idempotência → alvo público → registro. Toda
 * resposta é `no-store`, sem CORS. Erros nunca sobem crus ao `withRoute`: o log leva só etapa, código e duração.
 */
export function createInterestRoute(options: InterestRouteOptions = {}) {
  return async (request: Request, { correlationId, log }: RouteContext): Promise<Response> => {
    const started = performance.now();
    let outcome: Outcome;
    try {
      outcome = await handleInterest(request, correlationId, options.env ?? process.env, options);
    } catch (error) {
      outcome = failureOutcome(error, correlationId);
    }
    const { response, stage, reason } = outcome;
    response.headers.set('cache-control', NO_STORE);
    const fields = {
      event: 'interest_registration',
      stage,
      status: response.status,
      duration_ms: Math.round(performance.now() - started),
      ...(reason === undefined ? {} : { reason }),
    };
    if (response.status >= 500) log.error('interest registration failed', fields);
    else log.info('interest registration', fields);
    return response;
  };
}

/** Handler de produção do `POST /v1/interests`, com correlação (`withRoute`). */
export const createInterest = withRoute(createInterestRoute());
