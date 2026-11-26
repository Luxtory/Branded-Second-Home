import { createHash } from 'node:crypto';
import {
  ConfigurationMissingError,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  loadEnv,
  loadRuntimeConfig,
  RateLimiterUnavailableError,
  rootLogger,
  type CommandHandler,
  type EnvSource,
  type JsonValue,
  type QuotaDecision,
  type RateLimiter,
  type RateLimitPolicies,
} from '@/features/platform';

/**
 * Limite das superfícies da Request (W21; TECH-100; STRIDE T-2111, T-2113), com o limitador distribuído existente
 * (TECH-057, ADR-0002): `read` — leitura da capacidade alheia (catálogo, calendário) e prévia; `send` — pagamento da
 * Taxa (cada envio exige um pagamento aprovado próprio, então o envio fica limitado por ele). Chave pseudônima sem segredo
 * novo — SHA-256 de `luxtory:<superfície>:<user_id>` —, limite global por superfície e namespace por ambiente. Limites do
 * runbook (TECH-001): ausentes → `parameter_missing`; limitador sem resposta segura → `unavailable` (falha fechada).
 * Encerrar uma obrigação (retirada) nunca passa por aqui.
 */
export type RequestSurface = 'read' | 'send';

export type RequestQuotaDecision =
  | { readonly status: 'allowed' }
  | { readonly status: 'limited'; readonly retryAfterSeconds: number }
  | { readonly status: 'unavailable' }
  | { readonly status: 'parameter_missing' };

export type RequestQuota = (
  surface: RequestSurface,
  userId: string,
) => Promise<RequestQuotaDecision>;

const SURFACES = {
  read: { name: 'luxchange-request-read', limit: 'LUXCHANGE_REQUEST_READ_LIMIT' },
  send: { name: 'luxchange-request-send', limit: 'LUXCHANGE_REQUEST_SEND_LIMIT' },
} as const;
/** Uma janela para as duas superfícies e o total (variáveis mínimas; TECH-001). */
const COMMON_KEYS = ['LUXCHANGE_REQUEST_GLOBAL_LIMIT', 'LUXCHANGE_REQUEST_WINDOW_SECONDS'] as const;
const LIVE_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'LUXCHANGE_REQUEST_LIMITER_TIMEOUT_MS',
] as const;

/** Chave do limitador por usuário e superfície, sem segredo (o id do usuário só sai do servidor como hash). */
export const requestQuotaKey = (surface: RequestSurface, userId: string): string =>
  createHash('sha256').update(`luxtory:${SURFACES[surface].name}:${userId}`).digest('hex');

// Limitadores determinísticos de local/CI: contadores em memória do processo (recusados na Vercel pelo `loadEnv`).
const fakes = new Map<RequestSurface, RateLimiter>();

function policiesFor(surface: RequestSurface, source: EnvSource): RateLimitPolicies {
  const own = SURFACES[surface];
  const limits = loadRuntimeConfig([own.limit, ...COMMON_KEYS], source);
  const windowSeconds = limits.LUXCHANGE_REQUEST_WINDOW_SECONDS;
  return {
    network: { limit: limits[own.limit], windowSeconds },
    global: { limit: limits.LUXCHANGE_REQUEST_GLOBAL_LIMIT, windowSeconds },
  };
}

function limiterFor(
  surface: RequestSurface,
  source: EnvSource,
  policies: RateLimitPolicies,
): RateLimiter {
  const env = loadEnv(source);
  if (env.LUXCHANGE_REQUEST_LIMITER_MODE === 'fake') {
    const fake = fakes.get(surface) ?? createMemoryRateLimiter(policies);
    fakes.set(surface, fake);
    return fake;
  }
  const live = loadRuntimeConfig(LIVE_KEYS, source);
  return createUpstashRateLimiter({
    url: live.UPSTASH_REDIS_REST_URL,
    token: live.UPSTASH_REDIS_REST_TOKEN,
    namespace: `luxtory:${SURFACES[surface].name}:${env.VERCEL_ENV ?? 'local'}`,
    policies,
    timeoutMs: live.LUXCHANGE_REQUEST_LIMITER_TIMEOUT_MS,
  });
}

export interface RequestQuotaDependencies {
  readonly source?: EnvSource;
  /** Injeção nos testes (depois da configuração validada). */
  readonly limiter?: (surface: RequestSurface) => RateLimiter;
}

export function createRequestQuota(deps: RequestQuotaDependencies = {}): RequestQuota {
  const source = deps.source ?? process.env;
  return async (surface, userId) => {
    let limiter: RateLimiter;
    try {
      // Os limites do runbook são conferidos sempre, inclusive com o limitador injetado.
      const policies = policiesFor(surface, source);
      limiter = deps.limiter?.(surface) ?? limiterFor(surface, source, policies);
    } catch (error) {
      if (!(error instanceof ConfigurationMissingError)) throw error;
      // Só os nomes das chaves ausentes; nunca valores (TECH-001).
      rootLogger.warn('luxchange request limiter not configured', {
        surface: SURFACES[surface].name,
        missing: error.missingKeys.join(','),
      });
      return { status: 'parameter_missing' };
    }
    try {
      const decision = await limiter.consume(requestQuotaKey(surface, userId));
      return decision.allowed
        ? { status: 'allowed' }
        : { status: 'limited', retryAfterSeconds: decision.retryAfterSeconds };
    } catch (error) {
      if (!(error instanceof RateLimiterUnavailableError)) throw error;
      rootLogger.warn('luxchange request limiter unavailable', {
        surface: SURFACES[surface].name,
        reason: error.reason,
      });
      return { status: 'unavailable' };
    }
  };
}

/**
 * `send_request` com o limite de envio (gancho `consumeQuota` do executor, como na W13): chamadas diretas à rota ou à
 * action também contam, inclusive com pagamento inválido; o replay de uma chave concluída nunca consome. Chave pela
 * autorização do guard (representação usuário → party).
 */
export function withSendQuota<I, R extends JsonValue, Tx>(
  handler: CommandHandler<I, R, Tx>,
  quota: RequestQuota,
): CommandHandler<I, R, Tx> {
  return {
    ...handler,
    async consumeQuota(authorizationRef): Promise<QuotaDecision> {
      if (authorizationRef === null) return 'unavailable';
      return (await quota('send', authorizationRef)).status;
    },
  };
}

/** Uma instância por processo (o limitador fake mantém contadores em memória). */
let shared: RequestQuota | null = null;
export const productionRequestQuota = (): RequestQuota => (shared ??= createRequestQuota());
