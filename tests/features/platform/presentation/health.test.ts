import { describe, expect, it } from 'vitest';
import { createVersionHandler } from '@/features/platform/presentation/health';

const SHA = '53c7d5e0a1b2c3d4e5f60718293a4b5c6d7e8f90';
const request = new Request('http://localhost/v1/version');

describe('GET /v1/version', () => {
  it('expõe o commit do build (VERCEL_GIT_COMMIT_SHA) e a versão curta', async () => {
    const response = await createVersionHandler(() => ({ VERCEL_GIT_COMMIT_SHA: SHA }))(request);

    expect(await response.json()).toEqual({ version: '53c7d5e', commit: SHA });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('sem commit conhecido responde "unknown", sem inventar valor', async () => {
    const response = await createVersionHandler(() => ({}))(request);

    expect(await response.json()).toEqual({ version: 'unknown' });
  });
});
