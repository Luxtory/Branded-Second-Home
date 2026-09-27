import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Clock } from '@/features/platform';
import type { AuthGateway } from '../../application/ports';
import { isAssuranceLevel, type AssuranceLevel, type VerifiedSession } from '../../domain/session';
import { SESSION_COOKIE_OPTIONS, type CookieJar } from './cookie-jar';

/**
 * Autenticação de teste (ADR-0005 §7, `AUTH_MODE=test`): só local e na CI — a validação de ambiente a recusa quando
 * `VERCEL_ENV` existe. Código de login e TOTP determinísticos; sessão em JWT HS256 assinado com uma chave aleatória
 * por processo, verificada como a real (assinatura e expiração).
 */
export const TEST_AUTH_CODE = '123456';
export const TEST_SESSION_COOKIE = 'lx-test-session';
/**
 * Simula o limite de envio do Supabase Auth (intervalo mínimo por usuário) sem presumir o valor: para este endereço,
 * só o primeiro envio do processo passa; os seguintes respondem `rate_limited`.
 */
export const TEST_RATE_LIMITED_EMAIL = 'limite@luxtory.test';

const SESSION_SECONDS = 3600;
const MS_PER_SECOND = 1000;

interface TestAuthState {
  readonly signingKey: Buffer;
  /** Fatores TOTP por usuário, em memória do processo (o servidor de E2E é um processo só). */
  readonly factors: Map<string, { readonly id: string; verified: boolean }>;
  /** Envios de código para `TEST_RATE_LIMITED_EMAIL` neste processo. */
  rateLimitedSends: number;
}

// Um estado por processo, não por módulo: o `next start` carrega este módulo em bundles separados (páginas e Server
// Actions × route handlers); um token emitido num precisa valer no outro.
const STATE_KEY = Symbol.for('luxtory.identity.testAuth');
const shared = globalThis as typeof globalThis & { [STATE_KEY]?: TestAuthState };
const state: TestAuthState = (shared[STATE_KEY] ??= {
  signingKey: randomBytes(32),
  factors: new Map(),
  rateLimitedSends: 0,
});
const { signingKey, factors } = state;

const TEST_QR_CODE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/>' +
      '<rect x="1" y="1" width="2" height="2"/><rect x="5" y="1" width="2" height="2"/>' +
      '<rect x="1" y="5" width="2" height="2"/></svg>',
  );
const TEST_TOTP_SECRET = 'LUXTORYTESTSECRET';

/** Id determinístico por e-mail (sem guardar o e-mail): o E2E cadastra o papel de staff desse id. */
export function testUserId(email: string): string {
  const hex = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (content: string) => createHmac('sha256', signingKey).update(content).digest();

export function issueTestToken(userId: string, assurance: AssuranceLevel, clock: Clock): string {
  const issuedAt = Math.floor(clock.now().getTime() / MS_PER_SECOND);
  const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: userId,
    aal: assurance,
    role: 'authenticated',
    iat: issuedAt,
    exp: issuedAt + SESSION_SECONDS,
  })}`;
  return `${content}.${sign(content).toString('base64url')}`;
}

export function verifyTestToken(token: string, clock: Clock): VerifiedSession | null {
  const [header, payload, signature] = token.split('.');
  if (header === undefined || payload === undefined || signature === undefined) return null;
  const expected = sign(`${header}.${payload}`);
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  if (typeof claims.sub !== 'string' || !isAssuranceLevel(claims.aal)) return null;
  if (typeof claims.exp !== 'number' || claims.exp * MS_PER_SECOND <= clock.now().getTime())
    return null;
  return { userId: claims.sub, assurance: claims.aal };
}

export function createTestAuthGateway(jar: CookieJar, clock: Clock): AuthGateway {
  const current = () => {
    const token = jar.getAll().find((cookie) => cookie.name === TEST_SESSION_COOKIE)?.value;
    return token === undefined ? null : verifyTestToken(token, clock);
  };
  const store = (value: string, maxAge: number) => {
    jar.setAll(
      [{ name: TEST_SESSION_COOKIE, value, options: { ...SESSION_COOKIE_OPTIONS, maxAge } }],
      {},
    );
  };

  return {
    session: () => Promise.resolve(current()),
    sendLoginCode(email) {
      if (email.trim().toLowerCase() !== TEST_RATE_LIMITED_EMAIL) return Promise.resolve('sent');
      state.rateLimitedSends += 1;
      return Promise.resolve(state.rateLimitedSends === 1 ? 'sent' : 'rate_limited');
    },
    verifyLoginCode(email, code) {
      if (code !== TEST_AUTH_CODE) return Promise.resolve(false);
      store(issueTestToken(testUserId(email), 'aal1', clock), SESSION_SECONDS);
      return Promise.resolve(true);
    },
    verifiedTotpFactor() {
      const session = current();
      const factor = session === null ? undefined : factors.get(session.userId);
      return Promise.resolve(factor?.verified === true ? factor.id : null);
    },
    startTotpEnrollment() {
      const session = current();
      if (session === null) return Promise.reject(new Error('TOTP enrollment without a session'));
      const factor = { id: randomUUID(), verified: false };
      factors.set(session.userId, factor);
      return Promise.resolve({
        factorId: factor.id,
        qrCode: TEST_QR_CODE,
        secret: TEST_TOTP_SECRET,
      });
    },
    verifyTotp(factorId, code) {
      const session = current();
      const factor = session === null ? undefined : factors.get(session.userId);
      if (session === null || factor?.id !== factorId || code !== TEST_AUTH_CODE) {
        return Promise.resolve(false);
      }
      factor.verified = true;
      store(issueTestToken(session.userId, 'aal2', clock), SESSION_SECONDS);
      return Promise.resolve(true);
    },
    signOut() {
      store('', 0);
      return Promise.resolve();
    },
  };
}
