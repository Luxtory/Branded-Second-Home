import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '@/design-system/brand/logo/manifest.json';
import { GET } from '@/app/brand/logo/[family]/[color]/route';

const request = (path: string) => new Request(`http://localhost${path}`);
const params = (family: string, color: string) => ({ params: Promise.resolve({ family, color }) });

describe('GET /brand/logo/<família>/<cor> (ADR-0009)', () => {
  it('[ADR-0003] serve cada logo do kit pela chave do manifest, byte a byte (sha256), com CSP restritiva', async () => {
    for (const [key, logo] of Object.entries(manifest.logos)) {
      const [family = '', color = ''] = key.split('/');
      const response = await GET(request(`/brand/logo/${key}`), params(family, color));
      const body = Buffer.from(await response.arrayBuffer());

      expect(response.status, key).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/svg+xml');
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'; style-src 'unsafe-inline'",
      );
      expect(createHash('sha256').update(body).digest('hex'), key).toBe(logo.sha256);
    }
  });

  it('[TECH-056] chave fora do manifest → 404 no formato Error, sem ler caminho vindo do request', async () => {
    for (const [family, color] of [
      ['horizontal', 'pure-white'],
      ['..', 'manifest.json'],
      ['horizontal', '..%2F..%2Fpackage.json'],
    ] as const) {
      const response = await GET(request('/brand/logo/x/y'), params(family, color));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'ERR_NOT_FOUND' });
    }
  });
});
