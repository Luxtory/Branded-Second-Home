import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CookieJar } from '@/features/identity/infrastructure/auth/cookie-jar';
import { createSupabaseAuthGateway } from '@/features/identity/infrastructure/auth/supabase-auth-gateway';
import { fakeSupabaseConfig } from '../../../support/fake-supabase-config';

const config = fakeSupabaseConfig();
const jar: CookieJar = { getAll: () => [], setAll: () => undefined };
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;

function authResponse(status: number, body: object) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adapter do Supabase Auth (ADR-0008)', () => {
  it('[TECH-050] sem cookie de sessão não há sessão (nada é presumido)', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(createSupabaseAuthGateway(jar, config).session()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('[TECH-100] login: e-mail sem conta responde igual ao envio (sem enumerar); limite → rate_limited', async () => {
    vi.stubGlobal(
      'fetch',
      authResponse(HTTP_UNPROCESSABLE, {
        code: 'otp_disabled',
        msg: 'Signups not allowed for otp',
      }),
    );
    await expect(
      createSupabaseAuthGateway(jar, config).sendLoginCode('x@luxtory.test'),
    ).resolves.toBe('sent');

    vi.stubGlobal(
      'fetch',
      authResponse(HTTP_TOO_MANY, { code: 'over_email_send_rate_limit', msg: 'limit' }),
    );
    await expect(
      createSupabaseAuthGateway(jar, config).sendLoginCode('x@luxtory.test'),
    ).resolves.toBe('rate_limited');
  });

  it('[TECH-050] código recusado pelo Supabase não autentica', async () => {
    vi.stubGlobal(
      'fetch',
      authResponse(403, { code: 'otp_expired', msg: 'Token has expired or is invalid' }),
    );

    await expect(
      createSupabaseAuthGateway(jar, config).verifyLoginCode('x@luxtory.test', '123456'),
    ).resolves.toBe(false);
  });
});
