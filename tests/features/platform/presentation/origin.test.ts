import { describe, expect, it } from 'vitest';
import { isSameOrigin } from '@/features/platform/presentation/origin';

const post = (headers: Record<string, string>) =>
  new Request('http://127.0.0.1:3100/v1/admin/authorization-grants', { method: 'POST', headers });

describe('CSRF por origem (TECH-100)', () => {
  it('[TECH-100] aceita só Origin do mesmo host (X-Forwarded-Host tem precedência sobre Host)', () => {
    expect(isSameOrigin(post({ origin: 'http://app.test', host: 'app.test' }))).toBe(true);
    expect(
      isSameOrigin(
        post({
          origin: 'https://branded-second-home.vercel.app',
          host: 'interno',
          'x-forwarded-host': 'branded-second-home.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('[TECH-100] Origin ausente, de outro host, malformada ou "null" é recusada', () => {
    expect(isSameOrigin(post({ host: 'app.test' }))).toBe(false);
    expect(isSameOrigin(post({ origin: 'https://atacante.test', host: 'app.test' }))).toBe(false);
    expect(isSameOrigin(post({ origin: 'http://app.test.atacante.test', host: 'app.test' }))).toBe(
      false,
    );
    expect(isSameOrigin(post({ origin: 'null', host: 'app.test' }))).toBe(false);
    expect(isSameOrigin(post({ origin: '://', host: 'app.test' }))).toBe(false);
  });
});
