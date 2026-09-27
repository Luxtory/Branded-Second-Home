import { describe, expect, it } from 'vitest';
import {
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  EnvValidationError,
} from '@/features/platform';
import { createAuthGateway } from '@/features/identity/infrastructure/auth/auth-gateway';
import type { CookieJar } from '@/features/identity/infrastructure/auth/cookie-jar';
import {
  FAKE_LEGACY_ANON_KEY,
  FAKE_SECRET_KEY,
  fakeSupabaseConfig,
} from '../../../support/fake-supabase-config';

const jar: CookieJar = { getAll: () => [], setAll: () => undefined };
const supabase = fakeSupabaseConfig();

describe('escolha do adapter de Auth (ADR-0005 §7, ADR-0008)', () => {
  it('[ADR-0005] autenticação de teste é recusada quando VERCEL_ENV existe', () => {
    for (const VERCEL_ENV of ['production', 'preview', 'development']) {
      expect(() => createAuthGateway(jar, { AUTH_MODE: 'test', VERCEL_ENV })).toThrow(
        EnvValidationError,
      );
      expect(() => createAuthGateway(jar, { AUTH_MODE: 'test', VERCEL_ENV })).toThrow(/AUTH_MODE/);
    }
  });

  it('[ADR-0005] fora da Vercel, AUTH_MODE=test usa o adapter de teste (sem variáveis do Supabase)', async () => {
    await expect(createAuthGateway(jar, { AUTH_MODE: 'test' }).session()).resolves.toBeNull();
  });

  it('[ADR-0007] Auth real é recusado em Preview e Development da Vercel, mesmo com as variáveis', () => {
    for (const VERCEL_ENV of ['preview', 'development']) {
      expect(() => createAuthGateway(jar, { ...supabase, VERCEL_ENV })).toThrow(
        EnvironmentRestrictionError,
      );
    }
  });

  it('[TECH-001] Production sem as variáveis do Supabase falha nomeando só as chaves', () => {
    const attempt = () => createAuthGateway(jar, { VERCEL_ENV: 'production' });

    expect(attempt).toThrow(ConfigurationMissingError);
    expect(attempt).toThrow(/NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it('[TECH-100] só a chave publicável é aceita: anon legada, chave secreta e URL sem https são recusadas', () => {
    const insecureUrl = supabase.NEXT_PUBLIC_SUPABASE_URL.replace('https:', 'http:');
    const cases: [Record<string, string>, string][] = [
      [
        { ...supabase, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_LEGACY_ANON_KEY },
        FAKE_LEGACY_ANON_KEY,
      ],
      [{ ...supabase, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET_KEY }, FAKE_SECRET_KEY],
      [{ ...supabase, NEXT_PUBLIC_SUPABASE_URL: insecureUrl }, insecureUrl],
    ];
    for (const [source, rejectedValue] of cases) {
      const attempt = () => createAuthGateway(jar, { ...source, VERCEL_ENV: 'production' });
      expect(attempt).toThrow(EnvValidationError);
      // O valor recusado nunca aparece na mensagem de erro (TECH-100).
      expect(attempt).not.toThrow(rejectedValue);
    }
    expect(() => createAuthGateway(jar, { ...supabase, VERCEL_ENV: 'production' })).not.toThrow();
  });
});
