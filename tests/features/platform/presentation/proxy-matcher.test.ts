import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('matcher do proxy (ADR-0014, BP1 — spec catalog §14.6)', () => {
  it('[TECH-057] as páginas Brand Partners passam pelo proxy e recebem CSP/nonce', () => {
    expect(matches('/brand-partner')).toBe(true);
    expect(matches('/brand-partner/como-funciona')).toBe(true);
  });

  it('[TECH-057] os assets reais do kit de logos continuam fora (CSP própria, mais restrita)', () => {
    expect(matches('/brand/logo/horizontal/warm-sand')).toBe(false);
    expect(matches('/brand/logo/icon/moroccan-blue')).toBe(false);
  });

  it('[TECH-100] API JSON pública e jobs continuam fora; Auth e API do Admin continuam dentro', () => {
    expect(matches('/v1/brand-partner-contacts')).toBe(false);
    expect(matches('/v1/health')).toBe(false);
    expect(matches('/api/jobs/outbox')).toBe(false);
    expect(matches('/v1/admin/brand-partners')).toBe(true);
    expect(matches('/entrar')).toBe(true);
    expect(matches('/admin')).toBe(true);
  });

  it('[TECH-100] páginas B2C, Lab, mídia e assets do Next sem mudança', () => {
    for (const page of ['/', '/como-funciona', '/colecao']) expect(matches(page)).toBe(true);
    for (const asset of [
      '/lab',
      '/media/concept-covers/x/640',
      '/_next/static/chunk.js',
      '/favicon.ico',
    ]) {
      expect(matches(asset)).toBe(false);
    }
  });
});
