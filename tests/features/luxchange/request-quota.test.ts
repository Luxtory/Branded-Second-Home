import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createRequestQuota,
  requestQuotaKey,
} from '@/features/luxchange/presentation/request-quota';
import { loadEnv, RateLimiterUnavailableError, type RateLimiter } from '@/features/platform';

// W21 E3 (TECH-100; STRIDE T-2111, T-2113): limitador existente reaproveitado — limites do runbook por superfície, chave
// pseudônima por usuário, namespaces separados de leitura e pagamento, falha fechada.
const LIMITS = {
  LUXCHANGE_REQUEST_READ_LIMIT: '2',
  LUXCHANGE_REQUEST_READ_WINDOW_SECONDS: '60',
  LUXCHANGE_REQUEST_SEND_LIMIT: '1',
  LUXCHANGE_REQUEST_SEND_WINDOW_SECONDS: '60',
  LUXCHANGE_REQUEST_GLOBAL_LIMIT: '100',
  LUXCHANGE_REQUEST_GLOBAL_WINDOW_SECONDS: '60',
  LUXCHANGE_REQUEST_LIMITER_MODE: 'fake',
};

const recording = (allowed: boolean): RateLimiter & { readonly keys: string[] } => {
  const keys: string[] = [];
  return {
    keys,
    consume: async (key) => {
      keys.push(key);
      return allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 42 };
    },
  };
};

describe('W21 E3 — limite das superfícies da Request (TECH-100)', () => {
  it('[TECH-100] chave = SHA-256 de luxtory:<superfície>:<user_id>, sem segredo e sem o id em claro', async () => {
    const user = randomUUID();
    const limiter = recording(true);
    const quota = createRequestQuota({ source: LIMITS, limiter: () => limiter });
    expect(await quota('read', user)).toEqual({ status: 'allowed' });
    expect(await quota('send', user)).toEqual({ status: 'allowed' });
    const hash = (surface: string) =>
      createHash('sha256').update(`luxtory:${surface}:${user}`).digest('hex');
    expect(limiter.keys).toEqual([hash('luxchange-request-read'), hash('luxchange-request-send')]);
    expect(requestQuotaKey('read', user)).toBe(hash('luxchange-request-read'));
    expect(limiter.keys.join()).not.toContain(user);
  });

  it('[TECH-100] excesso → limited com retry-after; limitador sem resposta segura → unavailable', async () => {
    const user = randomUUID();
    expect(
      await createRequestQuota({ source: LIMITS, limiter: () => recording(false) })('send', user),
    ).toEqual({ status: 'limited', retryAfterSeconds: 42 });
    const broken: RateLimiter = {
      consume: async () => {
        throw new RateLimiterUnavailableError('backend');
      },
    };
    expect(
      await createRequestQuota({ source: LIMITS, limiter: () => broken })('read', user),
    ).toEqual({ status: 'unavailable' });
  });

  it('[TECH-001] limites ausentes → parameter_missing, sem consumir', async () => {
    const limiter = recording(true);
    const partial: Record<string, string> = { ...LIMITS };
    delete partial['LUXCHANGE_REQUEST_SEND_LIMIT'];
    const quota = createRequestQuota({ source: partial, limiter: () => limiter });
    expect(await quota('send', randomUUID())).toEqual({ status: 'parameter_missing' });
    expect(limiter.keys).toEqual([]);
  });

  it('[TECH-100] modo fake (local/CI): conta por usuário e por superfície; recusado na Vercel', async () => {
    const quota = createRequestQuota({ source: LIMITS });
    const [a, b] = [randomUUID(), randomUUID()];
    expect((await quota('read', a)).status).toBe('allowed');
    expect((await quota('read', a)).status).toBe('allowed');
    expect((await quota('read', a)).status).toBe('limited');
    expect((await quota('read', b)).status).toBe('allowed');
    expect((await quota('send', a)).status).toBe('allowed');
    expect((await quota('send', a)).status).toBe('limited');
    expect(() =>
      loadEnv({ LUXCHANGE_REQUEST_LIMITER_MODE: 'fake', VERCEL_ENV: 'preview' }),
    ).toThrow();
  });
});
