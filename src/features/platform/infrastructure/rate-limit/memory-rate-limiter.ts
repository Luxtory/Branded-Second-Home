import type { Clock } from '../../application/clock';
import {
  retryAfterSeconds,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitPolicies,
  type RateLimitPolicy,
} from '../../application/rate-limit';
import { systemClock } from '../system-clock';

const MS_PER_SECOND = 1000;
const GLOBAL_KEY = 'all';

/**
 * Limitador determinístico em memória (só local e CI; recusado na Vercel pela validação do ambiente): a mesma janela
 * deslizante e as mesmas políticas do adaptador Upstash, num registro de instantes por chave que descarta o que saiu
 * da janela. Guarda só instantes, nunca dados do contato.
 */
export function createMemoryRateLimiter(
  policies: RateLimitPolicies,
  clock: Clock = systemClock,
): RateLimiter {
  const attempts = new Map<string, number[]>();

  const check = (scope: string, policy: RateLimitPolicy): RateLimitDecision => {
    const now = clock.now().getTime();
    const windowMs = policy.windowSeconds * MS_PER_SECOND;
    const recent = (attempts.get(scope) ?? []).filter((at) => at > now - windowMs);
    const [oldest] = recent;
    if (recent.length >= policy.limit && oldest !== undefined) {
      attempts.set(scope, recent);
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(oldest + windowMs, now) };
    }
    attempts.set(scope, [...recent, now]);
    return { allowed: true };
  };

  return {
    consume(networkKey) {
      const byNetwork = check(`network:${networkKey}`, policies.network);
      return Promise.resolve(byNetwork.allowed ? check(GLOBAL_KEY, policies.global) : byNetwork);
    },
  };
}
