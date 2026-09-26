import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';

const cookieJar = new Map<string, string>();

// Fora de um request do Next: cookies e headers do request atual vêm deste dublê.
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => cookieJar.set(name, value),
    }),
  headers: () => Promise.resolve(new Headers()),
}));

const { getStaffAccess } = await import('@/features/identity/presentation/staff-access');

describe('acesso ao Admin quando o ambiente não oferece Auth ou banco (ADR-0007, TECH-001)', () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('[ADR-0007] Preview da Vercel: Auth real recusado → "indisponível", sem erro 500', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('AUTH_MODE', '');

    await expect(getStaffAccess()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('[TECH-001] sessão AAL2 sem DATABASE_URL → "indisponível" (os papéis vêm do banco)', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('DATABASE_URL', '');
    const clock = { now: () => new Date() };
    cookieJar.set(
      TEST_SESSION_COOKIE,
      issueTestToken('00000000-0000-4000-8000-0000000000b1', 'aal2', clock),
    );

    await expect(getStaffAccess()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('[TECH-050] sem sessão, a resolução nem consulta o banco: anônimo', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AUTH_MODE', 'test');
    vi.stubEnv('DATABASE_URL', '');

    await expect(getStaffAccess()).resolves.toEqual({ kind: 'anonymous' });
  });
});
