import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RateLimiterUnavailableError,
  retryAfterSeconds,
} from '@/features/platform/application/rate-limit';
import { createMemoryRateLimiter } from '@/features/platform/infrastructure/rate-limit/memory-rate-limiter';
import { pseudonymizeNetwork } from '@/features/platform/infrastructure/rate-limit/network-key';
import { createUpstashRateLimiter } from '@/features/platform/infrastructure/rate-limit/upstash-rate-limiter';

const POLICIES = {
  network: { limit: 2, windowSeconds: 60 },
  global: { limit: 3, windowSeconds: 60 },
} as const;

function manualClock(start = Date.UTC(2026, 9, 10, 12)) {
  let now = start;
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('limitador em memória (local/CI, TECH-057)', () => {
  it('[TECH-057] limite por origem de rede, com Retry-After até sair da janela', async () => {
    const clock = manualClock();
    const limiter = createMemoryRateLimiter(POLICIES, clock);

    await expect(limiter.consume('a')).resolves.toEqual({ allowed: true });
    clock.advance(10_000);
    await expect(limiter.consume('a')).resolves.toEqual({ allowed: true });
    await expect(limiter.consume('a')).resolves.toEqual({ allowed: false, retryAfterSeconds: 50 });
    clock.advance(50_001);
    await expect(limiter.consume('a')).resolves.toEqual({ allowed: true });
  });

  it('[TECH-057] limite global soma todas as origens de rede', async () => {
    const limiter = createMemoryRateLimiter(POLICIES, manualClock());

    for (const key of ['a', 'b', 'c'])
      await expect(limiter.consume(key)).resolves.toEqual({ allowed: true });
    await expect(limiter.consume('d')).resolves.toMatchObject({ allowed: false });
  });

  it('Retry-After nunca é menor que 1 segundo', () => {
    expect(retryAfterSeconds(1000, 1000)).toBe(1);
    expect(retryAfterSeconds(2500, 1000)).toBe(2);
  });
});

describe('pseudonimização da origem de rede (catalog §14.4)', () => {
  it('[TECH-057] HMAC com segredo próprio: estável por segredo, sem o endereço em claro', () => {
    const key = pseudonymizeNetwork('203.0.113.7', 's'.repeat(32));

    expect(key).toBe(pseudonymizeNetwork('203.0.113.7', 's'.repeat(32)));
    expect(key).not.toBe(pseudonymizeNetwork('203.0.113.7', 't'.repeat(32)));
    expect(key).not.toContain('203.0.113.7');
  });
});

describe('limitador Upstash (ADR-0004): falha fechada', () => {
  afterEach(() => vi.unstubAllGlobals());

  const upstash = (timeoutMs = 50) =>
    createUpstashRateLimiter({
      url: 'https://redis.exemplo.test',
      token: 't'.repeat(24),
      namespace: 'luxtory:brand-partner-contact:local',
      policies: POLICIES,
      timeoutMs,
    });

  /** Responde a cada comando REST com `[restantes, limite]`, o retorno do script da janela deslizante. */
  function redisReplying(remaining: number) {
    const bodies: string[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return Promise.resolve(Response.json({ result: [remaining, 2] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    return { bodies };
  }

  it('[TECH-057] chaves no Redis com namespace e identificador pseudonimizado, nunca o IP', async () => {
    const { bodies } = redisReplying(1);
    const networkKey = pseudonymizeNetwork('203.0.113.7', 's'.repeat(32));

    await expect(upstash().consume(networkKey)).resolves.toEqual({ allowed: true });
    const sent = bodies.join('\n');
    expect(sent).toContain(`luxtory:brand-partner-contact:local:network:${networkKey}`);
    expect(sent).toContain('luxtory:brand-partner-contact:local:global:all');
    expect(sent).not.toContain('203.0.113.7');
  });

  it('[TECH-057] limite excedido recusa com Retry-After positivo', async () => {
    redisReplying(-1);

    await expect(upstash().consume('rede')).resolves.toMatchObject({ allowed: false });
    const decision = await upstash().consume('rede');
    expect(decision.allowed ? 0 : decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('[TECH-057] Redis indisponível recusa (não deixa passar)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );

    await expect(upstash().consume('rede')).rejects.toEqual(
      new RateLimiterUnavailableError('backend'),
    );
  });

  it('[TECH-057] sem resposta no prazo recusa por timeout (a biblioteca deixaria passar)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    await expect(upstash(20).consume('rede')).rejects.toEqual(
      new RateLimiterUnavailableError('timeout'),
    );
  });
});
