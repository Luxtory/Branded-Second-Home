import { describe, expect, it, vi } from 'vitest';
import { JobRegistry } from '@/features/platform/application/jobs/registry';
import { DatabaseEnvironmentError } from '@/features/platform/infrastructure/database/connection';
import { ConfigurationMissingError } from '@/features/platform/infrastructure/env';
import { createJobRoute } from '@/features/platform/presentation/jobs';
import { withRoute } from '@/features/platform/presentation/route';
import { captureLogger } from '../../../support/capture-logger';
import { responseValidator, schemaValidator } from '../../../support/openapi';

const SECRET = 's'.repeat(40);
const JOBS_PATH = '/api/jobs/{job}';

function call(options: {
  job?: string;
  authorization?: string | null;
  source?: Record<string, string>;
  outbox?: () => Promise<Record<string, number>>;
}) {
  const { logger, entries } = captureLogger();
  const outbox = vi.fn(options.outbox ?? (() => Promise.resolve({ delivered: 2, failed: 0 })));
  const route = withRoute(
    createJobRoute({
      registry: () => new JobRegistry({ outbox }),
      source: options.source ?? { CRON_SECRET: SECRET },
    }),
    logger,
  );
  const headers = new Headers();
  const authorization =
    options.authorization === undefined ? `Bearer ${SECRET}` : options.authorization;
  if (authorization !== null) headers.set('authorization', authorization);
  const job = options.job ?? 'outbox';
  const response = route(new Request(`http://localhost/api/jobs/${job}`, { headers }), {
    params: Promise.resolve({ job }),
  });
  return { response, outbox, logged: () => JSON.stringify(entries()) };
}

describe('GET /api/jobs/{job} (TECH-090)', () => {
  it('[TECH-090] com o CRON_SECRET executa o job e responde conforme o OpenAPI', async () => {
    const { response, outbox } = call({});
    const result = await response;
    const valid = responseValidator(JOBS_PATH, 'get', 200);

    expect(result.status).toBe(200);
    expect(valid(await result.json()), JSON.stringify(valid.errors)).toBe(true);
    expect(outbox).toHaveBeenCalledOnce();
  });

  it('[TECH-100] segredo ausente ou errado → 401, sem revelar se o job existe', async () => {
    for (const authorization of [null, 'Bearer errado', `Basic ${SECRET}`]) {
      const { response, outbox } = call({ authorization, job: 'nao_existe' });
      const result = await response;

      expect(result.status).toBe(401);
      expect(await result.json()).toMatchObject({ code: 'ERR_UNAUTHENTICATED' });
      expect(outbox).not.toHaveBeenCalled();
    }
  });

  it('[TECH-090] job fora do registro → 404', async () => {
    const result = await call({ job: 'reconciliation' }).response;

    expect(result.status).toBe(404);
    expect(schemaValidator('Error')(await result.json())).toBe(true);
  });

  it('[TECH-001] sem CRON_SECRET o endpoint fica indisponível e o log nomeia a chave', async () => {
    const { response, logged } = call({ source: {} });
    const result = await response;

    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ code: 'ERR_UNAVAILABLE' });
    expect(logged()).toContain('CRON_SECRET');
  });

  it('[TECH-001] configuração do job ausente ou ambiente sem banco → 503 com as chaves no log', async () => {
    const missing = call({
      outbox: () => Promise.reject(new ConfigurationMissingError(['OUTBOX_BATCH_SIZE'])),
    });
    const preview = call({ outbox: () => Promise.reject(new DatabaseEnvironmentError('preview')) });

    expect((await missing.response).status).toBe(503);
    expect(missing.logged()).toContain('OUTBOX_BATCH_SIZE');
    expect((await preview.response).status).toBe(503);
  });

  it('erro inesperado do job vira 500 no schema Error', async () => {
    const result = await call({ outbox: () => Promise.reject(new Error('falha')) }).response;

    expect(result.status).toBe(500);
    expect(await result.json()).toMatchObject({ code: 'ERR_INTERNAL' });
  });
});
