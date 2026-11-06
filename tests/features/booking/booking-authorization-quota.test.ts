import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bookingAuthorizationQuotaKey,
  createBookingAuthorizationQuota,
} from '@/features/booking/presentation/booking-authorization-quota';
import { RateLimiterUnavailableError, type RateLimiter } from '@/features/platform';

// G-E4-1 (W13 E4b, spec booking §10.15): limites do runbook, chave pseudônima por papel de staff, falha fechada.
const LIMITS = {
  BOOKING_AUTHORIZATION_REQUEST_LIMIT: '2',
  BOOKING_AUTHORIZATION_REQUEST_WINDOW_SECONDS: '60',
  BOOKING_AUTHORIZATION_GLOBAL_LIMIT: '10',
  BOOKING_AUTHORIZATION_GLOBAL_WINDOW_SECONDS: '60',
  BOOKING_AUTHORIZATION_LIMITER_MODE: 'fake',
};

const recording = (allowed: boolean): RateLimiter & { readonly keys: string[] } => {
  const keys: string[] = [];
  return {
    keys,
    consume: async (key) => {
      keys.push(key);
      return allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 30 };
    },
  };
};

describe('W13 E4b — cota do request_booking_authorization (G-E4-1)', () => {
  it('[G-E4-1] chave = SHA-256 de luxtory:booking-authorization-request:<staff_role_id>, sem segredo', async () => {
    const staffRole = randomUUID();
    const limiter = recording(true);
    const quota = createBookingAuthorizationQuota({ source: LIMITS, limiter });
    expect(await quota(`staff_role:${staffRole}`)).toBe('allowed');
    const expected = createHash('sha256')
      .update(`luxtory:booking-authorization-request:${staffRole}`)
      .digest('hex');
    expect(limiter.keys).toEqual([expected]);
    expect(bookingAuthorizationQuotaKey(staffRole)).toBe(expected);
  });

  it('[G-E4-1] excesso → limited; limitador sem resposta segura → unavailable (falha fechada)', async () => {
    const ref = `staff_role:${randomUUID()}`;
    expect(
      await createBookingAuthorizationQuota({ source: LIMITS, limiter: recording(false) })(ref),
    ).toBe('limited');
    const broken: RateLimiter = {
      consume: async () => {
        throw new RateLimiterUnavailableError('timeout');
      },
    };
    expect(await createBookingAuthorizationQuota({ source: LIMITS, limiter: broken })(ref)).toBe(
      'unavailable',
    );
  });

  it('[TECH-001] limite ausente no ambiente → parameter_missing, sem consumir', async () => {
    const limiter = recording(true);
    const { BOOKING_AUTHORIZATION_GLOBAL_LIMIT: _omitted, ...partial } = LIMITS;
    expect(
      await createBookingAuthorizationQuota({ source: partial, limiter })(
        `staff_role:${randomUUID()}`,
      ),
    ).toBe('parameter_missing');
    expect(limiter.keys).toEqual([]);
  });

  it('[G-E4-1] sem staff_role na decisão do guard → unavailable, sem consumir', async () => {
    const limiter = recording(true);
    const quota = createBookingAuthorizationQuota({ source: LIMITS, limiter });
    expect(await quota(null)).toBe('unavailable');
    expect(await quota(`holding:${randomUUID()}`)).toBe('unavailable');
    expect(limiter.keys).toEqual([]);
  });

  it('[G-E4-1] modo fake (local/CI): conta por papel e recusa a terceira no mesmo papel', async () => {
    const quota = createBookingAuthorizationQuota({ source: LIMITS });
    const a = `staff_role:${randomUUID()}`;
    const b = `staff_role:${randomUUID()}`;
    expect([await quota(a), await quota(a), await quota(a)]).toEqual([
      'allowed',
      'allowed',
      'limited',
    ]);
    expect(await quota(b)).toBe('allowed');
  });
});
