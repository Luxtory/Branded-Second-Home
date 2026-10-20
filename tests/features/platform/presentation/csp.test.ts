import { describe, expect, it } from 'vitest';
import { isSessionPath } from '@/features/identity/presentation/session-proxy';
import {
  contentSecurityPolicy,
  createNonce,
  withForwardedHeaders,
} from '@/features/platform/presentation/csp';
import { isPublicSiteOpen } from '@/features/platform/presentation/public-site';

describe('CSP e portão do site público (ADR-0014)', () => {
  it('[TECH-100] nonce novo a cada requisição; scripts só com nonce e strict-dynamic; sem moldura', () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{24,}$/);
    expect(createNonce()).not.toBe(nonce);
    const policy = contentSecurityPolicy(nonce, {
      development: false,
      secureTransport: true,
    });
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain('unsafe-eval');
    expect(
      contentSecurityPolicy(nonce, {
        development: true,
        secureTransport: false,
      }),
    ).toContain("'unsafe-eval'");
    expect(policy).toContain('upgrade-insecure-requests');
    expect(
      contentSecurityPolicy(nonce, {
        development: false,
        secureTransport: false,
      }),
    ).not.toContain('upgrade-insecure-requests');
  });

  it('[TECH-100] os cabeçalhos da CSP seguem para o render sem alterar os da requisição', () => {
    const original = new Headers({ cookie: 'a=1' });
    const forwarded = withForwardedHeaders(original, { 'x-nonce': 'abc' });
    expect(forwarded.get('x-nonce')).toBe('abc');
    expect(forwarded.get('cookie')).toBe('a=1');
    expect(original.get('x-nonce')).toBeNull();
  });

  it('[ADR-0014] sessão renovada só nas rotas com Auth', () => {
    for (const path of [
      '/entrar',
      '/entrar/mfa',
      '/admin',
      '/admin/catalogo',
      '/v1/admin/home-editions',
    ]) {
      expect(isSessionPath(path), path).toBe(true);
    }
    for (const path of ['/', '/colecao', '/como-funciona', '/administracao', '/v1/health']) {
      expect(isSessionPath(path), path).toBe(false);
    }
  });

  it('[ADR-0014] portão: Production só abre com PUBLIC_SITE=open; fora de Production, aberto', () => {
    expect(isPublicSiteOpen({ VERCEL_ENV: 'production' })).toBe(false);
    expect(isPublicSiteOpen({ VERCEL_ENV: 'production', PUBLIC_SITE: 'open' })).toBe(true);
    expect(isPublicSiteOpen({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isPublicSiteOpen({})).toBe(true);
    expect(() => isPublicSiteOpen({ VERCEL_ENV: 'production', PUBLIC_SITE: 'sim' })).toThrow();
  });
});
