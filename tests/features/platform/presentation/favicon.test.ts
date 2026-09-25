import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from '@/design-system/brand/logo/manifest.json';
import { GET } from '@/app/favicon.ico/route';

describe('GET /favicon.ico', () => {
  it('serve o ícone oficial do kit, byte a byte (sha256 do manifest)', async () => {
    const response = await GET(new Request('http://localhost/favicon.ico'));
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(createHash('sha256').update(body).digest('hex')).toBe(
      manifest.logos['icon/moroccan-blue'].sha256,
    );
  });
});
