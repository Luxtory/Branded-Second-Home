import { createServerClient } from '@supabase/ssr';
import type { AuthGateway } from '../../application/ports';
import { isAssuranceLevel, type VerifiedSession } from '../../domain/session';
import { SESSION_COOKIE_OPTIONS, type CookieJar } from './cookie-jar';

export interface SupabaseAuthConfig {
  readonly NEXT_PUBLIC_SUPABASE_URL: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

export class AuthProviderError extends Error {
  constructor(
    readonly operation: string,
    readonly providerCode: string,
  ) {
    super(`Supabase Auth ${operation} failed (${providerCode})`);
    this.name = 'AuthProviderError';
  }
}

const HTTP_TOO_MANY_REQUESTS = 429;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Supabase Auth pelo `@supabase/ssr` (ADR-0008): só o namespace `.auth` sai do cliente — nenhuma consulta a tabelas
 * passa por aqui (ADR-002 do `03`). Um cliente por request.
 */
export function createSupabaseAuthGateway(jar: CookieJar, config: SupabaseAuthConfig): AuthGateway {
  const { auth } = createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => jar.getAll().map(({ name, value }) => ({ name, value })),
        setAll: (cookies, headers) => {
          jar.setAll(cookies, headers);
        },
      },
      cookieOptions: { ...SESSION_COOKIE_OPTIONS, secure: true },
    },
  );

  return {
    async session() {
      // `getClaims()` verifica a assinatura ES256 pelo JWKS; `getSession()` não verifica nada e nunca é usado.
      const { data, error } = await auth.getClaims();
      if (error !== null || data === null) return null;
      const { sub, aal } = data.claims;
      if (!UUID.test(sub) || !isAssuranceLevel(aal)) return null;
      return { userId: sub, assurance: aal } satisfies VerifiedSession;
    },
    async sendLoginCode(email) {
      const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error === null) return 'sent';
      if (error.status === HTTP_TOO_MANY_REQUESTS || error.code === 'over_email_send_rate_limit') {
        return 'rate_limited';
      }
      // E-mail sem conta (cadastro desligado) e demais recusas respondem igual: sem enumerar usuários.
      return 'sent';
    },
    async verifyLoginCode(email, code) {
      const { error } = await auth.verifyOtp({ email, token: code, type: 'email' });
      return error === null;
    },
    async verifiedTotpFactor() {
      const { data, error } = await auth.mfa.listFactors();
      if (error !== null) throw new AuthProviderError('listFactors', error.code ?? 'unknown');
      return data.totp[0]?.id ?? null;
    },
    async startTotpEnrollment() {
      const factors = await auth.mfa.listFactors();
      if (factors.error !== null) {
        throw new AuthProviderError('listFactors', factors.error.code ?? 'unknown');
      }
      // Tentativa anterior abandonada: o fator não verificado é removido antes de um novo cadastro.
      for (const factor of factors.data.all) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          await auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error } = await auth.mfa.enroll({ factorType: 'totp' });
      if (error !== null) throw new AuthProviderError('enroll', error.code ?? 'unknown');
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    async verifyTotp(factorId, code) {
      const { error } = await auth.mfa.challengeAndVerify({ factorId, code });
      return error === null;
    },
    async signOut() {
      await auth.signOut({ scope: 'local' });
    },
  };
}
