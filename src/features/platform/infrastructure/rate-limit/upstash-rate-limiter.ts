import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { Clock } from '../../application/clock';
import {
  RateLimiterUnavailableError,
  retryAfterSeconds,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitPolicies,
  type RateLimitPolicy,
} from '../../application/rate-limit';
import { systemClock } from '../system-clock';

export interface UpstashRateLimiterOptions {
  readonly url: string;
  readonly token: string;
  /** Prefixo das chaves no Redis: aplicação, superfície e ambiente. */
  readonly namespace: string;
  readonly policies: RateLimitPolicies;
  readonly timeoutMs: number;
  readonly clock?: Clock;
}

const GLOBAL_KEY = 'all';

/**
 * Limitador com `@upstash/ratelimit` (ADR-0004): janela deslizante — o script do Redis expira cada chave (PEXPIRE) —,
 * sem analytics, telemetria nem cache local. O `timeout` da biblioteca **deixa passar** quando expira; aqui ele fica
 * desligado e o prazo é nosso: sem resposta no prazo, a tentativa é recusada (TECH-057).
 */
export function createUpstashRateLimiter({
  url,
  token,
  namespace,
  policies,
  timeoutMs,
  clock = systemClock,
}: UpstashRateLimiterOptions): RateLimiter {
  // Um comando por chamada (sem auto-pipelining): as duas checagens já são sequenciais.
  const redis = new Redis({
    url,
    token,
    retry: false,
    enableTelemetry: false,
    enableAutoPipelining: false,
  });
  const limiter = (scope: string, policy: RateLimitPolicy) =>
    new Ratelimit({
      redis,
      prefix: `${namespace}:${scope}`,
      limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
      timeout: 0,
      ephemeralCache: false,
      analytics: false,
      enableProtection: false,
      enableTelemetry: false,
    });
  const network = limiter('network', policies.network);
  const global = limiter('global', policies.global);

  const check = async (ratelimit: Ratelimit, identifier: string): Promise<RateLimitDecision> => {
    const result = await ratelimit.limit(identifier);
    // Sem `timeout` na biblioteca nunca há "timeout"; se houver, a resposta não veio do Redis.
    if (result.reason === 'timeout') throw new RateLimiterUnavailableError('timeout');
    return result.success
      ? { allowed: true }
      : {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(result.reset, clock.now().getTime()),
        };
  };

  const consume = async (networkKey: string): Promise<RateLimitDecision> => {
    const byNetwork = await check(network, networkKey);
    if (!byNetwork.allowed) return byNetwork;
    return check(global, GLOBAL_KEY);
  };

  return {
    async consume(networkKey) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RateLimiterUnavailableError('timeout')), timeoutMs);
      });
      try {
        return await Promise.race([consume(networkKey), deadline]);
      } catch (error) {
        if (error instanceof RateLimiterUnavailableError) throw error;
        throw new RateLimiterUnavailableError('backend');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
