import { createHash, timingSafeEqual } from 'node:crypto';
import type { JobRegistry } from '../application/jobs/registry';
import type { LogPort } from '../application/log';
import { DatabaseEnvironmentError } from '../infrastructure/database/connection';
import {
  ConfigurationMissingError,
  EnvValidationError,
  loadRuntimeConfig,
  type EnvSource,
} from '../infrastructure/env';
import { createJobRegistry } from '../infrastructure/jobs/job-registry';
import { errorResponse } from './errors';
import { withRoute, type RouteContext } from './route';

export interface JobRouteParams {
  readonly params: Promise<{ job: string }>;
}

export interface JobRouteDependencies {
  readonly registry: (log: LogPort) => JobRegistry;
  readonly source?: EnvSource;
}

// Hash dos dois lados: comparação em tempo constante mesmo com tamanhos diferentes.
const digest = (value: string) => createHash('sha256').update(value).digest();

function isAuthorized(header: string | null, secret: string): boolean {
  return header !== null && timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

// Configuração ausente ou inválida bloqueia a função com erro explícito (TECH-001) e nomeia só as chaves.
function unavailableKeys(error: unknown): readonly string[] | null {
  if (error instanceof ConfigurationMissingError) return error.missingKeys;
  if (error instanceof EnvValidationError) return error.invalidKeys;
  if (error instanceof DatabaseEnvironmentError) return ['VERCEL_ENV'];
  return null;
}

/** `GET /api/jobs/{job}` (OpenAPI `runJob`): Vercel Cron com `Authorization: Bearer <CRON_SECRET>`. */
export function createJobRoute({ registry, source }: JobRouteDependencies) {
  return async (request: Request, { correlationId, log }: RouteContext, route: JobRouteParams) => {
    let secret: string;
    try {
      secret = loadRuntimeConfig(['CRON_SECRET'], source).CRON_SECRET;
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('job endpoint unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
    if (!isAuthorized(request.headers.get('authorization'), secret)) {
      return errorResponse('ERR_UNAUTHENTICATED', correlationId);
    }
    const { job } = await route.params;
    const run = registry(log).get(job);
    if (run === undefined) return errorResponse('ERR_NOT_FOUND', correlationId);
    try {
      const result = await run();
      log.info('job completed', { job, ...result });
      return Response.json({ job, result }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('job unavailable', { job, keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
  };
}

/** GET /api/jobs/{job} — contrato `runJob` em docs/api/openapi.yaml. */
export const runJob = withRoute(createJobRoute({ registry: (log) => createJobRegistry({ log }) }));
