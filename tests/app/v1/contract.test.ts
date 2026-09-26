import { describe, expect, it } from 'vitest';
import { GET as getHealth } from '@/app/v1/health/route';
import { GET as getVersion } from '@/app/v1/version/route';
import { withRoute } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../support/openapi';

const request = (path: string) => new Request(`http://localhost${path}`);

describe('contrato OpenAPI de /v1 (API-First)', () => {
  it('[TECH-056] /v1/health e /v1/version conformes ao OpenAPI', async () => {
    const health = await getHealth(request('/v1/health'));
    const version = await getVersion(request('/v1/version'));
    const validHealth = responseValidator('/health', 'get', 200);
    const validVersion = responseValidator('/version', 'get', 200);

    expect(health.status).toBe(200);
    expect(version.status).toBe(200);
    expect(validHealth(await health.json()), JSON.stringify(validHealth.errors)).toBe(true);
    expect(validVersion(await version.json()), JSON.stringify(validVersion.errors)).toBe(true);
  });

  it('[TECH-056] erro não tratado vira 500 no schema Error, sem stack trace', async () => {
    const { logger } = captureLogger();
    const failing = withRoute(() => {
      throw new Error('falha interna com detalhe que não pode vazar');
    }, logger);
    const response = await failing(request('/v1/health'));
    const body: unknown = await response.json();
    const validError = schemaValidator('Error');

    expect(response.status).toBe(500);
    expect(validError(body), JSON.stringify(validError.errors)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('falha interna');
  });
});
