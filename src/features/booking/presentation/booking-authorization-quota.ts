import { createHash } from 'node:crypto';
import {
  ConfigurationMissingError,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  loadEnv,
  loadRuntimeConfig,
  RateLimiterUnavailableError,
  rootLogger,
  type EnvSource,
  type QuotaDecision,
  type RateLimiter,
  type RateLimitPolicies,
} from '@/features/platform';

/**
 * Cota do `request_booking_authorization` (G-E4-1, W13 E4b; spec booking §10.15). Chamada pelo executor depois do guard
 * e da consulta de idempotência: o replay de uma chave concluída nunca chega aqui. Chave pseudônima sem segredo novo —
 * SHA-256 de `luxtory:booking-authorization-request:<staff_role_id>`, com o `staff_role` da decisão do guard. Limites do
 * runbook (TECH-001): ausente → `parameter_missing`; limitador sem resposta segura → `unavailable` (falha fechada).
 */
const COMMON_KEYS = [
  'BOOKING_AUTHORIZATION_REQUEST_LIMIT',
  'BOOKING_AUTHORIZATION_REQUEST_WINDOW_SECONDS',
  'BOOKING_AUTHORIZATION_GLOBAL_LIMIT',
  'BOOKING_AUTHORIZATION_GLOBAL_WINDOW_SECONDS',
] as const;
const LIVE_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BOOKING_AUTHORIZATION_LIMITER_TIMEOUT_MS',
] as const;
const STAFF_ROLE_REF = /^staff_role:([0-9a-f-]{36})$/i;
const SURFACE = 'booking-authorization-request';

/** Chave do limitador por papel de staff, sem segredo (o id do papel não é dado pessoal). */
export const bookingAuthorizationQuotaKey = (staffRoleId: string): string =>
  createHash('sha256').update(`luxtory:${SURFACE}:${staffRoleId}`).digest('hex');

// Limitador determinístico de local/CI: contadores em memória do processo (recusado na Vercel pelo `loadEnv`).
let fakeLimiter: RateLimiter | null = null;

function limiterFor(source: EnvSource, policies: RateLimitPolicies): RateLimiter {
  const env = loadEnv(source);
  if (env.BOOKING_AUTHORIZATION_LIMITER_MODE === 'fake') {
    fakeLimiter ??= createMemoryRateLimiter(policies);
    return fakeLimiter;
  }
  const live = loadRuntimeConfig(LIVE_KEYS, source);
  return createUpstashRateLimiter({
    url: live.UPSTASH_REDIS_REST_URL,
    token: live.UPSTASH_REDIS_REST_TOKEN,
    namespace: `luxtory:${SURFACE}:${env.VERCEL_ENV ?? 'local'}`,
    policies,
    timeoutMs: live.BOOKING_AUTHORIZATION_LIMITER_TIMEOUT_MS,
  });
}

export interface BookingAuthorizationQuotaDependencies {
  readonly source?: EnvSource;
  /** Injeção nos testes (depois da configuração validada). */
  readonly limiter?: RateLimiter;
}

export function createBookingAuthorizationQuota(
  deps: BookingAuthorizationQuotaDependencies = {},
): (authorizationRef: string | null) => Promise<QuotaDecision> {
  const source = deps.source ?? process.env;
  return async (authorizationRef) => {
    const staffRoleId = STAFF_ROLE_REF.exec(authorizationRef ?? '')?.[1];
    if (staffRoleId === undefined) return 'unavailable';
    let limiter: RateLimiter;
    try {
      const limits = loadRuntimeConfig(COMMON_KEYS, source);
      const policies: RateLimitPolicies = {
        network: {
          limit: limits.BOOKING_AUTHORIZATION_REQUEST_LIMIT,
          windowSeconds: limits.BOOKING_AUTHORIZATION_REQUEST_WINDOW_SECONDS,
        },
        global: {
          limit: limits.BOOKING_AUTHORIZATION_GLOBAL_LIMIT,
          windowSeconds: limits.BOOKING_AUTHORIZATION_GLOBAL_WINDOW_SECONDS,
        },
      };
      limiter = deps.limiter ?? limiterFor(source, policies);
    } catch (error) {
      if (!(error instanceof ConfigurationMissingError)) throw error;
      // Só os nomes das chaves ausentes; nunca valores (TECH-001).
      rootLogger.warn('booking authorization limiter not configured', {
        command: 'request_booking_authorization',
        missing: error.missingKeys.join(','),
      });
      return 'parameter_missing';
    }
    try {
      const decision = await limiter.consume(bookingAuthorizationQuotaKey(staffRoleId));
      return decision.allowed ? 'allowed' : 'limited';
    } catch (error) {
      if (!(error instanceof RateLimiterUnavailableError)) throw error;
      rootLogger.warn('booking authorization limiter unavailable', {
        command: 'request_booking_authorization',
        reason: error.reason,
      });
      return 'unavailable';
    }
  };
}
