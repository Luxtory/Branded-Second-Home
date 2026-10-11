/**
 * Limitador distribuído das escritas públicas (TECH-057, ADR-0002): só contadores técnicos com expiração, chaveados
 * por identificador pseudonimizado. Nunca decide disponibilidade, saldo, preço ou autorização — só recusa excesso.
 */
export interface RateLimitPolicy {
  /** Tentativas aceitas por janela. */
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Limite por origem de rede e limite global da superfície (spec catalog §14.4). */
export interface RateLimitPolicies {
  readonly network: RateLimitPolicy;
  readonly global: RateLimitPolicy;
}

export type RateLimitDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface RateLimiter {
  /** Conta uma tentativa da origem de rede `networkKey` (já pseudonimizada) e do total da superfície. */
  consume(networkKey: string): Promise<RateLimitDecision>;
}

export type RateLimiterFailure = 'timeout' | 'backend';

/** O limitador não respondeu com segurança (rede, Redis, timeout): a escrita é recusada — falha fechada. */
export class RateLimiterUnavailableError extends Error {
  constructor(readonly reason: RateLimiterFailure) {
    super(`rate limiter unavailable: ${reason}`);
    this.name = 'RateLimiterUnavailableError';
  }
}

const MS_PER_SECOND = 1000;

/** Segundos inteiros até `resetAt` (epoch ms), nunca menos de 1 — valor do `Retry-After`. */
export function retryAfterSeconds(resetAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAtMs - nowMs) / MS_PER_SECOND));
}
