import { describe, expect, it } from 'vitest';
import type { AuthCookie, CookieJar } from '@/features/identity/infrastructure/auth/cookie-jar';
import {
  createTestAuthGateway,
  issueTestToken,
  TEST_AUTH_CODE,
  TEST_SESSION_COOKIE,
  testUserId,
  verifyTestToken,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';

const clock = { now: () => new Date('2026-09-15T12:00:00.000Z') };
const later = { now: () => new Date('2026-09-15T13:00:00.000Z') };

function memoryJar(): CookieJar & { readonly written: AuthCookie[] } {
  const cookies = new Map<string, string>();
  const written: AuthCookie[] = [];
  return {
    written,
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) {
        written.push(cookie);
        cookies.set(cookie.name, cookie.value);
      }
    },
  };
}

describe('autenticação de teste (ADR-0005 §7)', () => {
  it('[ADR-0005] código → sessão AAL1; cadastro TOTP → AAL2; sair apaga a sessão', async () => {
    const jar = memoryJar();
    const gateway = createTestAuthGateway(jar, clock);

    expect(await gateway.verifyLoginCode('staff@luxtory.test', '000000')).toBe(false);
    expect(await gateway.verifyLoginCode('Staff@Luxtory.test ', TEST_AUTH_CODE)).toBe(true);
    expect(await gateway.session()).toEqual({
      userId: testUserId('staff@luxtory.test'),
      assurance: 'aal1',
    });
    expect(await gateway.verifiedTotpFactor()).toBeNull();

    const enrollment = await gateway.startTotpEnrollment();
    expect(enrollment.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(await gateway.verifyTotp(enrollment.factorId, '000000')).toBe(false);
    expect(await gateway.verifyTotp('outro-fator', TEST_AUTH_CODE)).toBe(false);
    expect(await gateway.verifyTotp(enrollment.factorId, TEST_AUTH_CODE)).toBe(true);
    expect((await gateway.session())?.assurance).toBe('aal2');
    expect(await gateway.verifiedTotpFactor()).toBe(enrollment.factorId);

    await gateway.signOut();
    expect(await gateway.session()).toBeNull();
    expect(jar.written.every((cookie) => cookie.options.httpOnly === true)).toBe(true);
    expect(jar.written.at(-1)).toMatchObject({
      name: TEST_SESSION_COOKIE,
      value: '',
      options: { maxAge: 0 },
    });
  });

  it('[TECH-050] token adulterado, forjado ou expirado não vira sessão', () => {
    const token = issueTestToken(testUserId('a@luxtory.test'), 'aal1', clock);
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const elevated = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), aal: 'aal2' }),
    ).toString('base64url');

    expect(verifyTestToken(token, clock)).toMatchObject({ assurance: 'aal1' });
    expect(verifyTestToken(`${header}.${elevated}.${signature}`, clock)).toBeNull();
    expect(verifyTestToken(`${header}.${payload}.`, clock)).toBeNull();
    expect(verifyTestToken('não-é-jwt', clock)).toBeNull();
    expect(verifyTestToken(token, later)).toBeNull();
  });

  it('[ADR-0005] id do usuário é determinístico por e-mail e tem formato de UUID', () => {
    expect(testUserId('staff@luxtory.test')).toBe(testUserId(' STAFF@luxtory.test'));
    expect(testUserId('staff@luxtory.test')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('[ADR-0005] cadastro TOTP sem sessão é recusado', async () => {
    await expect(createTestAuthGateway(memoryJar(), clock).startTotpEnrollment()).rejects.toThrow(
      /without a session/,
    );
  });
});
