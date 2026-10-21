import {
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  getDatabase,
  loadEnv,
  loadRuntimeConfig,
  unavailableKeys,
  type Database,
  type Env,
  type EnvSource,
  type PublicHashKey,
  type RateLimiter,
  type RateLimitPolicies,
} from '@/features/platform';
import type { InterestStore, InterestTargets } from '../application/ports';
import {
  PRESENTATION_CONTEXT_KEY_ID,
  type PresentationContextKey,
} from '../application/presentation-context';
import { INTEREST_HASH_KEY_ID, INTEREST_SURFACE } from '../application/register-interest';
import { createCatalogInterestTargets } from '../infrastructure/catalog-interest-targets';
import { createPostgresInterestStore } from '../infrastructure/postgres-interest-store';

/**
 * Chaves comuns aos dois modos (runbook, TECH-001; nenhum default): limites, o segredo da pseudonimização da origem de
 * rede — o da BP1, com domínio próprio (STRIDE ownership T-407) — e os segredos próprios da W6, um por finalidade
 * (ADR-0018): hash de idempotência e contexto de apresentação. O modo real acrescenta Upstash e o prazo.
 */
const COMMON_KEYS = [
  'BRAND_PARTNERS_CONTACT_HMAC_SECRET',
  'INTEREST_REQUEST_HMAC_SECRET',
  'INTEREST_CONTEXT_HMAC_SECRET',
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

export interface InterestConfig {
  readonly env: Env;
  /** Segredo da pseudonimização da origem de rede (limitador). */
  readonly hmacSecret: string;
  /** Chave do HMAC do hash de idempotência (ADR-0018 §3). */
  readonly hashKey: PublicHashKey;
  /** Chaves que verificam o contexto de apresentação (ADR-0018 §4). */
  readonly contextKeys: readonly PresentationContextKey[];
  readonly limiter: RateLimiter;
  readonly store: InterestStore;
  readonly targets: InterestTargets;
}

/** Adaptadores no lugar dos do ambiente, depois da configuração validada (injeção nos testes). */
export interface InterestAdapters {
  readonly limiter?: RateLimiter;
  readonly database?: Database;
  readonly store?: InterestStore;
  readonly targets?: InterestTargets;
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

/** Chave que assina o contexto de apresentação na página (só o segredo dela; erro explícito se faltar). */
export function loadPresentationContextKey(source: EnvSource): PresentationContextKey {
  const { INTEREST_CONTEXT_HMAC_SECRET } = loadRuntimeConfig(
    ['INTEREST_CONTEXT_HMAC_SECRET'],
    source,
  );
  return { id: PRESENTATION_CONTEXT_KEY_ID, secret: INTEREST_CONTEXT_HMAC_SECRET };
}

/** Configuração completa do ambiente ou erro explícito com os nomes das chaves (TECH-001); nunca um default. */
export function loadInterestConfig(source: EnvSource, adapters: InterestAdapters): InterestConfig {
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
  const limiter = adapters.limiter ?? limiterFor(env, policies, source, namespace);
  const needsDatabase = adapters.store === undefined || adapters.targets === undefined;
  const db = needsDatabase ? (adapters.database ?? getDatabase(source)) : null;
  return {
    env,
    hmacSecret: common.BRAND_PARTNERS_CONTACT_HMAC_SECRET,
    hashKey: { id: INTEREST_HASH_KEY_ID, secret: common.INTEREST_REQUEST_HMAC_SECRET },
    contextKeys: [{ id: PRESENTATION_CONTEXT_KEY_ID, secret: common.INTEREST_CONTEXT_HMAC_SECRET }],
    limiter,
    store: adapters.store ?? createPostgresInterestStore(db as Database),
    targets: adapters.targets ?? createCatalogInterestTargets(db as Database),
  };
}

/**
 * A escrita teria o que precisa neste ambiente — chaves válidas e banco permitido (ADR-0007: fora de Production na
 * Vercel o banco é recusado) — sem abrir conexão. Decide se a seção do formulário existe (spec ownership §14.9).
 */
export function hasInterestConfiguration(source: EnvSource): boolean {
  try {
    const env = loadEnv(source);
    loadRuntimeConfig(COMMON_KEYS, source);
    if (env.INTEREST_LIMITER_MODE !== 'fake') loadRuntimeConfig(LIVE_KEYS, source);
    if (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== 'production') return false;
    loadRuntimeConfig(['DATABASE_URL'], source);
    return true;
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return false;
  }
}
